"""OmniCore API — AI arbitration infrastructure for escrow.

Flow: create escrow (locks funds in the C++ engine) -> attach contract ->
upload evidence documents -> AI review routes the transaction:

  RELEASE  auto-settles (if confidence >= threshold)
  PENDING  stays locked; missing documents are requested
  DISPUTE  stays locked; a case file is prepared for a human arbitrator

Money only ever moves through the C++ engine. The AI routes; it never pays.
Runs fully offline in mock mode until FIREWORKS_API_KEY is set (see app/ai.py).
"""
from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import engine_client as engine
from .ai import mock_mode_active
from .agents import (arbitration_agent, compliance_agent, contract_agent,
                     verification_agent)

app = FastAPI(title="OmniCore API", version="0.2")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"]
)

# --- Day-1 store: in-memory, keyed by engine escrow id. -----------------
ESCROWS: dict[str, dict] = {}


class CreateEscrow(BaseModel):
    buyer_account: str
    seller_account: str
    amount_cents: int
    description: str = ""
    contract_text: str  # Day 3: replaced by PDF upload


class UploadDocument(BaseModel):
    name: str
    text: str


class Approve(BaseModel):
    approved_by: str          # arbitrator/approver name — goes in the audit trail
    resolution_note: str = ""  # arbitrator's reasoning for dispute rulings


@app.get("/health")
async def health():
    return {
        "api": "ok",
        "engine": "ok" if await engine.health() else "unreachable",
        "ai": "mock (no API key — offline mode)" if mock_mode_active() else "fireworks",
    }


@app.post("/escrows")
async def create_escrow(body: CreateEscrow):
    try:
        locked = await engine.lock_funds(
            body.buyer_account, body.seller_account, body.amount_cents
        )
    except engine.EngineError as e:
        raise HTTPException(400, str(e))

    eid = locked["id"]
    ESCROWS[eid] = {
        "engine": locked,
        "description": body.description,
        "contract_text": body.contract_text,
        "documents": [],
        "review": None,      # filled by /review
        "status": "LOCKED",  # LOCKED -> RELEASE|PENDING|DISPUTE -> RELEASED|REFUNDED
        "case_file": None,   # assembled on DISPUTE
        "released": False,
        "timeline": [{"event": "created_and_locked", "detail": locked}],
    }
    return {"escrow_id": eid, "status": "LOCKED"}



@app.get("/escrows")
async def list_escrows():
    """Summaries for the dashboard, newest first."""
    out = []
    for eid, esc in ESCROWS.items():
        out.append({
            "id": eid,
            "buyer_id": esc["engine"]["buyer_id"],
            "seller_id": esc["engine"]["seller_id"],
            "created_at": esc["engine"]["created_at"],
            "description": esc["description"],
            "amount_cents": esc["engine"]["amount_cents"],
            "status": esc["status"],
            "documents": len(esc["documents"]),
            "confidence": (esc["review"] or {}).get("arbitration", {}).get("confidence"),
        })
    return list(reversed(out))


@app.get("/stats")
async def stats():
    """Engine totals for the dashboard cards."""
    try:
        return await engine.stats()
    except engine.EngineError as e:
        raise HTTPException(502, str(e))


@app.get("/escrows/{eid}")
async def get_escrow(eid: str):
    esc = ESCROWS.get(eid)
    if not esc:
        raise HTTPException(404, "escrow not found")
    return esc


@app.post("/escrows/{eid}/documents")
async def upload_document(eid: str, body: UploadDocument):
    esc = ESCROWS.get(eid)
    if not esc:
        raise HTTPException(404, "escrow not found")
    esc["documents"].append({"name": body.name, "text": body.text})
    _evidence_changed(esc)
    esc["timeline"].append({"event": "document_uploaded", "detail": body.name})
    return {"documents": [d["name"] for d in esc["documents"]]}


@app.delete("/escrows/{eid}/documents/{index}")
async def remove_document(eid: str, index: int):
    """Mistakes happen — documents can be removed until the escrow settles."""
    esc = ESCROWS.get(eid)
    if not esc:
        raise HTTPException(404, "escrow not found")
    if esc["released"]:
        raise HTTPException(400, "escrow already settled — evidence is frozen")
    if index < 0 or index >= len(esc["documents"]):
        raise HTTPException(404, "document not found")
    removed = esc["documents"].pop(index)
    _evidence_changed(esc)
    esc["timeline"].append({"event": "document_removed", "detail": removed["name"]})
    return {"documents": [d["name"] for d in esc["documents"]]}


def _evidence_changed(esc: dict):
    """Evidence changed after a review -> that review no longer speaks for
    the evidence. Ruling is kept for the audit trail but can't move money."""
    if esc.get("review"):
        esc["review_stale"] = True
        esc["status"] = "LOCKED"


@app.post("/escrows/{eid}/documents/file")
async def upload_document_file(eid: str, file: UploadFile):
    """Real-file upload: PDF (text extracted) or plain text."""
    esc = ESCROWS.get(eid)
    if not esc:
        raise HTTPException(404, "escrow not found")
    if esc["released"]:
        raise HTTPException(400, "escrow already settled — evidence is frozen")
    raw = await file.read()
    name = (file.filename or "document").rsplit(".", 1)[0]
    if (file.filename or "").lower().endswith(".pdf"):
        try:
            import io
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(raw))
            text = "\n".join(page.extract_text() or "" for page in reader.pages).strip()
        except Exception as e:
            raise HTTPException(400, f"could not read PDF: {e}")
        if not text:
            raise HTTPException(400, "no extractable text — scanned PDFs need OCR "
                                     "(on the roadmap); use a digital PDF or paste text")
    else:
        try:
            text = raw.decode("utf-8", errors="replace").strip()
        except Exception:
            raise HTTPException(400, "unsupported file type — upload .pdf or .txt")
    esc["documents"].append({"name": name, "text": text})
    _evidence_changed(esc)
    esc["timeline"].append({"event": "document_uploaded",
                            "detail": f"{name} ({file.filename})"})
    return {"documents": [d["name"] for d in esc["documents"]],
            "extracted_chars": len(text)}


@app.post("/escrows/{eid}/review")
async def run_review(eid: str):
    """The agent pipeline: contract -> verification+risk -> arbitration."""
    esc = ESCROWS.get(eid)
    if not esc:
        raise HTTPException(404, "escrow not found")
    if not esc["documents"]:
        raise HTTPException(400, "upload at least one document before review")

    contract = await contract_agent.run(esc["contract_text"])
    verification = await verification_agent.run(
        contract.get("release_conditions", []), esc["documents"]
    )
    ruling = await arbitration_agent.run(contract, verification)
    # Advisory only — compliance never routes the transaction.
    compliance = await compliance_agent.run(contract, esc["documents"])

    esc["review"] = {
        "contract_analysis": contract,
        "verification": verification,
        "arbitration": ruling,
        "compliance": compliance,
    }
    outcome = ruling.get("decision", "PENDING")
    esc["status"] = outcome
    esc["review_stale"] = False
    esc["timeline"].append({"event": "ai_review_completed", "detail": outcome})

    if outcome == "DISPUTE":
        # The AI prepares the case; the human doesn't start from scratch.
        esc["case_file"] = {
            "reason": ruling.get("disputed_items", []),
            "explanation": ruling.get("explanation", ""),
            "discrepancies": verification.get("discrepancies", []),
            "conditions": verification.get("condition_results", []),
            "documents": [d["name"] for d in esc["documents"]],
            "contract_summary": contract.get("summary", ""),
            "awaiting": "human arbitrator ruling (release or refund)",
        }
    elif outcome == "PENDING":
        for doc in ruling.get("missing_evidence", []):
            esc["timeline"].append({"event": "document_requested", "detail": doc})

    return esc["review"]


@app.post("/escrows/{eid}/release")
async def release(eid: str, body: Approve | None = None):
    """Money moves here — and only here.

    RELEASE + confidence >= threshold  -> auto-settle, no human needed.
    RELEASE below threshold            -> human approval required.
    PENDING                            -> blocked; upload evidence, re-review.
    DISPUTE                            -> only a named human arbitrator may rule.
    """
    esc = ESCROWS.get(eid)
    if not esc:
        raise HTTPException(404, "escrow not found")
    if esc["released"]:
        raise HTTPException(400, "already settled")
    review = esc.get("review")
    if not review:
        raise HTTPException(400, "run AI review before releasing")
    if esc.get("review_stale"):
        raise HTTPException(409, "evidence changed since the last review — "
                                 "run the AI review again before settling")

    ruling = review["arbitration"]
    outcome = ruling.get("decision")
    human = body.approved_by if body else None

    if outcome == "PENDING":
        raise HTTPException(
            403, "PENDING: missing evidence — upload the requested documents "
                 f"({', '.join(ruling.get('missing_evidence', []) or ['see review'])}) "
                 "and run review again",
        )
    if outcome == "DISPUTE" and not human:
        raise HTTPException(
            403, "DISPUTE: conflicting evidence — only a human arbitrator may "
                 "settle this escrow (provide approved_by and resolution_note)",
        )
    if outcome == "RELEASE" and not ruling.get("auto_release_eligible") and not human:
        raise HTTPException(
            403, f"RELEASE at {ruling.get('confidence')}% confidence is below the "
                 "auto-release threshold — human approval required",
        )

    try:
        settled = await engine.release_funds(eid)
    except engine.EngineError as e:
        raise HTTPException(400, str(e))

    esc["released"] = True
    esc["engine"] = settled
    esc["status"] = "RELEASED"
    esc["timeline"].append({
        "event": "funds_released",
        "detail": {
            "by": human or "auto (arbitration agent)",
            "confidence": ruling.get("confidence"),
            "resolution_note": (body.resolution_note if body else "") or None,
        },
    })
    return {"escrow_id": eid, "status": "RELEASED", "released_by": human or "auto"}


@app.post("/escrows/{eid}/refund")
async def refund(eid: str, body: Approve):
    """Arbitrator rules for the buyer. Always requires a named human."""
    esc = ESCROWS.get(eid)
    if not esc:
        raise HTTPException(404, "escrow not found")
    if esc["released"]:
        raise HTTPException(400, "already settled")
    try:
        settled = await engine.refund_buyer(eid)
    except engine.EngineError as e:
        raise HTTPException(400, str(e))
    esc["released"] = True
    esc["engine"] = settled
    esc["status"] = "REFUNDED"
    esc["timeline"].append({
        "event": "refunded",
        "detail": {"by": body.approved_by,
                   "resolution_note": body.resolution_note or None},
    })
    return {"escrow_id": eid, "status": "REFUNDED"}


class PreflightRequest(BaseModel):
    contract_text: str
    description: str = ""


@app.post("/compliance/preflight")
async def compliance_preflight(body: PreflightRequest):
    """Pre-lock compliance check — runs BEFORE any money is locked.

    Reads the contract, infers the corridor, and reports what the corridor
    typically requires, what the contract is missing, and any red flags —
    so gaps are fixed before funds lock, not discovered after.
    The user decides whether to proceed; this informs, it doesn't rule.
    """
    if not body.contract_text.strip():
        raise HTTPException(400, "contract_text is required")
    contract = await contract_agent.run(body.contract_text)
    compliance = await compliance_agent.run(contract, documents=[])
    return {
        "contract_summary": contract.get("summary"),
        "parties": contract.get("parties"),
        "release_conditions": contract.get("release_conditions", []),
        "red_flags": contract.get("red_flags", []),
        "corridor": compliance.get("corridor"),
        "advisories": compliance.get("advisories", []),
        "disclaimer": compliance.get("disclaimer"),
    }


@app.post("/demo/seed")
async def seed_demo():
    """Create the two demo accounts so the frontend has something to show."""
    buyer = await engine.create_account("Bryn Industries", 50_000_000)   # $500k
    seller = await engine.create_account("Global Machinery Ltd", 0)
    return {"buyer": buyer, "seller": seller}

DEMO_CONTRACT = """SALES CONTRACT — No. SC-2026-0341

Buyer: Bryn Industries (Harare, Zimbabwe)
Seller: Global Machinery Ltd (Shanghai, China)

1. GOODS: 100 (one hundred) industrial lathe machines, model GM-440.
2. PRICE: USD 250,000.00 total, held in escrow at contract signing.
3. DELIVERY: FOB Shanghai Port no later than June 15, 2026.
4. INSPECTION: Goods must pass third-party inspection by an accredited inspection company; a signed Inspection Report is required.
5. CUSTOMS: Seller provides export customs clearance documentation.
6. RELEASE OF FUNDS: Escrowed funds are released to Seller only when all of the following are evidenced: (a) Bill of Lading confirming shipment of all 100 units, (b) passed Inspection Report, (c) Commercial Invoice matching the contract price, (d) export customs clearance certificate.
7. DISPUTES: Any discrepancy suspends release pending review."""

DEMO_DOCS = {
    "invoice_clean": {"name": "Commercial_Invoice",
        "text": "COMMERCIAL INVOICE #GM-4411\nSeller: Global Machinery Ltd | Buyer: Bryn Industries\nGoods: 100 x industrial lathe machine GM-440\nTotal: USD 250,000.00 | Terms: FOB Shanghai\nDate: June 10, 2026 | Signed: L. Wei, Sales Director"},
    "invoice_mismatched": {"name": "Commercial_Invoice",
        "text": "COMMERCIAL INVOICE #GM-4412\nSeller: Global Machinery Ltd | Buyer: Bryn Industries\nGoods: 80 x industrial lathe machine GM-440\nTotal: USD 250,000.00 | Terms: FOB Shanghai\nDate: June 10, 2026 | Signed: L. Wei, Sales Director"},
    "bill_of_lading": {"name": "Bill_of_Lading",
        "text": "BILL OF LADING #BL-88213\nCarrier: COSCO Shipping | Vessel: MV Ocean Harmony\nPort of loading: Shanghai | Port of discharge: Durban (transit to Harare)\nCargo: 100 crates, industrial lathe machines GM-440, gross 84,000 kg\nShipped on board: June 12, 2026 | Consignee: Bryn Industries"},
    "inspection": {"name": "Inspection_Report",
        "text": "INSPECTION REPORT #IR-5520 — PASSED\nInspector: SGS Shanghai | Date: June 11, 2026\nScope: 100 units GM-440 industrial lathes, contract SC-2026-0341\nResult: All 100 units conform to specification. PASSED.\nSigned: Chen Ming, Lead Inspector, SGS"},
    "customs": {"name": "Customs_Certificate",
        "text": "EXPORT CUSTOMS CLEARANCE CERTIFICATE #CC-901\nIssued by Shanghai Customs, June 13, 2026\nCargo: 100 crates GM-440 industrial lathe machines, contract SC-2026-0341\nStatus: CLEARED FOR EXPORT"},
}


async def _ensure_demo_accounts():
    try:
        await engine.get_account("ACC-1")
    except engine.EngineError:
        await engine.create_account("Bryn Industries", 50_000_000)
        await engine.create_account("Global Machinery Ltd", 0)


@app.post("/demo/scenario/{kind}")
async def demo_scenario(kind: str):
    """One click: seeds accounts, creates an escrow, uploads the right docs.

    kind = clean    -> routes RELEASE after review
    kind = pending  -> only the invoice uploaded, routes PENDING
    kind = dispute  -> mismatched invoice (80 of 100), routes DISPUTE
    """
    docsets = {
        "clean": ["invoice_clean", "bill_of_lading", "inspection", "customs"],
        "pending": ["invoice_clean"],
        "dispute": ["invoice_mismatched", "bill_of_lading", "inspection", "customs"],
    }
    if kind not in docsets:
        raise HTTPException(400, "kind must be clean, pending, or dispute")
    await _ensure_demo_accounts()
    created = await create_escrow(CreateEscrow(
        buyer_account="ACC-1", seller_account="ACC-2", amount_cents=25_000_000,
        description=f"Purchase of 100 GM-440 industrial lathe machines ({kind} demo)",
        contract_text=DEMO_CONTRACT,
    ))
    eid = created["escrow_id"]
    for key in docsets[kind]:
        d = DEMO_DOCS[key]
        await upload_document(eid, UploadDocument(name=d["name"], text=d["text"]))
    return {"escrow_id": eid, "scenario": kind,
            "documents": [DEMO_DOCS[k]["name"] for k in docsets[kind]]}

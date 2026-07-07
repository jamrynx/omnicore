"""OmniCore API — AI arbitration infrastructure for escrow.

Flow: create escrow (locks funds in the C++ engine) -> attach contract ->
upload evidence documents -> AI review routes the transaction:

  RELEASE  auto-settles (if confidence >= threshold)
  PENDING  stays locked; missing documents are requested
  DISPUTE  stays locked; a case file is prepared for a human arbitrator

Money only ever moves through the C++ engine. The AI routes; it never pays.
Runs fully offline in mock mode until FIREWORKS_API_KEY is set (see app/ai.py).
"""
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import engine_client as engine
from .ai import mock_mode_active
from .agents import arbitration_agent, contract_agent, verification_agent

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
    esc["timeline"].append({"event": "document_uploaded", "detail": body.name})
    return {"documents": [d["name"] for d in esc["documents"]]}


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

    esc["review"] = {
        "contract_analysis": contract,
        "verification": verification,
        "arbitration": ruling,
    }
    outcome = ruling.get("decision", "PENDING")
    esc["status"] = outcome
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


@app.post("/demo/seed")
async def seed_demo():
    """Create the two demo accounts so the frontend has something to show."""
    buyer = await engine.create_account("Bryn Industries", 50_000_000)   # $500k
    seller = await engine.create_account("Global Machinery Ltd", 0)
    return {"buyer": buyer, "seller": seller}

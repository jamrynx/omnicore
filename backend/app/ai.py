"""Fireworks AI client with MOCK MODE.

Mock mode is ON automatically when FIREWORKS_API_KEY is missing, or force it
with OMNICORE_MOCK=1. Mocks return realistic agent JSON and are scenario-aware:
they detect the mismatched demo invoice (80 vs 100 units) and produce a
DISPUTE, so the entire golden path — all three outcomes — works offline.

When credits arrive: put the key in .env. That's the whole switch.
"""
import json
import os

import httpx

FIREWORKS_URL = "https://api.fireworks.ai/inference/v1/chat/completions"
# Swap freely — a Gemma model qualifies for the side prize:
#   accounts/fireworks/models/gemma2-9b-it
MODEL = os.getenv("OMNICORE_MODEL", "accounts/fireworks/models/llama-v3p1-70b-instruct")


class AIError(RuntimeError):
    pass


def mock_mode_active() -> bool:
    return os.getenv("OMNICORE_MOCK") == "1" or not os.getenv("FIREWORKS_API_KEY")


async def ask_json(system: str, user: str, agent: str = "", timeout: float = 60.0) -> dict:
    """Send a prompt, force a JSON-only reply, parse it, return a dict."""
    if mock_mode_active():
        return _mock(agent, user)

    payload = {
        "model": MODEL,
        "max_tokens": 2048,
        "temperature": 0.1,  # verification wants determinism, not creativity
        "messages": [
            {"role": "system", "content": system + "\nRespond with ONLY a valid JSON object. No markdown fences, no commentary."},
            {"role": "user", "content": user},
        ],
    }
    async with httpx.AsyncClient(timeout=timeout) as client:
        r = await client.post(
            FIREWORKS_URL,
            headers={"Authorization": f"Bearer {os.environ['FIREWORKS_API_KEY']}"},
            json=payload,
        )
    if r.status_code != 200:
        raise AIError(f"Fireworks API {r.status_code}: {r.text[:300]}")

    text = r.json()["choices"][0]["message"]["content"].strip()
    if text.startswith("```"):  # models sometimes fence JSON despite instructions
        text = text.strip("`")
        if text.startswith("json"):
            text = text[4:]
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise AIError(f"Model returned non-JSON output: {text[:300]}") from e


# ---------------------------------------------------------------------------
# Mock brain — scenario-aware canned responses for offline development.
# ---------------------------------------------------------------------------

def _mock(agent: str, user: str) -> dict:
    if agent == "contract":
        return _mock_contract()
    if agent == "verification":
        # Scan only the uploaded documents, not the conditions text —
        # otherwise "evidence_needed: Bill of Lading" reads as a document.
        docs = user.split("UPLOADED DOCUMENTS:")[-1].upper()
        return _mock_verification(docs)
    if agent == "arbitration":
        return _mock_arbitration(user)
    raise AIError(f"no mock for agent '{agent}'")


def _mock_contract() -> dict:
    return {
        "summary": "Sale of 100 GM-440 industrial lathe machines for USD 250,000, "
                   "FOB Shanghai, funds escrowed until delivery, inspection, "
                   "invoice match and customs clearance are evidenced.",
        "total_amount": "USD 250,000.00",
        "parties": {"buyer": "Bryn Industries", "seller": "Global Machinery Ltd"},
        "release_conditions": [
            {"id": "cond_1", "title": "Goods shipped",
             "requirement": "All 100 units shipped FOB Shanghai by June 15, 2026",
             "evidence_needed": "Bill of Lading"},
            {"id": "cond_2", "title": "Inspection passed",
             "requirement": "Third-party inspection of all 100 units, signed report",
             "evidence_needed": "Inspection Report"},
            {"id": "cond_3", "title": "Invoice matches contract",
             "requirement": "Commercial Invoice for 100 units at USD 250,000",
             "evidence_needed": "Commercial Invoice"},
            {"id": "cond_4", "title": "Customs cleared",
             "requirement": "Export customs clearance documentation",
             "evidence_needed": "Customs clearance certificate"},
        ],
        "deadlines": ["June 15, 2026 — latest shipment date"],
        "red_flags": [],
        "confidence": 97,
    }


def _mock_verification(u: str) -> dict:
    has_bol = "BILL OF LADING" in u
    has_insp = "INSPECTION REPORT" in u
    has_inv = "COMMERCIAL INVOICE" in u
    has_customs = "CUSTOMS" in u and "CLEARANCE" in u and "CERTIFICATE" in u
    qty_mismatch = "80 X" in u  # the mismatched demo invoice

    def cond(cid, ok, evidence, source):
        return {"id": cid, "status": "met" if ok else "insufficient_evidence",
                "evidence": evidence if ok else "No document evidences this condition.",
                "source_document": source if ok else None}

    results = [
        cond("cond_1", has_bol,
             "BL-88213: 100 crates GM-440 shipped on board June 12, 2026, Shanghai.",
             "Bill_of_Lading"),
        cond("cond_2", has_insp,
             "IR-5520 (SGS): all 100 units conform to specification — PASSED.",
             "Inspection_Report"),
        cond("cond_3", has_inv and not qty_mismatch,
             "Invoice GM-4411: 100 x GM-440, USD 250,000, FOB Shanghai.",
             "Commercial_Invoice"),
        cond("cond_4", has_customs,
             "Export customs clearance certificate on file.",
             "Customs_Certificate"),
    ]
    discrepancies = []
    if qty_mismatch:
        results[2] = {
            "id": "cond_3", "status": "not_met",
            "evidence": "Invoice GM-4412 bills USD 250,000 for only 80 units; "
                        "contract SC-2026-0341 specifies 100 units.",
            "source_document": "Commercial_Invoice",
        }
        discrepancies.append({
            "severity": "high",
            "description": "Quantity conflict: Commercial Invoice lists 80 units at "
                           "full contract price (USD 250,000) while the contract and "
                           "Bill of Lading both reference 100 units. Possible "
                           "short-shipment or billing error.",
        })
    return {
        "condition_results": results,
        "discrepancies": discrepancies,
        "documents_reviewed": [n for n, present in
                               [("Commercial_Invoice", has_inv),
                                ("Bill_of_Lading", has_bol),
                                ("Inspection_Report", has_insp),
                                ("Customs_Certificate", has_customs)] if present],
        "confidence": 88 if qty_mismatch else (95 if all(r["status"] == "met" for r in results) else 90),
    }


def _mock_arbitration(user: str) -> dict:
    # Parse the actual verification JSON embedded in the prompt.
    try:
        verification = json.loads(user.split("VERIFICATION RESULTS:")[-1].strip())
    except json.JSONDecodeError:
        verification = {}
    results = verification.get("condition_results", [])
    high_risk = any(d.get("severity") == "high"
                    for d in verification.get("discrepancies", []))
    conflicts = [r for r in results if r.get("status") == "not_met"]
    unmet = [r for r in results if r.get("status") == "insufficient_evidence"]

    if high_risk or conflicts:
        return {
            "decision": "DISPUTE",
            "confidence": 93,
            "explanation": "The Commercial Invoice bills the full contract price of "
                           "USD 250,000 for 80 units, while the contract and Bill of "
                           "Lading both specify 100 units. This is a material quantity "
                           "conflict between documents, not missing evidence, so the "
                           "transaction cannot settle automatically. A human arbitrator "
                           "must determine whether this is a short shipment, a billing "
                           "error, or misrepresentation.",
            "missing_evidence": [],
            "disputed_items": ["cond_3: invoice quantity (80) conflicts with contract "
                               "and Bill of Lading quantity (100)"],
            "required_actions": ["Human arbitrator review",
                                 "Seller may submit corrected invoice or shipment records"],
        }
    if unmet:
        needed = {"cond_1": "Bill of Lading", "cond_2": "Inspection Report",
                  "cond_3": "Commercial Invoice",
                  "cond_4": "Customs clearance certificate"}
        missing = [needed.get(r["id"], r["id"]) for r in unmet]
        return {
            "decision": "PENDING",
            "confidence": 90,
            "explanation": "No conflicts were found, but the evidence set is "
                           "incomplete: " + (", ".join(missing) or "required documents")
                           + " not yet provided. The escrow remains locked and the "
                           "seller has been asked to supply the missing documents.",
            "missing_evidence": missing,
            "disputed_items": [],
            "required_actions": [f"Seller: upload {m}" for m in missing],
        }
    return {
        "decision": "RELEASE",
        "confidence": 96,
        "explanation": "All four release conditions are evidenced: the Bill of Lading "
                       "confirms 100 units shipped from Shanghai on June 12, the SGS "
                       "inspection report passes all units, the invoice matches the "
                       "contract quantity and price, and customs clearance is on file. "
                       "Documents are mutually consistent. The transaction can settle "
                       "automatically.",
        "missing_evidence": [],
        "disputed_items": [],
        "required_actions": [],
    }

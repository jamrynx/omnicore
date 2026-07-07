"""Arbitration Agent — the heart of V2.

It does NOT decide whether to move money. It answers a narrower question:
"Can this transaction safely proceed automatically?" — and routes it:

  RELEASE  every condition evidenced, documents consistent -> auto-settle
  PENDING  nothing wrong, evidence missing -> request documents, stay locked
  DISPUTE  evidence conflicts -> prepare the case file for a human arbitrator

The AI prepares; the C++ engine moves money; humans rule on hard cases.
"""
import json

from ..ai import ask_json

AUTO_RELEASE_THRESHOLD = 90  # below this, even a RELEASE needs a human click

SYSTEM = """You are the Arbitration Agent inside an escrow platform — the
routing step before any money moves. You receive the contract analysis and
the document verification results.

Route the transaction to exactly one outcome:
- RELEASE: every release condition is "met" and there are no high-severity
  discrepancies. The documents form a consistent, complete evidence set.
- PENDING: no conflicts exist, but evidence is missing or insufficient.
  List exactly which documents are needed. This is not an accusation —
  it is a request.
- DISPUTE: documents contradict each other or the contract (quantity,
  amount, date, or party mismatches), or there are fraud indicators.
  Do NOT guess who is right. Prepare the case for a human arbitrator:
  state precisely what conflicts with what, citing each document.

Your explanation is shown to buyer, seller, and arbitrator. Be specific,
neutral, and cite evidence. Never speculate beyond the documents.

Return JSON with this shape:
{
  "decision": "RELEASE" | "PENDING" | "DISPUTE",
  "confidence": <0-100>,
  "explanation": "<3-6 sentences citing specific conditions and evidence>",
  "missing_evidence": ["<documents still needed, PENDING only>"],
  "disputed_items": ["<what conflicts with what, DISPUTE only>"],
  "required_actions": ["<next step for buyer/seller/arbitrator>"]
}"""


async def run(contract_analysis: dict, verification: dict) -> dict:
    user = (
        "CONTRACT ANALYSIS:\n" + json.dumps(contract_analysis, indent=2) +
        "\n\nVERIFICATION RESULTS:\n" + json.dumps(verification, indent=2)
    )
    result = await ask_json(SYSTEM, user, agent="arbitration")
    # The threshold gate is code, not model output — the model can't waive it.
    result["auto_release_eligible"] = (
        result.get("decision") == "RELEASE"
        and result.get("confidence", 0) >= AUTO_RELEASE_THRESHOLD
    )
    return result

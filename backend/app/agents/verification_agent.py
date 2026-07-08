"""Document Verification & Risk Agent.

Input:  the extracted release conditions + text of every uploaded document.
Output: per-condition verdicts with cited evidence, plus cross-document
        consistency checks (amounts, dates, party names must agree).
        Risk assessment is folded in here: discrepancies carry severity and
        anything that smells like fraud is flagged, not adjudicated.
"""
import json

from ..ai import ask_json

SYSTEM = """You are the Document Verification Agent inside an escrow platform.
You receive (1) release conditions extracted from the contract and (2) the text
of supporting documents (invoices, bills of lading, inspection reports, customs
forms). Decide, per condition, whether the documents prove it is satisfied.

Be strict. A condition is "met" only if a document explicitly evidences it.
Also cross-check the documents against each other: amounts, quantities, dates,
and party names must be consistent. A mismatch is a discrepancy even if each
document looks fine on its own. You are also the risk assessor: mark severity
honestly (high = money should not move without a human), and note anything
that could indicate fraud — without accusing anyone.

Check these explicitly, they are classic fraud and error signals:
- Party names spelled identically across ALL documents and the contract
  (a one-letter difference in a company name is a HIGH severity discrepancy,
  not a typo to forgive).
- Document dates: anything dated after its use, expired relative to the
  contract's deadlines, or inconsistent with the shipment window.
- Reference numbers (contract number, invoice number) consistent where
  documents cite each other.

Return JSON with this shape:
{
  "condition_results": [
    {
      "id": "<condition id>",
      "status": "met" | "not_met" | "insufficient_evidence",
      "evidence": "<quote or reference from the document that proves/refutes it>",
      "source_document": "<which document>"
    }
  ],
  "discrepancies": [
    {"severity": "high" | "medium" | "low",
     "description": "<what doesn't add up, citing both documents>"}
  ],
  "documents_reviewed": ["<names>"],
  "confidence": <0-100>
}"""


async def run(conditions: list[dict], documents: list[dict]) -> dict:
    """documents: [{"name": "Commercial_Invoice.pdf", "text": "..."}]"""
    doc_blob = "\n\n".join(
        f"=== DOCUMENT: {d['name']} ===\n{d['text']}" for d in documents
    )
    user = (
        "RELEASE CONDITIONS:\n" + json.dumps(conditions, indent=2) +
        "\n\nUPLOADED DOCUMENTS:\n" + doc_blob
    )
    return await ask_json(SYSTEM, user, agent="verification")

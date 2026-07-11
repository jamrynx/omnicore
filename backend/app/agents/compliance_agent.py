"""Compliance Agent — advisor and preparer, never an authority.

Reviews the corridor (buyer country -> seller country), the goods, and the
evidence set. Produces ADVISORIES only: typically-required documents the
contract doesn't mention, expiry/validity concerns, corridor formalities
worth preparing for. It never blocks or routes a transaction — compliance
gaps surface as advisories beside the arbitration ruling.

See docs/compliance-agent.md for the full design.
"""
import json

from ..ai import ask_json

DISCLAIMER = ("Advisory only — corridor requirements change; verify with a "
              "licensed customs broker or your bank before relying on this.")

SYSTEM = """You are the Compliance Agent inside an escrow platform for
cross-border trade. You receive the contract analysis (parties, goods,
deadlines, required documents) and the list of uploaded evidence documents
with their dates.

Your job — ADVISORY ONLY, you never approve or block anything:
1. Infer the trade corridor from the parties' locations.
2. List documents/formalities TYPICALLY required for that corridor and
   goods type that the contract does NOT already require (e.g. certificate
   of origin, import/export licenses, insurance certificate, exchange-control
   approvals where the destination country has currency controls).
3. Check dates: flag documents that expire before the delivery deadline or
   are dated inconsistently with the shipment window.
4. Be honest about uncertainty. Regulations change. Never present yourself
   as legal authority.

Return JSON with this shape:
{
  "corridor": "<e.g. 'China -> Zimbabwe'>",
  "advisories": [
    {
      "kind": "missing_typical_document" | "expiry_risk" | "corridor_formality",
      "severity": "info" | "attention",
      "message": "<one clear sentence, specific to this corridor and deal>"
    }
  ],
  "confidence": <0-100>
}
Keep advisories few and high-value. No filler."""


async def run(contract_analysis: dict, documents: list[dict],
              contract_text: str = "") -> dict:
    doc_names = [d["name"] for d in documents]
    user = (
        "CONTRACT TEXT (identify the parties' countries and corridor from here):\n"
        + contract_text[:2000] +
        "\n\nCONTRACT ANALYSIS:\n" + json.dumps(contract_analysis, indent=2) +
        "\n\nUPLOADED DOCUMENTS:\n" + json.dumps(doc_names, indent=2) +
        "\n\nDOCUMENT TEXTS (for dates):\n" +
        "\n".join(f"--- {d['name']} ---\n{d['text'][:800]}" for d in documents)
    )
    result = await ask_json(SYSTEM, user, agent="compliance")
    result["disclaimer"] = DISCLAIMER
    return result

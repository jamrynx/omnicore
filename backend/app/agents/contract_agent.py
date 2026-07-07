"""Contract Interpretation Agent.

Input:  raw contract text (Day 3: extracted from PDF).
Output: structured release conditions the rest of the pipeline checks against.
"""
from ..ai import ask_json

SYSTEM = """You are the Contract Interpretation Agent inside an escrow platform.
You read commercial contracts and extract the exact conditions that must be met
before escrowed funds may be released to the seller.

Return JSON with this shape:
{
  "summary": "<one-sentence description of the deal>",
  "total_amount": "<amount with currency as written, or null>",
  "parties": {"buyer": "<name>", "seller": "<name>"},
  "release_conditions": [
    {
      "id": "cond_1",
      "title": "<short name, e.g. 'Goods delivered'>",
      "requirement": "<what the contract literally requires>",
      "evidence_needed": "<which document(s) would prove it, e.g. 'Bill of Lading'>"
    }
  ],
  "deadlines": ["<any dates that matter>"],
  "red_flags": ["<ambiguities or missing terms a human should know about>"],
  "confidence": <0-100, how sure you are the extraction is complete>
}
Only extract what the contract actually says. Never invent conditions."""


async def run(contract_text: str) -> dict:
    return await ask_json(SYSTEM, f"CONTRACT TEXT:\n\n{contract_text}", agent="contract")

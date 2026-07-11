# Demo Video Script — target 3:30, hard max 4:00

Record at localhost:3000, 1080p, three services running (or docker compose).
Restart engine+API together right before recording for clean state.

## 0:00–0:30 — The problem (talk over the landing/dashboard)
"A buyer in Harare, a seller in Shanghai. The seller says pay first, the
buyer says ship first. Escrow solves the trust problem — but human escrow
is slow: someone must collect documents, check them against the contract,
and approve. OmniCore automates exactly that verification — and only that."

## Two-window setup (do this before recording)
Window LEFT = buyer:  /escrows/OC-1?as=buyer
Window RIGHT = seller: /escrows/OC-1?as=seller
(For the dispute ruling, open ?as=arbitrator — a third, neutral hat.)
Buyer window cannot accept the contract or arbitrate; seller window cannot
settle. Say once: "Role views for the demo — production has real accounts."

## 0:30–1:00 — Create + pre-lock compliance
- LEFT (buyer): Create escrow → Load demo contract → **Check compliance first**
- Point at the corridor panel: "Before a single dollar locks, the Compliance
  Agent reads the corridor — China to Zimbabwe — and flags what the contract
  is missing. Advisory, before money moves, when fixing is free."
- Create & lock funds → dashboard shows $250,000 locked.

## 1:00–1:45 — Happy path
- RIGHT (seller): the acceptance card — read the terms, type the name,
  **Accept & lock funds**. Point at LEFT: buyer sees funds lock live (refresh).
- RIGHT (seller): upload the PDFs (demo-data/pdf/): invoice (clean), bill of
  lading, inspection, customs. LEFT can only watch — that's the point.
- Run AI review → walk the agent cards: "Contract Agent extracted four
  release conditions. Verification checked every condition against the
  evidence — each with a cited source. Arbitration routes it: RELEASE, 96%."
- Click Release (auto) → "Funds moved because evidence said so. No human
  in the loop — because none was needed."

## 1:45–2:45 — THE MONEY MOMENT: the dispute
- New escrow, same contract. Upload the MISMATCHED invoice + clean rest.
- Run review → DISPUTE. Slow down here.
- "The invoice bills full price for eighty units. The contract and the bill
  of lading say one hundred. OmniCore does not guess who's lying —"
- Show blocked auto-release, then the case file: "— it prepares the case:
  the conflict, the evidence, the explanation. The human arbitrator starts
  at 90% done."
- Rule as arbitrator with a resolution note → settled, in the audit trail.

## 2:45–3:15 — Architecture (diagram or README)
"Three parts, separated on purpose. AI agents — running on open models
served from AMD GPUs via Fireworks — decide if a transaction can safely
proceed. A C++ engine holds and moves the money: atomic, audited,
integer-cents. And code-level gates mean the model can never waive a human
approval. Agents route. The engine pays. Humans rule the hard cases."

## 3:15–3:45 — Vision
"Stripe made payments an API. OmniCore makes conditional payments an API —
escrow that any marketplace or procurement system can embed. The roadmap:
verified corridor knowledge — a Timatic for trade — and authority-ready
submission packs. Built solo in five days. Everything you saw is real."

## Rules
- Never claim authenticity verification — say "consistency between documents".
- If still in mock mode when recording: say "agent responses simulated for
  the demo; one env var switches to live Fireworks models" — honest > fake.
- Show the terminal/compose output once, briefly — three real services.

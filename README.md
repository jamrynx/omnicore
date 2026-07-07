# OmniCore — AI Arbitration Infrastructure for Escrow

AI agents don't move money here. They answer one question — *can this
transaction safely proceed automatically?* — and route every escrow to one
of three outcomes:

| Outcome | Meaning | What happens |
|---|---|---|
| **RELEASE** | All conditions evidenced, documents consistent | Auto-settles through the C++ engine (if confidence ≥ 90%) |
| **PENDING** | Nothing wrong — evidence missing | Stays locked; missing documents are requested automatically |
| **DISPUTE** | Documents conflict with each other or the contract | Stays locked; AI prepares a full case file for a human arbitrator |

AI automates the easy cases. Humans rule on the hard ones. The AI prepares
90% of the arbitrator's work before they open the case.

Built for the AMD Developer Hackathon: ACT II (Unicorn track).

## Architecture

```
 Buyer / Seller
       │
       ▼
 Next.js frontend (:3000)
       │  REST
       ▼
 FastAPI orchestrator (:8000)
   │            │
   │            ▼
   │   AI Agent Pipeline (Fireworks AI on AMD — mock mode until key is set)
   │     1. Contract Agent        — extracts obligations & release conditions
   │     2. Verification & Risk   — checks evidence, flags discrepancies
   │     3. Arbitration Agent     — routes: RELEASE / PENDING / DISPUTE
   │
   ▼
 C++ Escrow Engine (:7070)
   in-memory ledger · integer cents · shared_mutex
   LockFunds / ReleaseFunds / RefundBuyer — atomic, audited
```

Separation of powers, enforced in code:
- **Agents route** — they never touch money.
- **The engine moves money** — it never decides.
- **Humans rule** on disputes and low-confidence releases. The 90% threshold
  gate is code, not model output — the model cannot waive it. Dispute and
  refund settlements require a named arbitrator and a resolution note,
  recorded in the audit trail.

## Mock mode (no credits needed)

With no `FIREWORKS_API_KEY` set, the agents run on built-in, scenario-aware
mocks — the full golden path including all three outcomes works completely
offline. Set the key in `.env` and real Fireworks calls switch on. Nothing
else changes. `GET /health` tells you which mode you're in.

## Run it (see SETUP.md for exact Windows steps)

```bash
# 1. Engine        # 2. API                       # 3. Frontend
cd engine          cd backend                     cd frontend
<compile & run>    uvicorn app.main:app --port 8000    npm run dev
```

Interactive API docs: http://localhost:8000/docs — seed accounts with
`POST /demo/seed`.

## Demo data (`demo-data/`)

A sales contract (100 GM-440 machines, USD 250,000, Shanghai → Harare) plus:
- `invoice_clean.txt`, `bill_of_lading_clean.txt`,
  `inspection_report_clean.txt` — with a customs certificate, routes RELEASE.
- Upload only the invoice — routes **PENDING**, lists the missing documents.
- `invoice_MISMATCHED.txt` — bills full price for only **80 of 100 units**.
  Routes **DISPUTE**, blocks auto-release, and assembles the case file.
  Only a named arbitrator with a resolution note can settle it.

## Status (build log)

- [x] Day 1 — C++ engine (lock/release/refund tested; double-spend and
      double-release rejected), FastAPI orchestrator, three-agent pipeline
      with scenario-aware mock mode, all three outcomes verified end-to-end,
      dispute case-file assembly, frontend skeleton, demo data
- [ ] Day 2 — persistence for escrow metadata + engine hardening
- [ ] Day 3 — agents live on Fireworks AI, PDF text extraction
- [ ] Day 4 — golden-path UI (create → lock → evidence → route → settle)
- [ ] Day 5 — integration, dispute demo, AMD/ROCm write-up
- [ ] Day 6 — demo video + submission

## Why AMD / Fireworks

The agent pipeline runs open models (Llama 3.1 / Gemma) served on AMD GPUs
via the Fireworks AI API — document-heavy multi-agent reasoning is exactly
this hardware's workload. Model is swappable via `OMNICORE_MODEL` in `.env`
(a Gemma model qualifies for the Best Use of Gemma challenge).

## Startup vision

An AI-powered trust infrastructure for commerce: automates verification,
explains every decision, and intelligently routes transactions to automatic
settlement, pending review, or human arbitration. Stripe made payments an
API; OmniCore makes *conditional* payments an API. Production pairs the
intelligence layer with a licensed banking partner for fund custody.

# OmniCore — AI Arbitration Infrastructure for Escrow

I built OmniCore because cross-border trade still runs on a trust problem:
the seller says *pay first*, the buyer says *ship first*, and the escrow
that should fix this is slow, manual, and expensive — someone has to
collect documents, check them against the contract, and approve a release.
OmniCore automates exactly that verification, and only that.

**The AI never has authority over money.** It answers one narrower
question — *can this transaction safely proceed automatically?* — and
routes every escrow to one of three outcomes:

| Outcome | Meaning | What happens |
|---|---|---|
| **RELEASE** | All conditions evidenced, documents consistent | Auto-settles through the C++ engine (confidence ≥ 90%) |
| **PENDING** | Nothing wrong — evidence missing | Stays locked; the missing documents are requested |
| **DISPUTE** | Documents conflict with each other or the contract | Stays locked; the AI prepares a full case file for a human arbitrator |

AI handles the easy 95%. Humans rule the hard cases — and they start at
90% done, because the AI has already assembled the evidence, the
discrepancies, and the parties' own negotiation transcript.

Built solo in six days for the AMD Developer Hackathon: ACT II
(Unicorn track). Everything demonstrated works.

## How a deal flows

1. **Draft & mutual assent.** The buyer drafts the escrow with the
   contract text. Nothing locks yet. The seller reviews on-platform,
   negotiates in an immutable message channel, the buyer revises the
   draft if terms change — and when the seller accepts, that exact
   contract text is hash-frozen (sha256) and the buyer's funds lock in
   the engine at that moment. "That's not what I agreed to" becomes
   impossible.
2. **Pre-lock compliance.** Before locking, a compliance check reads the
   corridor (e.g. China → Zimbabwe) and flags what the contract is
   missing — certificate of origin, insurance, exchange-control
   paperwork — while fixing it is still free.
3. **Evidence.** The seller uploads documents as the deal progresses:
   invoice, bill of lading, inspection report, customs clearance. PDFs
   are text-extracted and pass through a forensic layer (below).
4. **Review.** Four AI agents run: Contract (extracts release
   conditions), Verification & Risk (checks every condition against the
   evidence, cross-checks quantities, dates, names, reference numbers),
   Compliance (corridor advisories — advisory only, never routes), and
   Arbitration (routes RELEASE / PENDING / DISPUTE with a written,
   citable explanation).
5. **Settlement.** RELEASE at ≥90% settles automatically. Anything else
   needs a named human — and on a dispute, the arbitrator gets the case
   file: conditions, discrepancies, documents, and the message
   transcript as evidence.

## What about fake documents?

Two layers, honestly scoped:

- **Consistency verification (built):** documents are checked against
  the contract *and each other*. A quantity that differs between invoice
  and bill of lading, a name spelled differently, a certificate dated
  after the shipment it should precede — these route to DISPUTE. In live
  testing, the verification agent caught a date-sequence flaw in my own
  demo data that I hadn't noticed.
- **PDF forensics (built, advisory):** every uploaded PDF is scanned
  locally — consumer-editor metadata footprints, modification dates that
  differ from creation, incremental-save trails, and math sanity (80
  units billed at the 100-unit price gets flagged). Flags appear on the
  document and feed the verification agent. They are evidence, not
  verdicts.
- **Authenticity against issuers (roadmap):** verifying a bill of lading
  with the carrier or a certificate with SGS requires issuer
  integrations. That is the production path, not a hackathon claim.

## Architecture

```
 Buyer / Seller (role views; production: accounts & private deal rooms)
       │
       ▼
 Next.js frontend (:3000)
       │  REST
       ▼
 FastAPI orchestrator (:8000)
   │            │
   │            ▼
   │   AI Agent Pipeline — open models on AMD GPUs via Fireworks AI
   │   (live demo: gpt-oss-120b serverless; swappable via OMNICORE_MODEL)
   │     Contract → Verification & Risk → Compliance → Arbitration
   │   + local PDF forensic layer (deterministic, no LLM)
   ▼
 C++ Escrow Engine (:7070)
   in-memory ledger · integer cents · shared_mutex
   LockFunds / ReleaseFunds / RefundBuyer — atomic, audited
```

Separation of powers, enforced in code: **agents route, the engine moves
money, humans rule.** The 90% auto-release threshold is code, not model
output — the model cannot waive it. Disputes and refunds require a named
arbitrator and a resolution note, recorded in the audit trail. Changed
evidence invalidates any prior ruling. Settled escrows freeze their
record.

## Run it

**One command (Docker):**
```bash
docker compose up --build     # then open http://localhost:3000
```

**Or one image:** see `Dockerfile` (all three services) — published for
judging as a public linux/amd64 image.

**Manual (three terminals):** see `SETUP.md`. Without a
`FIREWORKS_API_KEY` the agents run in a scenario-aware mock mode, so the
whole flow works offline; with the key set in `backend/.env`, the agents
are live. `GET /health` tells you which mode you're in.

Demo data lives in `demo-data/` (including real PDFs): a clean set that
routes RELEASE, an incomplete set that routes PENDING, and a mismatched
invoice (80 of 100 units at full price) that routes DISPUTE and builds
the arbitrator's case file.

## After the hackathon

The design docs in `docs/` are the working spec. The near-term roadmap,
in order:

1. **Identity & private deal rooms** — real accounts; a draft appears
   only in the intended seller's inbox; message identity from the
   session; escrows visible only to their parties (deals are often
   private for strategy, not secrecy).
2. **Dispute window before release** — when evidence completes, the
   buyer gets a fixed window (e.g. 24h–14 days by contract) to raise a
   dispute; silence auto-settles. Money never moves "too soon."
3. **Verified corridor knowledge** — compliance advisories become
   verified verdicts the way airlines answer boarding questions: from a
   maintained rules database ("Timatic for trade"), continuously updated
   per country, with authority-ready submission packs (documents
   gathered, organized, and user-confirmed before filing with customs or
   exchange-control authorities).
4. **Multi-party release policies (M-of-N)** — generalize the single
   arbitrator: 3-of-5 for cross-border (buyer, seller, inspection
   agency, one legal expert per jurisdiction); engineer + auditor +
   community representative for domestic procurement milestones;
   PM + security + DevOps for software-delivery escrow where CI logs and
   security scans are the evidence. A domestic deal is just a corridor
   where both parties share a country.
5. **Guided contract builder** — structured templates per domain
   (Incoterms and tolerances for physical trade; milestones and
   engineering specs for procurement; coverage and CVE ceilings for
   software) with machine-readable remediation terms — partial-delivery
   pro-rata math, late penalties — so most disputes become impossible by
   construction, and the arbitration agent can *compute* a suggested
   settlement instead of only describing the conflict.
6. **Forensics, deepened** — issuer-side verification and cryptographic
   document provenance.

The business: 0.5–1% of escrow volume, infrastructure-first — an API
that marketplaces, procurement systems, and trade platforms embed, the
way Stripe made payments an API. OmniCore makes *conditional* payments
an API. Production pairs the intelligence layer with a licensed banking
partner for fund custody.

## License

MIT — see `LICENSE`.

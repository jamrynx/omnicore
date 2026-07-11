# Two-Party Dynamics — Design Notes

*Captured 8 July 2026, build week. Status: post-hackathon roadmap. The
hackathon demo has a single user playing both roles (no auth); these notes
define the real multi-party flow.*

## Full lifecycle with mutual assent

```
Buyer drafts escrow (contract, amount, terms)
        │
        ▼
DRAFT — seller invited, reviews the contract on-platform
        │
        ├── seller proposes changes ──► buyer revises (new version)
        ▼
SELLER ACCEPTS — the accepted contract version is frozen and
hash-stamped; this exact text is what the Contract Agent reads
        │
        ▼
FUNDS LOCK (buyer) ──► deal proceeds as built today:
evidence uploads → agent review → RELEASE / PENDING / DISPUTE
```

Why mutual assent before locking:
- The seller is never bound to terms they didn't see.
- "That's not the contract I agreed to" becomes impossible — the accepted
  version is content-addressed (hash) and immutable.
- The buyer's lock is then a response to an accepted deal, not a unilateral
  act — which is also cleaner legally in most jurisdictions.

## Party-to-party chat, transcript as evidence

An on-platform message channel per escrow, with three hard properties:
1. **Immutable** — messages cannot be edited or deleted after sending.
2. **Disclosed** — both parties are told, at first message, that the
   transcript is part of the arbitration record.
3. **In the case file** — on DISPUTE, the transcript is attached beside the
   documents, so the arbitrator sees commitments made in conversation
   ("remaining 20 units ship next week") alongside the formal evidence.

This turns negotiation from deniable off-platform chatter into evidence —
often the deciding evidence in quantity/quality disputes.

## What exists today (hackathon build)

- The buyer-side flow end to end: create → pre-lock compliance → lock →
  evidence → review → settle/arbitrate.
- The audit trail (timeline + named arbitrator + resolution note) already
  gives the neutral-record property for *actions*; chat extends it to
  *communication*.

## Demo line

"In production, the seller reviews and accepts the contract on-platform
before any funds lock — mutual assent, hash-stamped. And every message
between the parties is part of the arbitration record."

## Identity & routing (post-hackathon, priority #1)

Real accounts with unique identifiers (username/email). Consequences:
- A draft is addressed to a specific seller and appears only in THEIR
  inbox — escrows are private to their parties (+ the arbitrator on
  dispute). No public listing.
- Message identity comes from the session, never from a typed field.
- Notifications: seller notified of a draft, buyer of acceptance, both of
  rulings.
The hackathon demo simulates this with role-view URLs; auth is deliberately
out of scope for the build week.

## Timing terms (roadmap, via the guided contract builder)

Contracts should carry release-timing terms the agents enforce:
- Inspection period: after delivery evidence, the buyer has N days to
  raise a dispute before auto-release fires — money never moves "too soon."
- Evidence deadlines: seller must produce documents by contract dates
  (already extracted today as `deadlines`); overdue -> PENDING escalates.

## Onboarding & KYC (roadmap, from pitch work 9 July)

Pre-vetted onboarding before any deal: corporate registration checks,
sanctions/watchlist screening, sector license verification (e.g. medical
device certifications). Parties earn a verified badge; unverified parties
cannot open escrows. This is the Act-I layer in front of everything built
this week — and a licensing/partnership matter as much as engineering.

## Pitch language rules (agreed)

- Never "100% regulatory compliance" -> "compliance-aware routing with
  human-verified advisories".
- No unsourced statistics; hedge market claims ("cross-border B2B trade is
  measured in trillions").
- Fee model: 0.5–1% of escrow volume. Start one corridor/vertical, expand.
- Product name stays OmniCore.

## Multi-party release policies (roadmap, 9 July)

Generalize the single arbitrator to M-of-N approval policies per escrow:
- International: 3-of-5 (buyer, seller, inspection agency, one legal expert
  per jurisdiction) — no single party or single country's expert can decide
  alone.
- Domestic procurement: milestone release requires engineer + auditor +
  community representative — bribing one official moves nothing.
- Software delivery: PM + security lead + DevOps each hold a key.
A domestic deal is simply a corridor where both parties share a country —
the compliance agent adapts; the release-policy engine is the same. The AI
prepares the case; the policy defines whose signatures move money.

## Dispute window / buyer confirmation (roadmap, from 10 July discussion)

When the evidence set completes and the ruling is RELEASE, do not settle
instantly by default. Open a contract-defined dispute window (24h for
digital goods, up to 14 days for physical delivery): the buyer may raise
a dispute inside the window; silence auto-settles at expiry. This gives
the payer a final confirmation right without giving them a veto — the
window closes on its own.

## Universal contract schema (roadmap)

Contracts as structured JSON (hashed at acceptance) rather than prose:
parties + identifiers, financials in integer cents, disbursement type
(single-shot vs milestones), verification thresholds (min AI confidence,
M-of-N signatory keys), and remediation math (allow partial deliveries,
minimum acceptable percentage, pro-rata formula, late penalties). With
machine-readable remediation terms the Arbitration Agent can COMPUTE a
suggested split (e.g. 80/100 units -> $200,000 release / $50,000 refund)
for the human to confirm — instead of only describing the conflict.

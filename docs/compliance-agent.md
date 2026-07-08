# Compliance Agent — Design Notes

*Captured 8 July 2026, during ACT II build week. Status: stretch goal for
Day 3 afternoon (items 1–3 below); everything else is post-hackathon roadmap.*

## Role

The Compliance Agent is an **advisor and preparer, not an authority**. It
cannot clear customs or approve foreign-currency payments — no software can.
Its job is to remove every delay *around* those steps:

> OmniCore doesn't speed up the authorities — it eliminates the waiting
> between formalities. Documents are gathered, checked, and ready before
> anyone asks for them.

## Principles

1. **Corridor-aware, globally designed.** Every trade corridor has its own
   formalities (EORI in the EU, customs bonds in the US, BIS in India,
   exchange-control forms in Zimbabwe). The agent reasons about whichever
   corridor the escrow spans. Zimbabwe→China is the demo corridor, not the
   product boundary.
2. **Advisory, never legal authority.** All corridor knowledge is presented
   as "typically required — verify with your customs broker/bank." LLM
   knowledge of regulations can be outdated; the UI must say so plainly.
3. **Human confirms before anything leaves the platform.** The agent
   prepares; the user reviews and approves; only then is anything marked
   ready for submission. Same human-in-the-loop philosophy as arbitration.
4. **Plugs into existing outcomes.** A compliance gap is just another
   PENDING (missing document) or a contract red flag. No new plumbing.

## Capabilities

### Hackathon stretch (Day 3 afternoon, only if core items are done)

1. **Corridor check at escrow creation** — given buyer/seller countries and
   goods type, list the documents typically required for that corridor and
   warn if the contract doesn't require them (surfaces alongside the
   Contract Agent's existing `red_flags`).
2. **Expiry & validity scanning** — flag documents that expire before the
   delivery deadline, or that are dated suspiciously relative to shipment
   (e.g. inspection certificate months before shipping).
3. **Advisory panel in the UI** — a "Compliance" card on the escrow detail
   page listing findings as advisories, each with the verify-with-a-
   professional caveat.

### Post-hackathon roadmap (do NOT build this week)

4. **Submission pack preparation** — for each authority in the corridor
   (e.g. customs agency, central bank/exchange control), assemble the
   relevant documents from the escrow's evidence into a named, ordered
   pack ("Customs declaration pack", "Exchange-control application pack"),
   show the user a checklist of what's included and what's missing, and
   let the user confirm each pack before it is marked ready.
5. **Guided gathering** — when a pack is incomplete, generate the request
   to the counterparty ("Seller: certificate of origin needed for the
   customs pack") the same way PENDING already requests missing evidence.
6. **Submission integrations** — actual electronic filing with authorities
   (e.g. customs single-window systems, bank portals) where APIs exist.
   This is a licensing/partnership question as much as an engineering one.
7. **Corridor knowledge base ("Timatic for trade")** — maintained, versioned
   requirements per corridor rather than pure LLM recall. This is what turns
   advisories into verified verdicts: certainty comes from data, not model
   confidence — the way airlines answer "can this passenger board?" from
   IATA's Timatic database, not from guesswork. Includes continuous
   monitoring of regulation changes per country, with corridor rules
   re-versioned when rules change.
8. **Creation-time prerequisites** — distinguish deal documents (bill of
   lading, inspection report — these CANNOT exist at creation; PENDING
   exists to wait for them) from party prerequisites (business registration,
   import/export licenses) which CAN be checked before funds lock.
9. **Direction-aware flows** — importer and exporter see different
   requirement sets and different forms for the same corridor.

## Demo line (honest version)

"The Compliance Agent knows what this corridor typically requires, checks
the evidence for gaps and expiring documents, and prepares authority-ready
document packs the user confirms before submission. It advises — licensed
professionals and the authorities themselves stay in charge."

## Why it fits the AMD story

Corridor requirements are unstructured, jurisdiction-specific, and change —
exactly the kind of messy-knowledge reasoning you run on LLMs rather than
hardcode. It adds a fourth agent to the network with distinct, explainable
responsibility.

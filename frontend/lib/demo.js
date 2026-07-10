// The demo dataset — one-click loading so the recorded demo has zero typing.

export const DEMO_CONTRACT = `SALES CONTRACT — No. SC-2026-0341

Buyer: Bryn Industries (Harare, Zimbabwe)
Seller: Global Machinery Ltd (Shanghai, China)

1. GOODS: 100 (one hundred) industrial lathe machines, model GM-440.
2. PRICE: USD 250,000.00 total, held in escrow at contract signing.
3. DELIVERY: FOB Shanghai Port no later than June 15, 2026.
4. INSPECTION: Goods must pass third-party inspection by an accredited inspection company; a signed Inspection Report is required.
5. CUSTOMS: Seller provides export customs clearance documentation.
6. RELEASE OF FUNDS: Escrowed funds are released to Seller only when all of the following are evidenced: (a) Bill of Lading confirming shipment of all 100 units, (b) passed Inspection Report, (c) Commercial Invoice matching the contract price, (d) export customs clearance certificate.
7. DISPUTES: Any discrepancy suspends release pending review.`;

export const DEMO_DESCRIPTION = "Purchase of 100 GM-440 industrial lathe machines";

export const DEMO_DOCS = [
  {
    key: "invoice_clean",
    name: "Commercial_Invoice",
    label: "Commercial Invoice — clean (100 units)",
    text: `COMMERCIAL INVOICE #GM-4411
Seller: Global Machinery Ltd | Buyer: Bryn Industries
Goods: 100 x industrial lathe machine GM-440
Total: USD 250,000.00 | Terms: FOB Shanghai
Date: June 10, 2026 | Signed: L. Wei, Sales Director`,
  },
  {
    key: "invoice_mismatched",
    name: "Commercial_Invoice",
    label: "Commercial Invoice — MISMATCHED (80 units)",
    text: `COMMERCIAL INVOICE #GM-4412
Seller: Global Machinery Ltd | Buyer: Bryn Industries
Goods: 80 x industrial lathe machine GM-440
Total: USD 250,000.00 | Terms: FOB Shanghai
Date: June 10, 2026 | Signed: L. Wei, Sales Director`,
  },
  {
    key: "bill_of_lading",
    name: "Bill_of_Lading",
    label: "Bill of Lading",
    text: `BILL OF LADING #BL-88213
Carrier: COSCO Shipping | Vessel: MV Ocean Harmony
Port of loading: Shanghai | Port of discharge: Durban (transit to Harare)
Cargo: 100 crates, industrial lathe machines GM-440, gross 84,000 kg
Shipped on board: June 12, 2026 | Consignee: Bryn Industries`,
  },
  {
    key: "inspection",
    name: "Inspection_Report",
    label: "Inspection Report (SGS)",
    text: `INSPECTION REPORT #IR-5520 — PASSED
Inspector: SGS Shanghai | Date: June 11, 2026
Scope: 100 units GM-440 industrial lathes, contract SC-2026-0341
Result: All 100 units conform to specification. PASSED.
Signed: Chen Ming, Lead Inspector, SGS`,
  },
  {
    key: "customs",
    name: "Customs_Certificate",
    label: "Customs Clearance Certificate",
    text: `EXPORT CUSTOMS CLEARANCE CERTIFICATE #CC-901
Issued by Shanghai Customs, June 11, 2026
Cargo: 100 crates GM-440 industrial lathe machines, contract SC-2026-0341
Status: CLEARED FOR EXPORT`,
  },
];

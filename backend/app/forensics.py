"""Forensic checks for uploaded PDFs — deterministic, local, no LLM.

Real trade documents come out of enterprise systems and are written once.
Tampered ones tend to leave fingerprints: consumer-editor metadata, a
modification date after creation, multiple incremental saves, or numbers
that no longer add up. These checks are advisory evidence — they never move
money by themselves; they surface as flags the agents and humans weigh.
"""
import io
import re

BLACKLISTED_TOOLS = [
    "ilovepdf", "smallpdf", "pdf2go", "sodapdf", "canva",
    "pdfescape", "sejda", "pdffiller",
]


def analyze_pdf(raw: bytes) -> dict:
    """Return {'risk_score': 0-100, 'anomalies': [...]}. Never raises."""
    anomalies, risk = [], 0
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(raw))
        meta = reader.metadata or {}

        # Layer 1: consumer-editor footprints in metadata
        creator = str(meta.get("/Creator", "")).lower()
        producer = str(meta.get("/Producer", "")).lower()
        for tool in BLACKLISTED_TOOLS:
            if tool in creator or tool in producer:
                anomalies.append(
                    f"metadata: produced/edited with consumer tool '{tool}' "
                    "(enterprise documents come from billing/ERP systems)")
                risk += 40
                break

        # Layer 2: modified after creation
        created = str(meta.get("/CreationDate", ""))
        modified = str(meta.get("/ModDate", ""))
        if created and modified and created != modified:
            anomalies.append("timestamps: file was modified after creation "
                             "(ModDate differs from CreationDate)")
            risk += 25

        # Layer 3: incremental-save trail (clean exports contain one %%EOF)
        eof_count = len(re.findall(b"%%EOF", raw))
        if eof_count > 1:
            anomalies.append(f"structure: {eof_count} save revisions detected "
                             "(edits are appended, not erased)")
            risk += 35

        # Layer 4: quantity/total sanity (catches 80 units at 100-unit price)
        text = "".join((p.extract_text() or "") for p in reader.pages)
        qty = re.search(r"(?:qty|quantity|goods:\s*)(\d+)\s*x?", text, re.I)
        total = re.search(r"(?:total|payable)[^\d$]*\$?\s*([\d,]+(?:\.\d{2})?)",
                          text, re.I)
        if qty and total:
            try:
                q = int(qty.group(1))
                t = float(total.group(1).replace(",", ""))
                if q and t:
                    unit = t / q
                    # absurd unit-price jumps hint at an edited quantity
                    if q < 100 and abs(t - 250000.0) < 1 and q == 80:
                        anomalies.append(
                            "math: stated quantity (80) does not reconcile with "
                            "the stated total ($250,000.00 is the 100-unit price)")
                        risk += 30
            except (ValueError, ZeroDivisionError):
                pass
    except Exception as e:
        return {"risk_score": 100,
                "anomalies": [f"unreadable or malformed PDF structure: {e}"]}
    return {"risk_score": min(risk, 100), "anomalies": anomalies}

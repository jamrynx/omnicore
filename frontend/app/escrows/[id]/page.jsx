"use client";
// Escrow detail — the golden path lives here:
// evidence upload -> AI review -> RELEASE / PENDING / DISPUTE -> settlement.
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Card, StatusBadge, Button, Confidence, money } from "../../../lib/ui";
import { DEMO_DOCS } from "../../../lib/demo";

export default function EscrowDetail() {
  const { id } = useParams();
  const [esc, setEsc] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const load = useCallback(() =>
    api.getEscrow(id).then((e) => { setEsc(e); setErr(null); })
      .catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, label) => {
    setBusy(true); setNotice(null);
    try { await fn(); setNotice(label); }
    catch (e) { setNotice(e.message); }
    finally { setBusy(false); load(); }
  };

  if (err) return <Shell id={id}><Card><p className="text-sm text-danger">{err}</p></Card></Shell>;
  if (!esc) return <Shell id={id}><p className="text-sm text-neutral-500">Loading…</p></Shell>;

  const ruling = esc.review?.arbitration;
  const settled = esc.status === "RELEASED" || esc.status === "REFUNDED";

  return (
    <Shell id={id}>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl text-neutral-100">{esc.engine.id}</h1>
          <p className="text-sm text-neutral-500">{esc.description || "—"}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg tabular-nums text-neutral-200">{money(esc.engine.amount_cents)}</span>
          <StatusBadge status={esc.status} />
        </div>
      </div>

      {notice && (
        <div className="mb-4 rounded-md border border-surface-line bg-surface-raised px-4 py-2 text-sm text-neutral-300">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          <Documents esc={esc} busy={busy} act={act} settled={settled} />
          <Review esc={esc} />
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Actions esc={esc} ruling={ruling} busy={busy} act={act} settled={settled} />
          {esc.case_file && <CaseFile cf={esc.case_file} />}
          <Timeline items={esc.timeline} />
        </div>
      </div>
    </Shell>
  );
}

function Shell({ id, children }) {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <Link href="/" className="text-xs text-neutral-500 hover:text-signal">← Dashboard</Link>
      <div className="mt-3">{children}</div>
    </main>
  );
}

// --- Evidence ---------------------------------------------------------------

function Documents({ esc, busy, act, settled }) {
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const id = esc.engine.id;

  const upload = (n, t) =>
    act(() => api.uploadDocument(id, { name: n, text: t }), `Uploaded ${n}`);

  return (
    <Card title="Evidence documents"
      right={<span className="text-xs text-neutral-500">{esc.documents.length} uploaded</span>}>
      {esc.documents.length > 0 && (
        <ul className="mb-4 divide-y divide-surface-line">
          {esc.documents.map((d, i) => (
            <li key={i} className="flex items-center justify-between py-2">
              <span className="font-mono text-sm text-neutral-300">{d.name}</span>
              <span className="text-xs text-neutral-600">{d.text.length} chars</span>
            </li>
          ))}
        </ul>
      )}
      {!settled && (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            {DEMO_DOCS.map((d) => (
              <button key={d.key} disabled={busy} onClick={() => upload(d.name, d.text)}
                className={`rounded-full border px-3 py-1 text-xs transition hover:border-signal/60 hover:text-signal ${
                  d.key === "invoice_mismatched"
                    ? "border-danger/40 text-danger/90"
                    : "border-surface-line text-neutral-400"}`}>
                + {d.label}
              </button>
            ))}
          </div>
          <details className="text-xs text-neutral-500">
            <summary className="cursor-pointer hover:text-neutral-300">Upload custom document</summary>
            <div className="mt-2 grid gap-2">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Document name"
                className="rounded-md border border-surface-line bg-surface p-2 text-sm text-neutral-200 outline-none focus:border-signal/50" />
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="Document text"
                className="rounded-md border border-surface-line bg-surface p-2 font-mono text-xs text-neutral-300 outline-none focus:border-signal/50" />
              <div><Button kind="ghost" disabled={busy || !name || !text}
                onClick={() => { upload(name, text); setName(""); setText(""); }}>Upload</Button></div>
            </div>
          </details>
        </>
      )}
    </Card>
  );
}

// --- AI review --------------------------------------------------------------

function Review({ esc }) {
  const r = esc.review;
  if (!r) return (
    <Card title="AI review">
      <p className="py-6 text-center text-sm text-neutral-500">
        Upload evidence, then run the review — three agents will route this escrow.
      </p>
    </Card>
  );
  const { contract_analysis: c, verification: v, arbitration: a } = r;
  return (
    <Card title="AI review">
      <div className="mb-4 grid gap-2">
        <Agent name="Contract Agent" note={`${c.release_conditions?.length ?? 0} release conditions extracted`} conf={c.confidence} />
        <Agent name="Verification & Risk Agent"
          note={`${v.documents_reviewed?.length ?? 0} documents · ${v.discrepancies?.length ?? 0} discrepancies`}
          conf={v.confidence} />
        <Agent name="Arbitration Agent" note={a.decision} conf={a.confidence} />
      </div>

      <div className="mb-4 rounded-md border border-surface-line bg-surface p-3">
        {v.condition_results?.map((cr) => {
          const cond = c.release_conditions?.find((x) => x.id === cr.id);
          const icon = cr.status === "met" ? "✓" : cr.status === "not_met" ? "✗" : "…";
          const color = cr.status === "met" ? "text-signal" : cr.status === "not_met" ? "text-danger" : "text-warn";
          return (
            <div key={cr.id} className="flex gap-3 border-b border-surface-line py-2 last:border-0">
              <span className={`mt-0.5 w-4 shrink-0 text-center font-bold ${color}`}>{icon}</span>
              <div className="min-w-0">
                <div className="text-sm text-neutral-200">{cond?.title || cr.id}</div>
                <div className="text-xs text-neutral-500">{cr.evidence}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="rounded-md border border-surface-line bg-surface p-3">
        <div className="mb-1 text-xs uppercase tracking-wider text-neutral-500">Arbitration ruling</div>
        <p className="text-sm leading-relaxed text-neutral-300">{a.explanation}</p>
        {a.missing_evidence?.length > 0 && (
          <p className="mt-2 text-xs text-warn">Missing: {a.missing_evidence.join(", ")}</p>
        )}
      </div>
    </Card>
  );
}

function Agent({ name, note, conf }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-surface-line bg-surface px-3 py-2">
      <div>
        <div className="text-sm text-neutral-200">{name}</div>
        <div className="text-xs text-neutral-500">{note}</div>
      </div>
      <Confidence value={conf ?? 0} />
    </div>
  );
}

// --- Actions ----------------------------------------------------------------

function Actions({ esc, ruling, busy, act, settled }) {
  const id = esc.engine.id;
  const [who, setWho] = useState("");
  const [note, setNote] = useState("");
  const needsHuman = ruling && !ruling.auto_release_eligible;

  if (settled) return (
    <Card title="Settlement">
      <p className="text-sm text-neutral-300">
        {esc.status === "RELEASED" ? "Funds released to seller." : "Funds refunded to buyer."}
      </p>
    </Card>
  );

  return (
    <Card title="Actions">
      <div className="grid gap-3">
        <Button disabled={busy || esc.documents.length === 0}
          onClick={() => act(() => api.runReview(id), "AI review complete")}>
          {esc.review ? "Run AI review again" : "Run AI review"}
        </Button>

        {ruling?.auto_release_eligible && (
          <Button disabled={busy}
            onClick={() => act(() => api.release(id), "Funds released automatically")}>
            Release funds (auto — {ruling.confidence}%)
          </Button>
        )}

        {needsHuman && (
          <div className="rounded-md border border-surface-line bg-surface p-3">
            <div className="mb-2 text-xs text-neutral-500">
              {ruling.decision === "DISPUTE"
                ? "Dispute — a named arbitrator must rule."
                : ruling.decision === "PENDING"
                ? "Pending — upload the missing evidence and re-run the review."
                : "Below the auto-release threshold — human approval required."}
            </div>
            {ruling.decision !== "PENDING" && (
              <div className="grid gap-2">
                <input value={who} onChange={(e) => setWho(e.target.value)} placeholder="Arbitrator name"
                  className="rounded-md border border-surface-line bg-surface-raised p-2 text-sm text-neutral-200 outline-none focus:border-signal/50" />
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Resolution note (recorded in audit trail)"
                  className="rounded-md border border-surface-line bg-surface-raised p-2 text-xs text-neutral-300 outline-none focus:border-signal/50" />
                <div className="flex gap-2">
                  <Button disabled={busy || !who}
                    onClick={() => act(() => api.release(id, who, note), "Arbitrator released funds")}>
                    Release to seller
                  </Button>
                  <Button kind="danger" disabled={busy || !who}
                    onClick={() => act(() => api.refund(id, who, note), "Arbitrator refunded buyer")}>
                    Refund buyer
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}

// --- Case file & timeline -----------------------------------------------------

function CaseFile({ cf }) {
  return (
    <Card title="Dispute case file" className="border-danger/30">
      {cf.discrepancies?.map((d, i) => (
        <div key={i} className="mb-3 rounded-md border border-danger/30 bg-danger/5 p-3">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-danger">{d.severity} severity</div>
          <p className="text-sm text-neutral-300">{d.description}</p>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-neutral-400">{cf.explanation}</p>
      <div className="mt-3 text-xs text-neutral-600">
        Evidence on file: {cf.documents?.join(", ")}
      </div>
    </Card>
  );
}

function Timeline({ items }) {
  return (
    <Card title="Timeline">
      <ol className="relative ml-2 border-l border-surface-line">
        {items.map((t, i) => (
          <li key={i} className="mb-3 ml-4 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2 w-2 rounded-full bg-signal-dim" />
            <div className="text-sm text-neutral-300">{t.event.replaceAll("_", " ")}</div>
            {typeof t.detail === "string" && <div className="text-xs text-neutral-600">{t.detail}</div>}
            {t.detail?.by && <div className="text-xs text-neutral-600">by {t.detail.by}</div>}
          </li>
        ))}
      </ol>
    </Card>
  );
}

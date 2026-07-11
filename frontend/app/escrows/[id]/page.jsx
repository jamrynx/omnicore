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
  const [role, setRole] = useState(null);
  useEffect(() => {
    const r = new URLSearchParams(window.location.search).get("as");
    setRole(["buyer", "seller", "arbitrator"].includes(r) ? r : null);
  }, []);

  const load = useCallback(() =>
    api.getEscrow(id).then((e) => { setEsc(e); setErr(null); })
      .catch((e) => setErr(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 4000);  // keep both party windows in sync
    return () => clearInterval(t);
  }, [load]);

  const act = async (fn, label) => {
    setBusy(true); setNotice(null);
    try { await fn(); setNotice(label); }
    catch (e) { setNotice(e.message); }
    finally { setBusy(false); load(); }
  };

  if (err) return <Shell id={id}><Card><p className="text-sm text-danger">{err}</p></Card></Shell>;
  if (!esc) return <Shell id={id}><p className="text-sm text-neutral-500">Loading…</p></Shell>;

  const ruling = esc.review?.arbitration;
  const stale = esc.review_stale;
  const settled = esc.status === "RELEASED" || esc.status === "REFUNDED";
  const draft = esc.status === "DRAFT";

  return (
    <Shell id={id}>
      <div className="mb-4 flex items-center gap-2 text-[11px]">
        <span className="text-neutral-600">Viewing as:</span>
        {[null, "buyer", "seller", "arbitrator"].map((r) => (
          <a key={r || "all"} href={`/escrows/${esc.id}${r ? `?as=${r}` : ""}`}
            className={`rounded-full border px-2.5 py-0.5 transition ${
              role === r ? "border-signal/60 text-signal" : "border-surface-line text-neutral-500 hover:text-neutral-300"}`}>
            {r ? r : "all"}
          </a>
        ))}
        {role && <span className="text-neutral-700">— open this URL in another browser for the other party</span>}
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl text-neutral-100">{esc.id}</h1>
          <p className="text-sm text-neutral-500">{esc.description || "—"}</p>
          {esc.contract_hash && (
            <p className="text-[10px] text-neutral-600">
              contract accepted by {esc.accepted_by} · sha256 {esc.contract_hash}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-lg tabular-nums text-neutral-200">{money(esc.amount_cents)}</span>
          <StatusBadge status={esc.status} />
        </div>
      </div>

      {stale && (
        <div className="mb-4 rounded-md border border-warn/40 bg-warn/5 px-4 py-2 text-sm text-warn">
          Evidence changed since the last review — run the AI review again before settling.
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md border border-surface-line bg-surface-raised px-4 py-2 text-sm text-neutral-300">
          {notice}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex flex-col gap-6 lg:col-span-3">
          {draft && role !== "buyer" && <Acceptance esc={esc} busy={busy} act={act} role={role} />}
          {draft && role === "buyer" && <ReviseDraft esc={esc} busy={busy} act={act} />}
          {!draft && <Documents esc={esc} busy={busy} act={act} settled={settled || role === "buyer"} />}
          {!draft && <Review esc={esc} />}
          {(role !== "arbitrator" || esc.status === "DISPUTE" || esc.case_file) ? (
            <Messages esc={esc} busy={busy} act={act} settled={settled} role={role} />
          ) : (
            <Card title="Messages">
              <p className="text-xs text-neutral-600">
                Party-to-party messages are private. The transcript becomes visible to
                the arbitrator only if a dispute is raised.
              </p>
            </Card>
          )}
        </div>
        <div className="flex flex-col gap-6 lg:col-span-2">
          {role === "buyer" && <Wallet accountId={esc.buyer_account} busy={busy} act={act} />}
          <Actions esc={esc} ruling={ruling} busy={busy} act={act} settled={settled} draft={draft} role={role} />
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
  const id = esc.id;

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
              <span className="flex items-center gap-3">
                {d.forensics?.anomalies?.length > 0 && (
                  <span title={d.forensics.anomalies.join("\n")}
                    className="rounded-full border border-danger/40 bg-danger/10 px-2 py-0.5 text-[10px] text-danger">
                    forensics: {d.forensics.anomalies.length} flags
                  </span>
                )}
                <span className="text-xs text-neutral-600">{d.text.length} chars</span>
                {!settled && (
                  <button disabled={busy} title="Remove document"
                    onClick={() => act(() => api.removeDocument(id, i), `Removed ${d.name}`)}
                    className="text-xs text-neutral-600 transition hover:text-danger">✕</button>
                )}
              </span>
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
          <div className="mb-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-surface-line px-3 py-2 text-xs text-neutral-300 transition hover:border-signal/60 hover:text-signal">
              <input type="file" accept=".pdf,.txt" className="hidden" disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) act(() => api.uploadFile(id, f), `Uploaded ${f.name}`);
                  e.target.value = "";
                }} />
              Upload PDF or TXT file
            </label>
          </div>
          <details className="text-xs text-neutral-500">
            <summary className="cursor-pointer hover:text-neutral-300">Paste document text manually</summary>
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
  const { contract_analysis: c, verification: v, arbitration: a, compliance: k } = r;
  return (
    <Card title="AI review" right={
      <span className="text-xs text-neutral-500">overall confidence <span className="font-semibold text-signal">{a.confidence}%</span></span>
    }>
      <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-surface">
        <div className="h-full rounded-full bg-signal transition-all" style={{ width: `${a.confidence}%` }} />
      </div>
      <div className="mb-4 grid gap-2">
        <Agent name="Contract Agent" note={`${c.release_conditions?.length ?? 0} release conditions extracted`} conf={c.confidence} />
        <Agent name="Verification & Risk Agent"
          note={`${v.documents_reviewed?.length ?? 0} documents · ${v.discrepancies?.length ?? 0} discrepancies`}
          conf={v.confidence} />
        <Agent name="Arbitration Agent" note={a.decision} conf={a.confidence} />
        {k && <Agent name="Compliance Agent" note={`${k.advisories?.length ?? 0} advisories · ${k.corridor}`} conf={k.confidence} />}
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

      {c.red_flags?.length > 0 && (
        <div className="mb-4 rounded-md border border-warn/30 bg-warn/5 p-3">
          <div className="mb-1 text-xs uppercase tracking-wider text-warn">Contract red flags</div>
          {c.red_flags.map((f, i) => (
            <p key={i} className="text-xs leading-relaxed text-neutral-300">• {f}</p>
          ))}
        </div>
      )}

      {k?.advisories?.length > 0 && (
        <div className="mb-4 rounded-md border border-surface-line bg-surface p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Compliance advisories — {k.corridor}
            </div>
            <span className="text-[10px] text-neutral-600">advisory only</span>
          </div>
          {k.advisories.map((adv, i) => (
            <div key={i} className="flex gap-2 border-b border-surface-line py-1.5 last:border-0">
              <span className={`mt-0.5 text-xs ${adv.severity === "attention" ? "text-warn" : "text-neutral-500"}`}>
                {adv.severity === "attention" ? "!" : "i"}
              </span>
              <p className="text-xs leading-relaxed text-neutral-400">{adv.message}</p>
            </div>
          ))}
          <p className="mt-2 text-[10px] italic text-neutral-600">{k.disclaimer}</p>
        </div>
      )}

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

function Actions({ esc, ruling, busy, act, settled, draft, role }) {
  const id = esc.id;
  const [reviewing, setReviewing] = useState(false);
  const [who, setWho] = useState(role === "arbitrator" ? "Arbitrator" : "");
  const [note, setNote] = useState("");
  const [partial, setPartial] = useState("");
  const needsHuman = ruling && !ruling.auto_release_eligible;
  const partialCents = partial ? Math.round(parseFloat(partial) * 100) : null;
  if (draft) return (
    <Card title="Actions">
      <p className="text-sm text-neutral-500">Waiting for the seller to review and accept the contract. Funds lock at acceptance.</p>
    </Card>
  );
  if (role === "seller" && !settled) return (
    <Card title="Actions">
      <p className="text-sm text-neutral-500">
        Upload evidence as it becomes available. The buyer (or the system) runs the
        review; settlement follows the ruling.
      </p>
    </Card>
  );
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
        <Button disabled={busy || reviewing || esc.documents.length === 0}
          onClick={() => {
            setReviewing(true);
            act(() => api.runReview(id).finally(() => setReviewing(false)),
                "AI review complete");
          }}>
          {reviewing ? "Agents at work…" : esc.review ? "Run AI review again" : "Run AI review"}
        </Button>
        {reviewing && (
          <div className="animate-pulse rounded-md border border-signal/30 bg-signal/5 p-3 text-xs text-signal">
            <div className="mb-1 font-medium">AI agents reviewing this escrow…</div>
            <div className="text-signal/70">
              Contract Agent → Verification &amp; Risk → Compliance → Arbitration.
              Live model calls — this can take up to a minute.
            </div>
          </div>
        )}

        {ruling?.auto_release_eligible && (
          <Button disabled={busy}
            onClick={() => act(() => api.release(id), "Funds released automatically")}>
            Release funds (auto — {ruling.confidence}%)
          </Button>
        )}

        {needsHuman && role === "buyer" && (
          <div className="rounded-md border border-surface-line bg-surface p-3 text-xs text-neutral-500">
            {ruling.decision === "DISPUTE"
              ? "In dispute — a neutral arbitrator will rule. The case file on the right is what they see."
              : ruling.decision === "PENDING"
              ? "Waiting for the seller to provide the missing evidence."
              : "Awaiting human approval."}
          </div>
        )}
        {needsHuman && role !== "buyer" && (
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
                <div>
                  <label className="mb-1 block text-[10px] text-neutral-500">
                    Partial ruling (optional): amount to seller in USD — the remainder refunds the buyer
                  </label>
                  <input value={partial} onChange={(e) => setPartial(e.target.value)} type="number"
                    placeholder={`e.g. ${(esc.amount_cents / 100 * 0.8).toFixed(0)} for 80% of goods received`}
                    className="w-full rounded-md border border-surface-line bg-surface-raised p-2 text-sm text-neutral-200 outline-none focus:border-signal/50" />
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy || !who}
                    onClick={() => act(() => api.release(id, who, note, partialCents),
                      partialCents ? "Arbitrator ruled a partial settlement" : "Arbitrator released funds")}>
                    {partialCents ? `Release ${partial} to seller, refund rest` : "Release to seller"}
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
      {cf.transcript?.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[10px] uppercase tracking-wider text-neutral-600">Message transcript (evidence)</div>
          {cf.transcript.map((msg, i) => (
            <p key={i} className="text-[11px] text-neutral-500">
              <span className="text-neutral-400">{msg.author}:</span> {msg.text}
            </p>
          ))}
        </div>
      )}
    </Card>
  );
}

function ReviseDraft({ esc, busy, act }) {
  const [text, setText] = useState(esc.contract_text);
  const [amount, setAmount] = useState(String(esc.amount_cents / 100));
  const dirty = text !== esc.contract_text || Math.round(parseFloat(amount || "0") * 100) !== esc.amount_cents;
  return (
    <Card title="Your draft — awaiting seller acceptance">
      <p className="mb-3 text-xs text-neutral-500">
        Terms changed during negotiation? Revise here — the seller accepts the new
        version. Once accepted, the contract is hash-frozen and can never change.
      </p>
      <label className="mb-1 block text-xs text-neutral-500">Amount (USD)</label>
      <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number"
        className="mb-3 w-40 rounded-md border border-surface-line bg-surface p-2 text-sm text-neutral-200 outline-none focus:border-signal/50" />
      <label className="mb-1 block text-xs text-neutral-500">Contract text</label>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={10}
        className="mb-3 w-full rounded-md border border-surface-line bg-surface p-3 font-mono text-xs text-neutral-300 outline-none focus:border-signal/50" />
      <Button disabled={busy || !dirty}
        onClick={() => act(() => api.reviseDraft(esc.id, {
          contract_text: text,
          amount_cents: Math.round(parseFloat(amount) * 100),
        }), "Draft revised — seller sees the new version")}>
        Update draft
      </Button>
      {!dirty && <span className="ml-3 text-[10px] text-neutral-600">no changes yet</span>}
    </Card>
  );
}

function Wallet({ accountId, busy, act }) {
  const [acc, setAcc] = useState(null);
  const load = useCallback(() => api.getAccount(accountId).then(setAcc).catch(() => {}), [accountId]);
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, [load]);
  if (!acc) return null;
  return (
    <Card title="Your wallet" right={<span className="text-[10px] text-neutral-600">{acc.id}</span>}>
      <div className="mb-3 flex items-end justify-between">
        <div>
          <div className="text-xl font-semibold tabular-nums text-signal">{money(acc.available_cents)}</div>
          <div className="text-xs text-neutral-500">available</div>
        </div>
        <div className="text-right">
          <div className="text-sm tabular-nums text-neutral-300">{money(acc.locked_cents)}</div>
          <div className="text-xs text-neutral-500">locked in escrow</div>
        </div>
      </div>
      <Button kind="ghost" disabled={busy}
        onClick={() => act(async () => { await api.deposit(accountId, 10000000); load(); },
                           "Deposited $100,000 (demo funds)")}>
        + Add $100,000 demo funds
      </Button>
      <p className="mt-2 text-[10px] text-neutral-600">In production, funding arrives via the licensed banking partner.</p>
    </Card>
  );
}

function Acceptance({ esc, busy, act, role }) {
  const [name, setName] = useState(role === "seller" ? "Global Machinery Ltd" : "");
  return (
    <Card title="Seller acceptance required" className="border-signal/30">
      <p className="mb-1 text-sm text-neutral-300">
        The buyer has drafted this escrow. No funds are locked yet.
      </p>
      <p className="mb-3 text-xs text-neutral-500">
        Review the contract below; accepting freezes this exact text
        (hash-stamped) and locks the buyer's {money(esc.amount_cents)} in the engine.
      </p>
      <pre className="mb-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-md border border-surface-line bg-surface p-3 font-mono text-xs text-neutral-400">
        {esc.contract_text}
      </pre>
      <div className="flex gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)}
          placeholder="Your name (seller)"
          className="flex-1 rounded-md border border-surface-line bg-surface p-2 text-sm text-neutral-200 outline-none focus:border-signal/50" />
        <Button disabled={busy || !name}
          onClick={() => act(() => api.accept(esc.id, name), "Contract accepted — funds locked")}>
          Accept & lock funds
        </Button>
      </div>
      {!name && <p className="mt-1 text-[10px] text-warn">Enter your name to enable acceptance — it goes in the audit trail.</p>}
    </Card>
  );
}

function Messages({ esc, busy, act, settled, role }) {
  const [author, setAuthor] = useState(
    role === "buyer" ? "Bryn Industries" : role === "seller" ? "Global Machinery Ltd"
    : role === "arbitrator" ? "Arbitrator" : "");
  const [text, setText] = useState("");
  return (
    <Card title="Messages"
      right={<span className="text-[10px] text-neutral-600">immutable · part of the arbitration record</span>}>
      {esc.messages?.length > 0 ? (
        <ul className="mb-3 max-h-48 space-y-2 overflow-auto">
          {esc.messages.map((msg, i) => (
            <li key={i} className="rounded-md border border-surface-line bg-surface p-2">
              <div className="mb-0.5 flex justify-between text-[10px] text-neutral-600">
                <span className="font-medium text-neutral-400">{msg.author}</span>
                <span>{msg.at}</span>
              </div>
              <p className="text-xs text-neutral-300">{msg.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-xs text-neutral-600">
          No messages yet. Anything written here cannot be edited or deleted.
        </p>
      )}
      {!settled && (
        <div className="flex gap-2">
          {role ? (
            <span className="flex w-32 items-center rounded-md border border-surface-line bg-surface px-2 text-xs text-neutral-400">{author}</span>
          ) : (
          <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Name"
            className="w-28 rounded-md border border-surface-line bg-surface p-2 text-xs text-neutral-200 outline-none focus:border-signal/50" />
          )}
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message…"
            onKeyDown={(e) => { if (e.key === "Enter" && author && text) { act(() => api.sendMessage(esc.id, author, text), "Message sent"); setText(""); } }}
            className="flex-1 rounded-md border border-surface-line bg-surface p-2 text-xs text-neutral-200 outline-none focus:border-signal/50" />
          <Button kind="ghost" disabled={busy || !author || !text}
            onClick={() => { act(() => api.sendMessage(esc.id, author, text), "Message sent"); setText(""); }}>
            Send
          </Button>
        </div>
      )}
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

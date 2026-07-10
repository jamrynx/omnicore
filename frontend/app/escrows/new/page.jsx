"use client";
// Create escrow — seeds demo accounts if needed, one click loads the demo deal.
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../lib/api";
import { Card, Button } from "../../../lib/ui";
import { DEMO_CONTRACT, DEMO_DESCRIPTION } from "../../../lib/demo";

export default function CreateEscrow() {
  const router = useRouter();
  const [form, setForm] = useState({
    buyer_account: "ACC-1",
    seller_account: "ACC-2",
    amount: "250000",
    description: "",
    contract_text: "",
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [preflight, setPreflight] = useState(null);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const loadDemo = () =>
    setForm({ ...form, description: DEMO_DESCRIPTION, contract_text: DEMO_CONTRACT });

  const runPreflight = async () => {
    setBusy(true); setErr(null);
    try {
      if (!form.contract_text.trim()) throw new Error("Paste or load a contract first");
      setPreflight(await api.preflight(form.contract_text, form.description));
    } catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  const submit = async () => {
    if (!window.confirm(
      "Send this draft to the seller?\n\nThey will review and accept these exact terms. " +
      "You can still revise the draft until they accept — after acceptance the contract is frozen."
    )) return;
    setBusy(true); setErr(null);
    try {
      const payload = {
        buyer_account: form.buyer_account.trim(),
        seller_account: form.seller_account.trim(),
        amount_cents: Math.round(parseFloat(form.amount) * 100),
        description: form.description,
        contract_text: form.contract_text,
      };
      if (!payload.contract_text.trim()) throw new Error("Paste or load a contract first");
      if (!payload.amount_cents || payload.amount_cents <= 0) throw new Error("Enter a valid amount");
      let res;
      try {
        res = await api.createEscrow(payload);
      } catch (e) {
        if (/account not found/.test(e.message)) {
          await api.seedDemo(); // first run on a fresh engine — create demo accounts
          res = await api.createEscrow(payload);
        } else throw e;
      }
      router.push(`/escrows/${res.escrow_id}?as=buyer`);
    } catch (e) {
      setErr(e.message); setBusy(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-10">
      <Link href="/" className="text-xs text-neutral-500 hover:text-signal">← Dashboard</Link>
      <h1 className="mb-6 mt-2 text-2xl font-semibold text-neutral-100">Create escrow</h1>

      <Card>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Buyer account" value={form.buyer_account} onChange={set("buyer_account")} />
            <Field label="Seller account" value={form.seller_account} onChange={set("seller_account")} />
          </div>
          <Field label="Amount (USD)" value={form.amount} onChange={set("amount")} type="number" />
          <Field label="Description" value={form.description} onChange={set("description")}
                 placeholder="What is being purchased?" />
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="text-xs text-neutral-500">Contract text</label>
              <button onClick={loadDemo} className="text-xs text-signal hover:underline">
                Load demo contract
              </button>
            </div>
            <textarea value={form.contract_text} onChange={set("contract_text")} rows={10}
              placeholder="Paste the contract here — the Contract Agent extracts release conditions from it"
              className="w-full rounded-md border border-surface-line bg-surface p-3 font-mono text-xs text-neutral-300 outline-none focus:border-signal/50" />
          </div>
          {preflight && (
            <div className="rounded-md border border-surface-line bg-surface p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-neutral-500">
                  Pre-lock compliance check — {preflight.corridor}
                </span>
                <span className="text-[10px] text-neutral-600">before any funds lock</span>
              </div>
              {preflight.red_flags?.length > 0 && preflight.red_flags.map((f, i) => (
                <p key={"rf"+i} className="mb-1 text-xs text-warn">⚑ Contract: {f}</p>
              ))}
              {preflight.advisories?.map((adv, i) => (
                <div key={i} className="flex gap-2 border-b border-surface-line py-1.5 last:border-0">
                  <span className={`mt-0.5 text-xs ${adv.severity === "attention" ? "text-warn" : "text-neutral-500"}`}>
                    {adv.severity === "attention" ? "!" : "i"}
                  </span>
                  <p className="text-xs leading-relaxed text-neutral-400">{adv.message}</p>
                </div>
              ))}
              {(preflight.red_flags?.length ?? 0) === 0 && (preflight.advisories?.length ?? 0) === 0 && (
                <p className="text-xs text-signal">No gaps found for this corridor.</p>
              )}
              <p className="mt-2 text-[10px] italic text-neutral-600">{preflight.disclaimer}</p>
              <p className="mt-1 text-[10px] text-neutral-600">
                Fix these in the contract now, or proceed if they don't apply to your deal.
              </p>
            </div>
          )}
          {err && <p className="text-sm text-danger">{err}</p>}
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-neutral-600">Creates a draft — funds lock when the seller accepts the contract.</p>
            <div className="flex shrink-0 gap-2">
              <Button kind="ghost" onClick={runPreflight} disabled={busy}>
                {preflight ? "Re-check compliance" : "Check compliance first"}
              </Button>
              <Button onClick={submit} disabled={busy}>{busy ? "Creating…" : "Create escrow draft"}</Button>
            </div>
          </div>
        </div>
      </Card>
    </main>
  );
}

function Field({ label, ...props }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-500">{label}</label>
      <input {...props}
        className="w-full rounded-md border border-surface-line bg-surface p-2.5 text-sm text-neutral-200 outline-none focus:border-signal/50" />
    </div>
  );
}

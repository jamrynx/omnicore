"use client";
// Dashboard — stats from the engine, escrow list, system status in the footer.
import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../lib/api";
import { Card, StatusBadge, Button, money } from "../lib/ui";

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [escrows, setEscrows] = useState([]);
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState(null);

  const load = () => {
    api.stats().then(setStats).catch((e) => setErr(e.message));
    api.listEscrows().then(setEscrows).catch(() => {});
    api.health().then(setHealth).catch(() => {});
  };
  useEffect(load, []);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-signal-dim">OmniCore</div>
          <h1 className="text-2xl font-semibold text-neutral-100">Escrow Dashboard</h1>
        </div>
        <Link href="/escrows/new"><Button>Create escrow</Button></Link>
      </div>

      {err && (
        <Card className="mb-6 border-danger/40">
          <p className="text-sm text-danger">API unreachable: {err}. Are all three services running?</p>
        </Card>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card><Stat label="Active escrows" value={stats ? stats.escrows_active : "—"} tone="text-neutral-100" /></Card>
        <Card><Stat label="Funds locked" value={stats ? money(stats.total_locked_cents) : "—"} tone="text-signal" /></Card>
        <Card><Stat label="Released" value={stats ? stats.escrows_released : "—"} tone="text-signal" /></Card>
        <Card><Stat label="Refunded" value={stats ? stats.escrows_refunded : "—"} tone="text-warn" /></Card>
      </div>

      <Card title="Escrows — operator view (in production, parties see only their own deals)" right={<button onClick={load} className="text-xs text-neutral-500 hover:text-signal">refresh</button>}>
        {escrows.length === 0 ? (
          <div className="py-10 text-center text-sm text-neutral-500">
            No escrows yet. <Link className="text-signal hover:underline" href="/escrows/new">Create the first one</Link> —
            demo data loads with one click.
          </div>
        ) : (
          <div className="divide-y divide-surface-line">
            {escrows.map((e) => (
              <Link key={e.id} href={`/escrows/${e.id}`}
                className="flex items-center justify-between gap-4 py-3 transition hover:bg-surface/60">
                <div className="min-w-0">
                  <div className="font-mono text-sm text-neutral-200">{e.id}</div>
                  <div className="truncate text-xs text-neutral-500">{e.description || "—"}</div>
                </div>
                <div className="flex shrink-0 items-center gap-4">
                  <span className="text-sm tabular-nums text-neutral-300">{money(e.amount_cents)}</span>
                  <StatusBadge status={e.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <div className="mt-6 flex items-center gap-6 text-xs text-neutral-600">
        <span>API: {health ? "online" : "…"}</span>
        <span>Engine: {health?.engine === "ok" ? "online" : "…"}</span>
        <span>AI: {health?.ai || "…"}</span>
      </div>
    </main>
  );
}

function Stat({ label, value, tone = "text-neutral-100" }) {
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-neutral-500">{label}</div>
    </div>
  );
}

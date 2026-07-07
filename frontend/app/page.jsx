"use client";
// Day 1 status page: proves the whole stack is alive.
// Day 4 replaces this with the real golden-path UI from the mockups.
import { useEffect, useState } from "react";
import { api } from "../lib/api";

export default function Home() {
  const [health, setHealth] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setErr(e.message));
  }, []);

  const Row = ({ label, ok }) => (
    <div className="flex items-center justify-between border-b border-surface-line py-3">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className={ok ? "text-signal" : "text-danger"}>{ok ? "online" : "offline"}</span>
    </div>
  );

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <div className="mb-2 text-xs uppercase tracking-widest text-signal-dim">system status</div>
      <h1 className="mb-8 text-2xl font-semibold text-neutral-100">OmniCore</h1>
      <div className="rounded-lg border border-surface-line bg-surface-raised p-5">
        <Row label="API (FastAPI)" ok={!!health} />
        <Row label="Escrow engine (C++)" ok={health?.engine === "ok"} />
        <div className="flex items-center justify-between py-3">
          <span className="text-sm text-neutral-400">AI agents</span>
          <span className={health?.ai === "fireworks" ? "text-signal" : "text-warn"}>
            {health?.ai || "unknown"}
          </span>
        </div>
      </div>
      {err && <p className="mt-4 text-sm text-danger">API unreachable: {err}</p>}
    </main>
  );
}

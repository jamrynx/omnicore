// Shared UI vocabulary — one place so every screen speaks the same language.
export const money = (cents) =>
  (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export const STATUS = {
  DRAFT:    { label: "Draft — awaiting acceptance", cls: "bg-neutral-800 text-neutral-400 border-dashed border-neutral-700" },
  LOCKED:   { label: "Funds locked",  cls: "bg-neutral-800 text-neutral-300 border-neutral-700" },
  RELEASE:  { label: "Ready to release", cls: "bg-signal/10 text-signal border-signal/40" },
  PENDING:  { label: "Pending evidence", cls: "bg-warn/10 text-warn border-warn/40" },
  DISPUTE:  { label: "Dispute",       cls: "bg-danger/10 text-danger border-danger/40" },
  RELEASED: { label: "Released",      cls: "bg-signal/15 text-signal border-signal/50" },
  SETTLED_PARTIAL: { label: "Settled — partial", cls: "bg-signal/10 text-signal border-signal/30" },
  REFUNDED: { label: "Refunded",      cls: "bg-sky-400/10 text-sky-300 border-sky-400/40" },
};

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.LOCKED;
  return (
    <span className={`inline-block rounded-full border px-3 py-0.5 text-xs font-medium ${s.cls}`}>
      {s.label}
    </span>
  );
}

export function Card({ title, right, children, className = "" }) {
  return (
    <section className={`rounded-lg border border-surface-line bg-surface-raised p-5 ${className}`}>
      {(title || right) && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Button({ children, onClick, kind = "primary", disabled, type = "button" }) {
  const styles = {
    primary: "bg-signal text-surface hover:bg-signal/90 font-semibold",
    ghost: "border border-surface-line text-neutral-300 hover:border-signal/50 hover:text-signal",
    danger: "border border-danger/50 text-danger hover:bg-danger/10",
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      className={`rounded-md px-4 py-2 text-sm transition disabled:cursor-not-allowed disabled:opacity-40 ${styles[kind]}`}>
      {children}
    </button>
  );
}

export function Confidence({ value }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-line">
        <div className="h-full rounded-full bg-signal" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs tabular-nums text-neutral-400">{value}%</span>
    </div>
  );
}

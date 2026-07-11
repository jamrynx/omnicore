// Single client for the OmniCore API. Everything the UI needs lives here.
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function req(method, path, body) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.detail || data.error || `${r.status}`);
  return data;
}

export const api = {
  health: () => req("GET", "/health"),
  stats: () => req("GET", "/stats"),
  listEscrows: () => req("GET", "/escrows"),
  refund: (id, approvedBy, note) =>
    req("POST", `/escrows/${id}/refund`, { approved_by: approvedBy, resolution_note: note || "" }),
  listEscrows: () => req("GET", "/escrows"),
  demoScenario: (kind) => req("POST", `/demo/scenario/${kind}`),
  refund: (id, approvedBy, note) =>
    req("POST", `/escrows/${id}/refund`, { approved_by: approvedBy, resolution_note: note || "" }),
  seedDemo: () => req("POST", "/demo/seed"),
  createEscrow: (p) => req("POST", "/escrows", p),
  preflight: (contract_text, description) =>
    req("POST", "/compliance/preflight", { contract_text, description }),
  getEscrow: (id) => req("GET", `/escrows/${id}`),
  uploadDocument: (id, doc) => req("POST", `/escrows/${id}/documents`, doc),
  reviseDraft: (id, p) => req("PUT", `/escrows/${id}/draft`, p),
  accept: (id, name) => req("POST", `/escrows/${id}/accept`, { accepted_by: name }),
  sendMessage: (id, author, text) => req("POST", `/escrows/${id}/messages`, { author, text }),
  removeDocument: (id, index) => req("DELETE", `/escrows/${id}/documents/${index}`),
  uploadFile: async (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch(`${API}/escrows/${id}/documents/file`, { method: "POST", body: fd });
    const data = await r.json();
    if (!r.ok) throw new Error(data.detail || `${r.status}`);
    return data;
  },
  runReview: (id) => req("POST", `/escrows/${id}/review`),
  release: (id, approvedBy, note, releaseCents) =>
    req("POST", `/escrows/${id}/release`,
        approvedBy ? { approved_by: approvedBy, resolution_note: note || "",
                       release_cents: releaseCents ?? null } : undefined),
  getAccount: (id) => req("GET", `/accounts/${id}`),
  deposit: (id, cents) => req("POST", `/accounts/${id}/deposit`, { amount_cents: cents }),
};

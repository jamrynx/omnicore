# SETUP — Windows (PowerShell), step by step

You'll run three things side by side: the C++ engine, the Python API, and
the Next.js frontend. Open three PowerShell terminals in the project root
(e.g. `C:\dev\omnicore`).

---

## 0. One-time prerequisites

- **Python 3.11+** — check with `python --version`
- **Node.js 18+** — check with `node --version`
- **A C++ compiler** — pick ONE:
  - **Option A (recommended): WSL** — if you have WSL/Ubuntu installed,
    compile the engine there; it's the same command I tested.
  - **Option B: MinGW-w64 via MSYS2** — install from https://www.msys2.org,
    then in the MSYS2 terminal: `pacman -S mingw-w64-ucrt-x86_64-gcc`
    and add `C:\msys64\ucrt64\bin` to your PATH.

---

## Terminal 1 — C++ engine

**WSL:**
```bash
cd engine
g++ -std=c++20 -O2 -o engine src/main.cpp -lpthread
./engine 7070
```

**Windows/MinGW** (note the extra `-lws2_32` — Windows sockets):
```powershell
cd engine
g++ -std=c++20 -O2 -o engine.exe src/main.cpp -lws2_32
.\engine.exe 7070
```

You should see: `OmniCore engine listening on :7070`

---

## Terminal 2 — Python API (with venv)

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1     # prompt now shows (venv)
pip install -r requirements.txt
copy ..\.env.example .env       # edit later when credits arrive
uvicorn app.main:app --port 8000 --reload
```

If PowerShell blocks activation, run once:
`Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser`

Check http://localhost:8000/health — it should show
`"ai": "mock (no API key — offline mode)"`. That's correct for now.
Interactive docs: http://localhost:8000/docs

**Note (WSL engine + Windows API):** if the engine runs in WSL and the API
in Windows, localhost usually just works on recent WSL2. If `/health` says
the engine is unreachable, run the API inside WSL too — simplest fix.

---

## Terminal 3 — Frontend

```powershell
cd frontend
npm install        # first time only, ~1-2 min
npm run dev
```

Open http://localhost:3000 — the status page should show API and engine
**online**, AI in **mock** mode.

---

## When your Fireworks credits arrive

1. Open `backend\.env`
2. Set `FIREWORKS_API_KEY=fw_...` (from the fireworks.ai dashboard)
3. Restart uvicorn (Ctrl+C, run again)
4. `/health` now says `"ai": "fireworks"` — mocks are off, agents are live
5. If the model errors, check the exact model name in your Fireworks
   dashboard and set `OMNICORE_MODEL` in `.env` to match

---

## 2-minute smoke test (Terminal 2, venv active, all three running)

In the browser at http://localhost:8000/docs:
1. `POST /demo/seed` — creates buyer (ACC-1, $500k) and seller (ACC-2)
2. `POST /escrows` — buyer_account `ACC-1`, seller_account `ACC-2`,
   amount_cents `25000000`, contract_text: paste `demo-data/contract.txt`
3. `POST /escrows/ESC-1/documents` — paste each clean demo doc
   (use names containing "Bill of Lading", "Inspection Report",
   "Commercial Invoice", "Customs" so the mocks recognize them — the
   file contents already do)
4. `POST /escrows/ESC-1/review` — expect `"decision": "RELEASE"`
5. `POST /escrows/ESC-1/release` — expect `"released_by": "auto"`

Then repeat with `invoice_MISMATCHED.txt` in the documents — expect
`DISPUTE`, a blocked release, and a case file on `GET /escrows/ESC-2`.

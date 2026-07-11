#!/bin/sh
# OmniCore all-in-one entrypoint: engine + API + web in one container.
engine 7070 &
cd /app/backend && python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
cd /app/frontend && npm run start -- -p 3000 -H 0.0.0.0 &
wait

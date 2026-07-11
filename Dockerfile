# OmniCore all-in-one image — for hackathon submission (single public image).
# Build:  docker build -t ghcr.io/YOURUSER/omnicore:v1 .
# Run:    docker run -p 3000:3000 -p 8000:8000 -e FIREWORKS_API_KEY=fw_... ghcr.io/YOURUSER/omnicore:v1
FROM gcc:13 AS engine-build
WORKDIR /src
COPY engine/httplib.h engine/json.hpp ./
COPY engine/src/ src/
RUN g++ -std=c++20 -O2 -static-libstdc++ -o engine src/main.cpp -lpthread

FROM node:20-slim AS web-build
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY frontend/ .
RUN npm run build

FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends nodejs npm && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir -r backend/requirements.txt
COPY backend/app backend/app
COPY --from=engine-build /src/engine /usr/local/bin/engine
COPY --from=web-build /web /app/frontend
COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh
ENV ENGINE_URL=http://localhost:7070
EXPOSE 3000 8000 7070
CMD ["/app/start.sh"]

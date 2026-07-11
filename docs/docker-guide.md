# Docker — running, publishing, and demoing OmniCore

## Run everything locally (one command)

```powershell
cd C:\dev\omnicore
docker compose up --build     # Docker Desktop must be running
```
First build takes minutes. Then open http://localhost:3000. Put
`FIREWORKS_API_KEY=fw_...` in a `.env` file next to docker-compose.yml for
live agents. Stop your three manual terminals first — same ports.

## Publish the submission image (ghcr.io)

The judging pipeline pulls a PUBLIC image (linux/amd64) and runs it.

```powershell
# 1. Build the all-in-one image (from project root; note the final dot)
docker build -t ghcr.io/YOURGITHUBUSER/omnicore:v1 .

# 2. Cold-test it exactly as judges will run it
docker run --rm -p 3000:3000 -p 8000:8000 -e FIREWORKS_API_KEY=fw_yourkey ghcr.io/YOURGITHUBUSER/omnicore:v1
#    -> open http://localhost:3000, run one scenario end to end

# 3. Log in to GitHub Container Registry
#    First create a token: github.com -> Settings -> Developer settings ->
#    Personal access tokens (classic) -> scopes: write:packages
docker login ghcr.io -u YOURGITHUBUSER    # password = that token

# 4. Push
docker push ghcr.io/YOURGITHUBUSER/omnicore:v1

# 5. Make it PUBLIC: github.com -> your profile -> Packages -> omnicore ->
#    Package settings -> Change visibility -> Public
```

Submission field value: `ghcr.io/YOURGITHUBUSER/omnicore:v1`
(exact string, no https://, tag included)

## Demoing Docker in the video

One short beat is enough: show `docker compose up` (or the docker run) in a
terminal with all three services logging, say "the entire stack is
containerized — one command, or one public image", then cut to the browser.

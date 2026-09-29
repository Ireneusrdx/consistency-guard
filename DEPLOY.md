# Deploying Consistency Guard to production

Consistency Guard is a full-stack app (React client + Node/Express API + Postgres).
The Docker image builds everything into one container: the API serves the client
bundle, so you deploy **one service** and get a permanent live link.

You need three secrets, generated once and stored in your hosting provider:

```bash
openssl rand -hex 32   # → JWT_SECRET (signs login sessions)
openssl rand -hex 32   # → ENCRYPTION_KEY (encrypts stored provider API keys)
openssl rand -hex 24   # → DB_PASSWORD (Postgres password, compose/VPS only)
```

On first boot the container runs `prisma migrate deploy` automatically, then
starts the server. Health check: `GET /api/health`.

---

## Option A — Render (easiest, permanent link)

**Free tier ($0/month):** this repo's `render.yaml` is configured for Render's
free web-service plan. Pair it with a free Neon Postgres
(https://neon.tech — 0.5 GB free): create a Neon project and paste its
connection string as `DATABASE_URL` when Render prompts during Blueprint
creation. The free service sleeps after ~15 min idle and wakes on visit.
Use Neon's **pooled** connection string if offered — the container
automatically uses a direct connection for migrations (Prisma Migrate cannot
run through a pooler); or set `DIRECT_DATABASE_URL` to override it.

1. Push this folder to a GitHub repo.
2. Render dashboard → **New → Blueprint** → select the repo. When prompted,
   paste your Neon connection string as `DATABASE_URL`. `JWT_SECRET` and
   `ENCRYPTION_KEY` are generated automatically.
3. After the first deploy, copy your service URL
   (`https://<service>.onrender.com`) and set it as the service's
   `CORS_ORIGINS` env var (replace the placeholder).
4. Open the URL, register an account, add your Pollinations `sk_` key
   (or any provider key) in **Provider Setup → Test**, and run an evaluation.

Notes: the database persists independently of deploys. On the free plan the
service sleeps when idle (first visit after sleep takes ~30–60s to wake).

## Option B — Railway

1. Push to GitHub → Railway **New Project → Deploy from repo**.
2. Add a **Postgres** plugin to the project.
3. In the service → **Variables**, set:
   - `NODE_ENV=production`, `DB_PROVIDER=postgresql`
   - `DATABASE_URL` → reference the Postgres plugin (`${{Postgres.DATABASE_URL}}`)
   - `JWT_SECRET`, `ENCRYPTION_KEY` (generated values)
   - `CORS_ORIGINS` → your Railway domain (`https://<service>.up.railway.app`)
4. Railway builds the Dockerfile automatically. Open the generated domain.

## Option C — Any VPS with Docker (Hetzner, DigitalOcean, …)

```bash
# on the server
git clone <your-repo> && cd consistency-guard
DB_PASSWORD=<strong> JWT_SECRET=<hex> ENCRYPTION_KEY=<hex> \
  CORS_ORIGINS=https://your-domain.com \
  docker compose up -d --build
```

Put Caddy/Nginx in front for HTTPS, e.g. Caddy:

```
your-domain.com {
    reverse_proxy localhost:4000
}
```

## After deploy — smoke test

1. `curl https://<your-domain>/api/health` → `{"ok":true,…}`
2. Register a user in the UI (no demo accounts exist in production).
3. **Provider Setup** → add a Pollinations `sk_` key → **Test** → expect OK.
4. **Evaluate** → pick 2–3 models → run → results appear with real metrics.

## Configuration reference

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection string (production) |
| `DB_PROVIDER` | yes (prod) | `postgresql` — the entrypoint migrates automatically |
| `JWT_SECRET` | yes | 32+ random hex chars; missing value refuses to boot in production |
| `ENCRYPTION_KEY` | yes | 32+ random hex chars for API-key encryption |
| `CORS_ORIGINS` | yes | Comma-separated allowed origins, e.g. your domain |
| `PORT` | no | default `4000` |
| `EVIDENCE_CORPUS_PATH` | no | JSON evidence corpus; unset → claims reported unverified, never fabricated |
| `VITE_API_URL` | no | leave unset — the client calls same-origin `/api` |

## Notes

- There is no demo mode in production builds: no demo login, no sample data,
  no mock providers. Seed data (`npm run seed`) refuses to run in production
  unless `ALLOW_SEED=true`.
- Back up the Postgres volume/database on your schedule; user accounts and
  encrypted provider keys live there.
- To update: push to GitHub (Render/Railway redeploy automatically) or
  `docker compose up -d --build` on your VPS.

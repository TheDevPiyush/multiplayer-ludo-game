# Deploying Simple Ludo

Simple Ludo runs with Docker Compose on the same droplet as the ERP stack:

| Service | What | Public at |
|---|---|---|
| `api` | Game server (`server/`, Bun + Express + Socket.IO) | `https://api.simple-ludo.thedevpiyush.com` |
| `web` | Website and invite pages (`web/`, Next.js) | `https://simple-ludo.thedevpiyush.com` |
| `redis` | Live game snapshots, so games survive deploys | internal only |

There is no proxy in this stack. The ERP's Caddy (`erp-prod-proxy-1`) already owns
ports 80/443, so it serves our domains too (HTTPS certificates included): see
[Shared Caddy](#shared-caddy).

`https://simple-ludo.thedevpiyush.com/.well-known/*` is answered by the API, so app-link
verification is configured in one place (`ANDROID_CERT_SHA256`, `IOS_APP_ID`).

## What a deploy does

A push to `main` that touches `server/`, `packages/ludo-engine/`, `web/` or `deploy/`
(or Actions → **Deploy** → **Run workflow**) runs `.github/workflows/deploy.yml`:

1. **check**: engine tests, server typecheck, the server tests that don't need a database.
2. **build**: builds the API and website images and pushes them to GitHub Container
   Registry (`ghcr.io/thedevpiyush/simple-ludo-api` / `-web`), tagged with the commit SHA.
3. **deploy**, over SSH as `root`:
   - copies this folder to `/opt/simple-ludo`;
   - runs `bootstrap.sh`: installs Docker and adds 2 GB of swap if the server has
     none, skipping whatever is already done (it leaves the firewall alone);
   - writes `/opt/simple-ludo/api.env` from the `API_ENV` secret (sent over stdin, file
     mode 600);
   - runs `release.sh`: pulls the images, runs `prisma migrate deploy`, starts the stack,
     waits for the API's healthcheck, then copies `caddy/simple-ludo.caddy` to
     `/opt/caddy-sites/` and reloads the shared Caddy. If Caddy rejects the file, the
     previous one is put back and the deploy fails; the running config never changes.

The droplet keeps no GitHub credentials: the registry login uses the workflow's own
short-lived token and logs out straight after the pull.

## One-time setup (no droplet login needed)

### 1. SSH key for GitHub Actions

```bash
ssh-keygen -t ed25519 -f simple-ludo-deploy -N "" -C "github-actions"
```

### 2. Droplet

Create an Ubuntu 24.04 droplet (1 GB RAM or more; Basic $6/month is fine to start).
Under **Authentication → SSH Key**, add `simple-ludo-deploy.pub` (plus your own key, if
you want to log in yourself). Nothing else: the first deploy sets it up.

### 3. DNS (wherever thedevpiyush.com is managed)

| Type | Name | Value |
|---|---|---|
| A | `simple-ludo` | droplet IP |
| A | `api.simple-ludo` | droplet IP |
| A | `www.simple-ludo` | droplet IP (optional; redirects to the site) |

On Cloudflare, set these to **DNS only** (grey cloud). With the orange-cloud proxy on,
set `TRUST_PROXY_HOPS` to 2 in `docker-compose.yml`, so rate limits see the player's IP
and not Cloudflare's.

### 4. GitHub secrets

Repo → Settings → Environments → **New environment** `production` → add:

| Secret | Value |
|---|---|
| `DROPLET_HOST` | droplet IP |
| `DROPLET_SSH_KEY` | contents of `simple-ludo-deploy` (the private key, all lines) |
| `API_ENV` | the API's environment file: `api.env.example` filled in from your `server/.env` |

Then delete the local key files. To change an API setting later, edit `API_ENV` and
re-run the workflow.

### 5. Deploy

Actions → **Deploy** → **Run workflow** (or push to `main`). The first run takes a few
minutes longer while Docker installs. Caddy gets the certificates on the first request
to each domain, so DNS must already point at the droplet.

```bash
curl https://api.simple-ludo.thedevpiyush.com/health
curl https://simple-ludo.thedevpiyush.com/.well-known/assetlinks.json
```

### 6. Point the app at the new domains

In EAS → Project → Environment variables (preview and production), and in `app/.env`:

```
EXPO_PUBLIC_API_URL=https://api.simple-ludo.thedevpiyush.com
EXPO_PUBLIC_LINK_URL=https://simple-ludo.thedevpiyush.com
```

The link domain is compiled into the native app (Android intent filters, iOS associated
domains), so this needs a new native build, not just an EAS Update.

## Everyday

- **Rollback**: Actions → an older successful **Deploy** run → re-run its `deploy` job.
  It deploys that run's images (tagged by commit SHA).
- **Migrations** run on every deploy, before the new API starts. They use `DIRECT_URL`
  (the Supabase session pooler, port 5432) from `API_ENV`.
- **Deploys** restart the API, which drops sockets for a few seconds. Live games are
  flushed on shutdown and come back from Redis; the app reconnects by itself.
- **Logs**, if you do log in: `ssh root@<droplet-ip>`, then
  `cd /opt/simple-ludo && docker compose ps` / `docker compose logs -f api`.

## Shared Caddy

One Caddy per server owns ports 80/443; here it is the ERP stack's `proxy` service
(`erp_mono_repo`). It is set up to serve other apps too:

- its Caddyfile ends with `import /etc/caddy/sites/*.caddy`;
- it mounts `/opt/caddy-sites` (host) at `/etc/caddy/sites`, read-only;
- it joins the external Docker network `edge`, where this stack's containers have the
  aliases `simple-ludo-api` and `simple-ludo-web`.

`release.sh` finds that Caddy by its `/etc/caddy/sites` mount, so nothing here names the
ERP's containers. If the deploy says "No running Caddy mounts /opt/caddy-sites", the
ERP proxy hasn't been redeployed with that setup yet: deploy the ERP, then re-run this
deploy.

Another app on this server joins the same way: put its containers on `edge` with unique
aliases and drop a `<app>.caddy` file into `/opt/caddy-sites`.

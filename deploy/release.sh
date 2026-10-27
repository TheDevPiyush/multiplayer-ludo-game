#!/usr/bin/env bash
# Starts a release. Run by GitHub Actions on the droplet, in /opt/simple-ludo, with
# IMAGE_PREFIX and IMAGE_TAG set and a GitHub token for the registry on stdin.
set -euo pipefail
cd "$(dirname "$0")"

: "${IMAGE_PREFIX:?}" "${IMAGE_TAG:?}" "${GHCR_USER:?}"
[ -s api.env ] || { echo "api.env is missing or empty"; exit 1; }

# Sites served by the server's shared Caddy, which mounts this folder at /etc/caddy/sites.
SITES_DIR=${SITES_DIR:-/opt/caddy-sites}
SITE_FILE=simple-ludo.caddy

# Pins the images, so a reboot or a manual `docker compose up` runs this release.
printf 'IMAGE_PREFIX=%s\nIMAGE_TAG=%s\n' "$IMAGE_PREFIX" "$IMAGE_TAG" > .env

docker login ghcr.io -u "$GHCR_USER" --password-stdin
docker compose pull api web
docker logout ghcr.io >/dev/null

# The network the shared Caddy reaches the API and website on.
docker network inspect edge >/dev/null 2>&1 || docker network create edge >/dev/null

# Schema changes go in before the new code starts.
docker compose run --rm --no-deps api bunx --bun prisma migrate deploy

docker compose up -d --remove-orphans

# The deploy only counts once the new API passes its healthcheck.
status=starting
for _ in $(seq 1 30); do
    status=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q api)")
    [ "$status" = healthy ] && break
    sleep 2
done
echo "api: $status"
if [ "$status" != healthy ]; then
    docker compose logs --tail 50 api
    exit 1
fi

# Hand our sites to the shared Caddy. A rejected config never replaces the running
# one, and the previous site file is put back so the proxy's next restart still works.
proxy=$(docker ps -q --filter volume=/etc/caddy/sites | head -1)
if [ -z "$proxy" ]; then
    echo "No running Caddy mounts $SITES_DIR at /etc/caddy/sites (see deploy/README.md → Shared Caddy)."
    echo "The API and website are running but not reachable from outside yet."
    exit 1
fi
reload() { docker exec "$proxy" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile; }

mkdir -p "$SITES_DIR"
had_previous=false
if [ -f "$SITES_DIR/$SITE_FILE" ]; then
    cp "$SITES_DIR/$SITE_FILE" "$SITES_DIR/$SITE_FILE.previous"
    had_previous=true
fi
cp "caddy/$SITE_FILE" "$SITES_DIR/$SITE_FILE"
if ! reload; then
    echo "Caddy rejected the new site file; restoring the previous one."
    if $had_previous; then
        mv "$SITES_DIR/$SITE_FILE.previous" "$SITES_DIR/$SITE_FILE"
    else
        rm -f "$SITES_DIR/$SITE_FILE"
    fi
    reload || true
    exit 1
fi
rm -f "$SITES_DIR/$SITE_FILE.previous"
echo "sites loaded into $(docker inspect --format '{{.Name}}' "$proxy" | tr -d /)"

docker image prune -f >/dev/null

#!/usr/bin/env bash
# Starts a release. Run by GitHub Actions on the droplet, in /opt/simple-ludo, with
# IMAGE_PREFIX and IMAGE_TAG set and a GitHub token for the registry on stdin.
set -euo pipefail
cd "$(dirname "$0")"

: "${IMAGE_PREFIX:?}" "${IMAGE_TAG:?}" "${GHCR_USER:?}"
[ -s api.env ] || { echo "api.env is missing or empty"; exit 1; }

# Pins the images, so a reboot or a manual `docker compose up` runs this release.
printf 'IMAGE_PREFIX=%s\nIMAGE_TAG=%s\n' "$IMAGE_PREFIX" "$IMAGE_TAG" > .env

docker login ghcr.io -u "$GHCR_USER" --password-stdin
docker compose pull api web
docker logout ghcr.io >/dev/null

# Schema changes go in before the new code starts.
docker compose run --rm --no-deps api bunx --bun prisma migrate deploy

docker compose up -d --remove-orphans
# Picks up Caddyfile changes; a no-op when nothing changed.
docker compose exec -T caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile

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

docker image prune -f >/dev/null

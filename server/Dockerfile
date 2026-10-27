# Game API (Express + Socket.IO on Bun).
# Build from the repo root, because the server imports packages/ludo-engine:
#   docker build -f server/Dockerfile -t simple-ludo-api .
FROM oven/bun:1.4.3-slim

ENV NODE_ENV=production
WORKDIR /app/server

# Dependencies first, so code changes don't reinstall them. Prisma's CLI (a dev
# dependency) stays in the image: deploys run `prisma migrate deploy` with it.
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile

COPY packages/ludo-engine /app/packages/ludo-engine
COPY server/ ./

# prisma.config.ts asks for a database URL even though generating doesn't connect.
RUN DATABASE_URL="postgresql://build:build@localhost:5432/build" bunx --bun prisma generate

USER bun
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD bun -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
CMD ["bun", "run", "index.ts"]

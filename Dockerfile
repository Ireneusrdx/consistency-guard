# Consistency Guard — production image (single container: API + built client).
# Build:  docker build -t consistency-guard .
# Run:    docker compose up -d   (Postgres included)

# ---------- build stage ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Prisma needs the OpenSSL CLI to detect the correct engine binaries
# (bookworm ships OpenSSL 3.x; without it Prisma defaults to the 1.1.x
# engines, which crash with an empty "Schema engine error").
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./server/
COPY client/package.json client/package-lock.json ./client/
RUN cd server && npm ci --no-audit --no-fund
RUN cd client && npm ci --no-audit --no-fund

COPY server ./server
COPY client ./client

# Build the client bundle.
RUN cd client && npm run build

# Point Prisma at Postgres for the production client, then generate + build server.
RUN cd server \
  && sed -i 's/provider = "sqlite"/provider = "postgresql"/' prisma/schema.prisma \
  && npx prisma generate \
  && npm run build

# ---------- runtime stage ----------
FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Same OpenSSL fix as the build stage: the entrypoint re-runs
# `prisma generate` and `prisma migrate deploy` at container boot,
# and the app's Prisma Client needs the right engine too.
RUN apt-get update -y && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --no-audit --no-fund && npm cache clean --force

COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/server/prisma ./server/prisma
COPY --from=build /app/server/data ./server/data
COPY --from=build /app/client/dist ./client/dist
COPY docker-entrypoint.sh ./
# Writable dirs + ownership for the unprivileged runtime user (the entrypoint
# rewrites prisma/schema.prisma and regenerates the client; the app writes
# report PDFs under uploads/).
RUN chmod +x ./docker-entrypoint.sh \
  && mkdir -p ./uploads/reports \
  && chown -R node:node /app

# Never run as root: node:20-bookworm-slim ships an unprivileged `node` user.
USER node

EXPOSE 4000
ENTRYPOINT ["./docker-entrypoint.sh"]

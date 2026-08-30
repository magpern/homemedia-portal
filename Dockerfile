# syntax=docker/dockerfile:1
#
# Portal v1 production image (WP12). Multi-stage, non-root, digest-pinned base.
# No Compose, no socket mount, no privileged settings, no server configuration —
# runtime configuration is environment-only and fails closed at boot
# (`src/lib/server/env.ts`).

# Node 22 LTS on Alpine, pinned by its multi-arch index digest. Never a floating
# tag; bump this digest deliberately. Resolved from the official Node 22 Alpine
# image on Docker Hub (Alpine 3.24, published 2026-07-29).
FROM node@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32 AS base
WORKDIR /app

# --- production dependencies only ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --fund=false

# --- build the adapter-node output (dev deps needed; WASM Argon2 = no toolchain) ---
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --fund=false
COPY . .
RUN npm run build

# --- minimal non-root runtime ---
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps  --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/build        ./build
COPY --from=build --chown=node:node /app/package.json ./package.json
USER node

# Liveness only. Targets the **configured runtime listener** (`$PORT`, which the
# deployment always sets) on loopback — never a literal address or port. `node`'s
# fetch tries both loopback families, so it works whichever `HOST` the deployment
# binds. No `EXPOSE`: it is documentation-only and would commit a concrete port
# that the private Compose deployment does not need.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://localhost:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "build"]

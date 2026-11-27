# Kartesian for Google Cloud Run.
#
# Kartesian is a static Next.js export: all data lives in the user's browser, so the
# container only serves files from out/ with the project's security headers.
# Deploy guide: docs/guides/DEPLOY-CLOUD-RUN.md

ARG NODE_VERSION=24.13.0

# ---- Build: install with the pinned pnpm, then produce out/ -------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS build
WORKDIR /app
ENV CI=true \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# pnpm version comes from "packageManager" in package.json.
RUN corepack enable

# Dependencies first, so this layer is reused while only source files change.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ---- Runtime: Node and the static files only ----------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8080

# serve-next.cjs uses only Node built-ins and serves ../../out relative to itself.
COPY --from=build --chown=node:node /app/out ./out
COPY --from=build --chown=node:node /app/scripts/build/serve-next.cjs ./scripts/build/serve-next.cjs

USER node
EXPOSE 8080
CMD ["node", "scripts/build/serve-next.cjs"]

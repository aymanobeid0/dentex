# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS base
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

FROM base AS dependencies
COPY package.json package-lock.json ./
RUN --mount=type=cache,id=dentex-npm,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS generated
COPY prisma/schema.prisma ./prisma/schema.prisma
COPY prisma.config.ts ./
RUN npm run db:generate

FROM generated AS build
COPY tsconfig.json vite.config.ts index.html design-tokens.css ./
COPY client ./client
COPY server ./server
COPY scripts/platform-admin.ts ./scripts/platform-admin.ts
RUN npm run build

# Reuse installed packages; keep migration tooling out of the application image.
FROM dependencies AS migrations
COPY prisma ./prisma
COPY prisma.config.ts ./
USER node
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy"]

FROM dependencies AS production-dependencies
RUN npm prune --omit=dev --omit=optional --ignore-scripts --no-audit --no-fund

FROM base AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server
COPY --chown=node:node package.json ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist-server/server/index.js"]

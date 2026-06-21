# Pre-built deployment image — compile TypeScript and React LOCALLY before zipping.
# This keeps the EB Docker build to a single `yarn install --production` (~2 min vs 30+ min).
#
# Build locally before creating the zip:
#   yarn tsc
#   cd frontend && yarn build && cd ..
#   zip -r zalyx-deploy.zip Dockerfile docker-compose.yml package.json yarn.lock dist/ frontend/dist/ data/

FROM node:20-alpine
WORKDIR /app

# Production deps only
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

# Pre-compiled backend (TypeScript → JS, built locally via `yarn tsc`)
COPY dist/ ./dist/

# Pre-built frontend (Vite output, built locally via `cd frontend && yarn build`)
COPY frontend/dist/ ./frontend/dist/

# Merchant snapshot data (anonymized demo merchants)
COPY data/ ./data/

EXPOSE 3001
ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "dist/server.js"]

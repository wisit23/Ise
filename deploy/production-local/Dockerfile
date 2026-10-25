# Isolated Node 24 build path; existing Compose Dockerfiles are unchanged.
FROM node:24-bookworm-slim AS workspace
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/shared/package.json backend/shared/package.json
COPY backend/gateway/package.json backend/gateway/package.json
COPY backend/services/auth-service/package.json backend/services/auth-service/package.json
COPY backend/services/product-service/package.json backend/services/product-service/package.json
COPY backend/services/order-service/package.json backend/services/order-service/package.json
COPY backend/services/chat-service/package.json backend/services/chat-service/package.json
COPY backend/services/support-service/package.json backend/services/support-service/package.json
COPY frontend/package.json frontend/package.json
COPY backend/shared backend/shared

FROM workspace AS backend
ARG WORKSPACE=backend/gateway
RUN npm ci --workspace "./${WORKSPACE}" --omit=dev
COPY --chown=node:node ${WORKSPACE} ${WORKSPACE}
WORKDIR /app/${WORKSPACE}
RUN if [ -f prisma/schema.prisma ]; then npx --no-install prisma generate; fi
ENV NODE_ENV=production
USER node
CMD ["node", "src/server.js"]

FROM workspace AS frontend-build
RUN npm ci --workspace ./frontend
COPY frontend frontend
WORKDIR /app/frontend
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM workspace AS frontend
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=frontend-build --chown=node:node /app/node_modules /app/node_modules
COPY --from=frontend-build --chown=node:node /app/frontend /app/frontend
WORKDIR /app/frontend
USER node
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]

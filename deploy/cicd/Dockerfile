# Build from the repository root. Preserve the existing cloud mount paths.
# Sharp 0.34.5's glibc x64 binary requires x86-64-v2; the production VM
# supports the musl binary used by its existing Alpine application images.
FROM node:22-alpine AS dependencies
RUN apk add --no-cache openssl ca-certificates
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
ARG WORKSPACE=backend/gateway
RUN npm ci --workspace "./${WORKSPACE}" --omit=dev

FROM dependencies AS backend
ARG WORKSPACE=backend/gateway
ARG RUNTIME_PATH=gateway
RUN if [ "$WORKSPACE" = backend/services/product-service ]; then \
      apk add --no-cache ffmpeg; fi
COPY ${WORKSPACE} /app/${RUNTIME_PATH}
# npm can keep dependencies inside the workspace instead of hoisting them.
# Retain those modules while preserving the existing runtime/storage paths.
RUN if [ -d "/app/${WORKSPACE}/node_modules" ]; then \
      ln -s "/app/${WORKSPACE}/node_modules" "/app/${RUNTIME_PATH}/node_modules"; \
    fi
WORKDIR /app/${RUNTIME_PATH}
RUN node -e 'require.resolve("@reloop/shared")' && \
    if [ "$WORKSPACE" = backend/services/product-service ]; then \
      node -e 'require("sharp")({create:{width:1,height:1,channels:3,background:"black"}}).png().toBuffer().catch(e=>{console.error(e.message);process.exit(1)})'; \
    fi
RUN if [ -f prisma/schema.prisma ]; then npx --no-install prisma generate; fi
ENV NODE_ENV=production
# Existing mounts can be root-owned; preserve the cloud image's user in this transition.
CMD ["node", "src/server.js"]

FROM dependencies AS frontend-build
RUN npm ci --workspace ./frontend
COPY frontend frontend
WORKDIR /app/frontend
# The same image is promoted between environments; /api and Socket.IO use the site's origin.
ENV NEXT_PUBLIC_API_URL=""
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_REPORT_TIMEZONE=Asia/Bangkok
ARG NEXT_PUBLIC_REPORT_SEARCH_DEBOUNCE_MS=300
ARG NEXT_PUBLIC_REPORT_REQUEST_TIMEOUT_MS=10000
RUN npm run build

FROM node:22-alpine AS frontend
WORKDIR /app/frontend
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=frontend-build /app/node_modules /app/node_modules
COPY --from=frontend-build /app/frontend /app/frontend
COPY --from=frontend-build /app/backend/shared /app/backend/shared
RUN node -e 'require("sharp")({create:{width:1,height:1,channels:3,background:"black"}}).png().toBuffer().catch(e=>{console.error(e.message);process.exit(1)})'
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0"]

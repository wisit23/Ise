FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/services/chat-service ./services/chat-service

RUN npm install --prefix ./shared

WORKDIR /app/services/chat-service
RUN npm install
RUN npx prisma generate

# Runtime startup must never mutate production schema/indexes. Schema rollout
# is an explicit deployment step; application-level deterministic IDs keep
# create-or-open safe even for an older Mongo database missing contextKey index.
CMD ["node", "src/server.js"]

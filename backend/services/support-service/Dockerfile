FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/services/support-service ./services/support-service

RUN npm install --prefix ./shared

WORKDIR /app/services/support-service
RUN npm install
RUN npx prisma generate

CMD ["sh", "-c", "node prisma/migrate.js && node prisma/seed.js && node src/server.js"]

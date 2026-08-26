FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/services/product-service ./services/product-service

RUN npm install --prefix ./shared

WORKDIR /app/services/product-service
RUN npm install
RUN npx prisma generate

# Schema migrations and any seed data must be run as an explicit release step.
# Starting a replacement container must never alter a live database.
CMD ["node", "src/server.js"]

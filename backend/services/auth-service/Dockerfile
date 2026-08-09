FROM node:22-alpine
RUN apk add --no-cache openssl
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/services/auth-service ./services/auth-service

RUN npm install --prefix ./shared

WORKDIR /app/services/auth-service
RUN npm install
RUN npx prisma generate

CMD ["sh", "-c", "npx prisma db push --skip-generate && npx prisma db seed && node src/server.js"]

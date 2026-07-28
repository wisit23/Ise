FROM node:22-alpine
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/services/order-service ./services/order-service

RUN npm install --prefix ./shared

WORKDIR /app/services/order-service
RUN npm install --omit=dev

CMD ["node", "src/server.js"]

FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/services/product-service ./services/product-service

RUN npm install --prefix ./shared

WORKDIR /app/services/product-service
RUN npm install --omit=dev

CMD ["node", "src/server.js"]

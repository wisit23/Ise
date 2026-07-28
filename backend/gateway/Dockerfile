FROM node:22-alpine
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/gateway ./gateway

RUN npm install --prefix ./shared

WORKDIR /app/gateway
RUN npm install --omit=dev

CMD ["node", "src/server.js"]

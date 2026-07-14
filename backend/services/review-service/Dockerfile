FROM node:20-alpine
WORKDIR /app

COPY package.json ./
COPY backend/shared ./shared
COPY backend/services/review-service ./services/review-service

RUN npm install --prefix ./shared

WORKDIR /app/services/review-service
RUN npm install --omit=dev

CMD ["node", "src/server.js"]

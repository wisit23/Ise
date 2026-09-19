FROM node:22-alpine
WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend ./

EXPOSE 3000
# The compose setup mounts /app/frontend/node_modules as a persistent anonymous
# volume. Re-sync dependencies on startup so newly-added packages are available
# even when Docker reuses an older node_modules volume.
CMD ["sh", "-c", "npm install && npm run dev"]

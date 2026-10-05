FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production PORT=3000 WILDSTATE_DATA_DIR=/data DSM_GAME_RECORD=/data/dsm-game.json DSM_APP_HOST=http://127.0.0.1:8787
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && groupadd -g 10001 wildstate && useradd -u 10001 -g 10001 -d /data -s /usr/sbin/nologin wildstate
COPY --from=build /app/dist/server ./dist/server
COPY scripts/server.mjs ./scripts/server.mjs
COPY src/tiled ./src/tiled
USER 10001:10001
CMD ["node", "scripts/server.mjs"]

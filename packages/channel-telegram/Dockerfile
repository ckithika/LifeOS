FROM node:20-slim AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/channel-telegram/package.json packages/channel-telegram/

RUN npm install --workspace=packages/shared --workspace=packages/channel-telegram

COPY packages/shared/ packages/shared/
COPY packages/channel-telegram/ packages/channel-telegram/

RUN npm run build -w packages/shared
RUN npm run build -w packages/channel-telegram

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/channel-telegram/package.json packages/channel-telegram/
COPY --from=builder /app/packages/channel-telegram/dist packages/channel-telegram/dist/
COPY --from=builder /app/node_modules node_modules/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/channel-telegram/dist/index.js"]

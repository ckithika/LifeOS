FROM node:20-slim AS builder
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/channel-shared/package.json packages/channel-shared/
COPY packages/channel-whatsapp/package.json packages/channel-whatsapp/

RUN npm install --workspace=packages/shared --workspace=packages/channel-shared --workspace=packages/channel-whatsapp

COPY packages/shared/ packages/shared/
COPY packages/channel-shared/ packages/channel-shared/
COPY packages/channel-whatsapp/ packages/channel-whatsapp/

RUN npm run build -w packages/shared
RUN npm run build -w packages/channel-shared
RUN npm run build -w packages/channel-whatsapp

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/channel-shared/package.json packages/channel-shared/
COPY --from=builder /app/packages/channel-shared/dist packages/channel-shared/dist/
COPY --from=builder /app/packages/channel-whatsapp/package.json packages/channel-whatsapp/
COPY --from=builder /app/packages/channel-whatsapp/dist packages/channel-whatsapp/dist/
COPY --from=builder /app/node_modules node_modules/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/channel-whatsapp/dist/index.js"]

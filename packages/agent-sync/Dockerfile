FROM node:20-slim AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent-sync/package.json packages/agent-sync/

RUN npm install --workspace=packages/shared --workspace=packages/agent-sync

COPY packages/shared/ packages/shared/
COPY packages/agent-sync/ packages/agent-sync/

RUN npm run build -w packages/shared
RUN npm run build -w packages/agent-sync

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/agent-sync/package.json packages/agent-sync/
COPY --from=builder /app/packages/agent-sync/dist packages/agent-sync/dist/
COPY --from=builder /app/node_modules node_modules/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/agent-sync/dist/index.js"]

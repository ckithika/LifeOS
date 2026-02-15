FROM node:20-slim AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent-drive-org/package.json packages/agent-drive-org/

RUN npm install --workspace=packages/shared --workspace=packages/agent-drive-org

COPY packages/shared/ packages/shared/
COPY packages/agent-drive-org/ packages/agent-drive-org/

RUN npm run build -w packages/shared
RUN npm run build -w packages/agent-drive-org

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/agent-drive-org/package.json packages/agent-drive-org/
COPY --from=builder /app/packages/agent-drive-org/dist packages/agent-drive-org/dist/
COPY --from=builder /app/node_modules node_modules/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/agent-drive-org/dist/index.js"]

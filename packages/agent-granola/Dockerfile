FROM node:20-slim AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent-granola/package.json packages/agent-granola/

RUN npm install --workspace=packages/shared --workspace=packages/agent-granola

COPY packages/shared/ packages/shared/
COPY packages/agent-granola/ packages/agent-granola/

RUN npm run build -w packages/shared
RUN npm run build -w packages/agent-granola

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/agent-granola/package.json packages/agent-granola/
COPY --from=builder /app/packages/agent-granola/dist packages/agent-granola/dist/
COPY --from=builder /app/node_modules node_modules/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/agent-granola/dist/index.js"]

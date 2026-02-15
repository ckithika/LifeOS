FROM node:20-slim AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent-research/package.json packages/agent-research/

RUN npm install --workspace=packages/shared --workspace=packages/agent-research

COPY packages/shared/ packages/shared/
COPY packages/agent-research/ packages/agent-research/

RUN npm run build -w packages/shared
RUN npm run build -w packages/agent-research

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/agent-research/package.json packages/agent-research/
COPY --from=builder /app/packages/agent-research/dist packages/agent-research/dist/
COPY --from=builder /app/node_modules node_modules/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/agent-research/dist/index.js"]

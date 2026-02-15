FROM node:20-slim AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/agent-briefing/package.json packages/agent-briefing/

RUN npm install --workspace=packages/shared --workspace=packages/agent-briefing

COPY packages/shared/ packages/shared/
COPY packages/agent-briefing/ packages/agent-briefing/

RUN npm run build -w packages/shared
RUN npm run build -w packages/agent-briefing

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/agent-briefing/package.json packages/agent-briefing/
COPY --from=builder /app/packages/agent-briefing/dist packages/agent-briefing/dist/
COPY --from=builder /app/node_modules node_modules/

ENV PORT=8080
EXPOSE 8080

CMD ["node", "packages/agent-briefing/dist/index.js"]

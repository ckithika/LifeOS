FROM node:20-slim AS builder
WORKDIR /app

COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/mcp-google/package.json packages/mcp-google/

RUN npm install --workspace=packages/shared --workspace=packages/mcp-google

COPY packages/shared/ packages/shared/
COPY packages/mcp-google/ packages/mcp-google/

RUN npm run build -w packages/shared
RUN npm run build -w packages/mcp-google

FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/mcp-google/package.json packages/mcp-google/
COPY --from=builder /app/packages/mcp-google/dist packages/mcp-google/dist/
COPY --from=builder /app/node_modules node_modules/

ENV MCP_TRANSPORT=http
ENV PORT=8080

EXPOSE 8080

CMD ["node", "packages/mcp-google/dist/index.js"]

FROM node:20-slim AS builder
WORKDIR /app

# Copy root config
COPY package.json tsconfig.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/mcp-obsidian/package.json packages/mcp-obsidian/

# Install dependencies
RUN npm install --workspace=packages/shared --workspace=packages/mcp-obsidian

# Copy source
COPY packages/shared/ packages/shared/
COPY packages/mcp-obsidian/ packages/mcp-obsidian/

# Build
RUN npm run build -w packages/shared
RUN npm run build -w packages/mcp-obsidian

# Production image
FROM node:20-slim
WORKDIR /app

COPY --from=builder /app/package.json ./
COPY --from=builder /app/packages/shared/package.json packages/shared/
COPY --from=builder /app/packages/shared/dist packages/shared/dist/
COPY --from=builder /app/packages/mcp-obsidian/package.json packages/mcp-obsidian/
COPY --from=builder /app/packages/mcp-obsidian/dist packages/mcp-obsidian/dist/
COPY --from=builder /app/node_modules node_modules/

ENV MCP_TRANSPORT=http
ENV PORT=8080

EXPOSE 8080

CMD ["node", "packages/mcp-obsidian/dist/index.js"]

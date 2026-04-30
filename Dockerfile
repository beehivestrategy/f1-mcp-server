FROM node:20-bookworm AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.json eslint.config.js ./
COPY src ./src
COPY test ./test

RUN npm ci
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH="/root/.local/bin:${PATH}"

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/dist ./dist
COPY python-worker ./python-worker
COPY README.md LICENSE ./

RUN cd python-worker && uv sync --frozen

ENV PORT=8787
EXPOSE 8787

CMD ["node", "--enable-source-maps", "dist/src/index.js"]

FROM node:20-alpine

ARG IMAGE_SOURCE=""
ARG IMAGE_DOCUMENTATION=""
ARG IMAGE_REVISION=""
ARG IMAGE_CREATED=""

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY client ./client
COPY src ./src
COPY lib ./lib
COPY docs ./docs
COPY README.md ./README.md
COPY data ./data
COPY settings.example.json ./settings.example.json

ENV NODE_ENV=production
ENV PORT=3000

LABEL org.opencontainers.image.title="Persona Debate Orchestrator" \
      org.opencontainers.image.description="Local-first persona debate app with transcript-grounded chat and citations." \
      org.opencontainers.image.source="$IMAGE_SOURCE" \
      org.opencontainers.image.documentation="$IMAGE_DOCUMENTATION" \
      org.opencontainers.image.revision="$IMAGE_REVISION" \
      org.opencontainers.image.created="$IMAGE_CREATED" \
      org.opencontainers.image.licenses="UNLICENSED"

RUN chown -R node:node /app
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD sh -c "wget -qO- http://127.0.0.1:${PORT:-3000}/health >/dev/null || exit 1"

CMD ["node", "server/index.js"]

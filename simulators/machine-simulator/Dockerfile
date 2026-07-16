FROM node:20-alpine AS builder
WORKDIR /build
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src/ src/
RUN npm run build

FROM node:20-alpine AS runtime
RUN addgroup -S gruahub && adduser -S gruahub -G gruahub
USER gruahub
WORKDIR /app
COPY --from=builder --chown=gruahub:gruahub /build/package*.json ./
COPY --from=builder --chown=gruahub:gruahub /build/dist/ ./dist/
RUN npm ci --omit=dev
STOPSIGNAL SIGTERM
CMD ["node", "dist/index.js"]

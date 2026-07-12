FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY backend/package.json backend/package.json
COPY packages/meeting-domain/package.json packages/meeting-domain/package.json
RUN pnpm install --frozen-lockfile
COPY backend backend
COPY packages/meeting-domain packages/meeting-domain
RUN pnpm --filter @subculture/roberts-rules-meeting-domain build \
 && pnpm --filter @subculture/roberts-rules-api build \
 && pnpm --filter @subculture/roberts-rules-api deploy --legacy --prod /release

FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /release/ ./
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]

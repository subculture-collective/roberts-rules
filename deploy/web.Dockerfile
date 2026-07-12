FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS build
WORKDIR /src
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/package.json
COPY packages/meeting-domain/package.json packages/meeting-domain/package.json
RUN pnpm install --frozen-lockfile
COPY web web
COPY packages/meeting-domain packages/meeting-domain
RUN pnpm --filter @subculture/roberts-rules-meeting-domain build \
 && pnpm --filter @subculture/roberts-rules-web build

FROM nginxinc/nginx-unprivileged:1.29-alpine@sha256:0c79d56aee561a1d81c63f00eee5fb5fe29279560cdc55e91425133104c7fbe6
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/web/dist /usr/share/nginx/html
EXPOSE 8080

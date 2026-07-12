FROM node:24-alpine AS build
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

FROM nginxinc/nginx-unprivileged:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/web/dist /usr/share/nginx/html
EXPOSE 8080

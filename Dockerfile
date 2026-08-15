FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /repo
COPY apps/docs/package.json apps/docs/pnpm-lock.yaml ./apps/docs/
RUN pnpm --dir apps/docs install --frozen-lockfile
COPY apps/docs ./apps/docs
RUN pnpm --dir apps/docs build

FROM nginx:stable-alpine AS runtime
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/docs/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1

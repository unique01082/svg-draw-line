# Deploying `svg-motion.baole.space`

This guide prepares the documentation container for the baole.space reverse proxy. It intentionally does not create DNS records or mutate a live server.

## Build and verify

```bash
docker build -t svg-motion-docs:0.1.0 .
pnpm docs:docker:smoke
```

The image serves static prerendered output with nginx on port `80`. `/healthz` returns `200 ok`; hashed assets are immutable, while HTML is not cached.

## Runtime contract

Run one instance behind the existing HTTPS reverse proxy:

```bash
docker run --detach \
  --name svg-motion-docs \
  --restart unless-stopped \
  --publish 127.0.0.1:8080:80 \
  svg-motion-docs:0.1.0
```

Configure the proxy host for `svg-motion.baole.space` to forward HTTPS traffic to `http://127.0.0.1:8080`. Keep TLS termination and HTTP-to-HTTPS redirects at the proxy. Use `/healthz` for readiness and liveness probes.

## Version aliases

Canonical documentation lives under `/docs/0.1/*`. nginx redirects `/docs/latest/*` to that line. When a later minor becomes current, update the route metadata, prerender manifest and nginx redirect together; do not rewrite the existing `content/0.1` snapshot.

## Security and network policy

The bundled CSP permits same-origin scripts/styles/assets, inline SVG presentation styles, safe embedded bitmaps and HTTPS SVG URL loading through `connect-src`. It denies plugins, framing, camera, microphone and location. If production limits remote SVG hosts, replace the broad `https:` source with an explicit allowlist before deployment.

## Rollback

Keep the previously verified image tag. To roll back, replace the running container with that tag and verify `/healthz`, a deep documentation link and `/playground` before removing the failed image.

## Related

- [Repository README](../../README.md)
- [Contributing](../../CONTRIBUTING.md)
- [Third-party notices](../../THIRD_PARTY_NOTICES.md)

# CloudBox Frontend - Production (Release)
FROM caddy:alpine

COPY Caddyfile /etc/caddy/Caddyfile
COPY dist /srv

RUN addgroup -g 1001 -S cloudbox && adduser -S cloudbox -u 1001 -G cloudbox && \
    chown -R cloudbox:cloudbox /srv && \
    chown -R cloudbox:cloudbox /config && \
    chown -R cloudbox:cloudbox /data

USER cloudbox
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget -q --spider http://localhost:5000/health || exit 1

CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile"]

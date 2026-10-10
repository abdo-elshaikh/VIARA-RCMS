FROM ohif/app:v3.12.6-amd64@sha256:a70068b6a1ef7adf6315c3fea8177d40a8908434968818da862570ab91afecdb AS assets
# Upstream ships zero-byte uncompressed JS/CSS placeholders. Restore real
# originals so proxies can request and rewrite an uncompressed asset body.
RUN find /usr/share/nginx/html -type f -name '*.gz' -exec sh -c 'for archive do gzip -dc "$archive" > "${archive%.gz}" || exit 1; done' sh {} +

FROM nginx:1.30.5-alpine
COPY --from=assets /usr/share/nginx/html/ /usr/share/nginx/html/
COPY viara-measurements.js /usr/share/nginx/html/viara-measurements.js
COPY app-config.js /usr/share/nginx/html/app-config.js
RUN rm -f /usr/share/nginx/html/app-config.js.gz
COPY nginx.conf /usr/src/default.conf.template
COPY entrypoint.sh /usr/src/viara-entrypoint.sh
RUN sed -i "s/\r$//" /usr/src/viara-entrypoint.sh
ENTRYPOINT ["/bin/sh", "/usr/src/viara-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]

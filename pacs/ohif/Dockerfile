FROM ohif/app:v3.12.6-amd64

COPY app-config.js /usr/share/nginx/html/app-config.js
RUN rm -f /usr/share/nginx/html/app-config.js.gz
COPY nginx.conf /usr/src/default.conf.template

FROM node:20.19-alpine AS build

WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

ARG VITE_OHIF_URL
ENV VITE_OHIF_URL=$VITE_OHIF_URL

ARG VITE_PORTAL_PUBLIC_URL
ENV VITE_PORTAL_PUBLIC_URL=$VITE_PORTAL_PUBLIC_URL

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.27-alpine

COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

ENV NGINX_ENVSUBST_OUTPUT_DIR=/etc/nginx/conf.d
ENV VITE_OHIF_URL=${VITE_OHIF_URL:-http://localhost:3005}

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

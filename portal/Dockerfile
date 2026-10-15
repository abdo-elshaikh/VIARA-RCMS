FROM node:22.23.3-alpine AS build

WORKDIR /app

ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

COPY package*.json ./
COPY scripts/harden-build-dependencies.cjs ./scripts/harden-build-dependencies.cjs
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.30.5-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/portal-api-policy.conf /etc/nginx/portal-api-policy.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

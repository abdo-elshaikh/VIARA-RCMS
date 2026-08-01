FROM node:20.19-alpine

WORKDIR /app

RUN apk add --no-cache postgresql-client \
    && mkdir -p /app/backups /app/uploads \
    && chown -R node:node /app

COPY --chown=node:node package*.json ./

RUN npm ci --omit=dev

COPY --chown=node:node . .

USER node

EXPOSE 3000

CMD ["npm", "start"]

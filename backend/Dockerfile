FROM node:20.19-alpine

WORKDIR /app

RUN apk add --no-cache clamav-clamdscan postgresql-client \
    && mkdir -p /app/backups /app/uploads \
    && chown -R node:node /app

COPY --chown=node:node package*.json ./

RUN npm ci --omit=dev

# Optional: install aws-cli for offsite backup replication (BDR-01).
# Pass --build-arg BACKUP_OFFSITE_ENABLED=true to enable.
# If not installed, the backupOffsiteReplicator gracefully logs a warning
# and skips replication (local-only retention still applies).
ARG BACKUP_OFFSITE_ENABLED=false
RUN if [ "$BACKUP_OFFSITE_ENABLED" = "true" ]; then \
      apk add --no-cache python3 py3-pip && \
      pip3 install --no-cache-dir --break-system-packages awscli; \
    fi

COPY --chown=node:node . .
COPY clamd.conf /etc/clamav/clamd.conf

USER node

EXPOSE 3000

CMD ["npm", "start"]

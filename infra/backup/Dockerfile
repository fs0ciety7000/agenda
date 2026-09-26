# Sauvegardes PostgreSQL (docs/deployment.md §6) : même version majeure que la base.
FROM postgres:18-alpine
RUN apk add --no-cache rclone tini
COPY backup.sh /usr/local/bin/backup.sh
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/backup.sh"]
CMD ["loop"]

#!/bin/sh
# Sauvegarde PostgreSQL d'Agenda G & N (docs/deployment.md §6).
#   backup.sh loop          chaque nuit à BACKUP_HOUR:15 (défaut du conteneur)
#   backup.sh once          une sauvegarde maintenant (+ vérification + copie hors serveur)
#   backup.sh restore FILE  restauration réelle dans la base de production (manuel)
# Chaque sauvegarde est RESTAURÉE dans une base temporaire puis contrôlée : un dump illisible
# ou incomplet est détecté le jour même, pas le jour où on en a besoin.
set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"
OFFSITE_RETENTION_DAYS="${BACKUP_OFFSITE_RETENTION_DAYS:-30}"
OFFSITE="${BACKUP_OFFSITE_REMOTE:-}" # ex. offsite:agenda-backups (rclone, cf. RCLONE_CONFIG_OFFSITE_*)
CHECK_DB="agenda_restore_check"

log() { echo "$(date -u +%FT%TZ) backup: $*"; }

verify() {
  file="$1"
  pg_restore --list "$file" >/dev/null || return 1
  dropdb --if-exists "$CHECK_DB" && createdb "$CHECK_DB" || return 1
  if ! pg_restore --no-owner --exit-on-error -d "$CHECK_DB" "$file"; then
    dropdb --if-exists "$CHECK_DB"
    return 1
  fi
  # Contrôle de cohérence minimal : les tables principales existent et se lisent.
  counts=$(psql -At -d "$CHECK_DB" -c "SELECT (SELECT count(*) FROM \"User\") || ' comptes, ' || (SELECT count(*) FROM \"Household\") || ' foyers, ' || (SELECT count(*) FROM \"TaskOccurrence\") || ' occurrences'") || { dropdb --if-exists "$CHECK_DB"; return 1; }
  dropdb "$CHECK_DB" || return 1
  echo "$counts"
}

# Chaque étape est vérifiée explicitement : appelée via `once || …`, `set -e` ne s'applique pas.
once() {
  mkdir -p "$BACKUP_DIR" || return 1
  stamp=$(date -u +%Y-%m-%dT%H%M)
  file="$BACKUP_DIR/agenda-$stamp.dump"
  tmp="$file.partial"
  if ! pg_dump -Fc -f "$tmp" "$PGDATABASE"; then
    rm -f "$tmp"
    log "ÉCHEC : pg_dump"
    return 1
  fi
  mv "$tmp" "$file" || return 1
  if ! counts=$(verify "$file"); then
    log "ÉCHEC : le dump $file ne se restaure pas (conservé pour analyse)"
    return 1
  fi
  size=$(du -h "$file" | cut -f1)
  log "OK $file ($size) — restauration vérifiée : $counts"
  find "$BACKUP_DIR" -name 'agenda-*.dump' -mtime +"$RETENTION_DAYS" -delete
  if [ -n "$OFFSITE" ]; then
    if ! rclone copy --no-traverse "$file" "$OFFSITE/"; then
      log "ÉCHEC : copie hors serveur vers $OFFSITE"
      return 1
    fi
    rclone delete --min-age "${OFFSITE_RETENTION_DAYS}d" --include 'agenda-*.dump' "$OFFSITE/" ||
      log "avertissement : purge hors serveur impossible"
    log "copie hors serveur : $OFFSITE/$(basename "$file")"
  else
    log "ATTENTION : aucune copie hors serveur (BACKUP_OFFSITE_REMOTE vide)"
  fi
  # Témoin lu par le healthcheck (sauvegarde réussie de moins de 26 h).
  date -u +%FT%TZ > "$BACKUP_DIR/last-success"
}

seconds_until() {
  now=$(date -u +%s)
  target=$(date -u -d "$(date -u +%F) ${BACKUP_HOUR:-2}:15" +%s 2>/dev/null ||
    date -u -D '%Y-%m-%d %H:%M' -d "$(date -u +%F) ${BACKUP_HOUR:-2}:15" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  echo $((target - now))
}

case "${1:-loop}" in
  once) once ;;
  restore)
    file="${2:?usage: backup.sh restore /backups/agenda-….dump}"
    pg_restore --list "$file" >/dev/null
    log "restauration de $file dans $PGDATABASE (données actuelles remplacées)"
    pg_restore --clean --if-exists --no-owner --exit-on-error -d "$PGDATABASE" "$file"
    log "restauration terminée : redémarrer le service api"
    ;;
  loop)
    # Au démarrage : sauvegarde immédiate si la dernière date de plus de 24 h.
    if [ -z "$(find "$BACKUP_DIR/last-success" -mmin -1440 2>/dev/null)" ]; then
      once || log "ÉCHEC de la sauvegarde"
    fi
    while true; do
      wait=$(seconds_until)
      log "prochaine sauvegarde dans $((wait / 3600)) h $((wait % 3600 / 60)) min (heure UTC ${BACKUP_HOUR:-2}:15)"
      sleep "$wait"
      once || log "ÉCHEC de la sauvegarde"
    done
    ;;
  *) echo "usage: backup.sh loop|once|restore FILE" >&2; exit 2 ;;
esac

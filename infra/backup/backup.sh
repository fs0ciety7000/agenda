#!/bin/sh
# Sauvegarde PostgreSQL d'Agenda G & N (docs/deployment.md §6).
#   backup.sh loop          chaque nuit à BACKUP_HOUR:15 (défaut du conteneur), et à la demande
#                           depuis la page d'administration (vérifié toutes les 30 s)
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

# ── Historique dans la base (table "BackupRun", lue par la page d'administration) ──
# Best effort : si la table n'existe pas encore, la sauvegarde se fait quand même.
sql() { psql -Atq -v ON_ERROR_STOP=1 -d "$PGDATABASE" -c "$1" 2>/dev/null; }
quote() { printf "'%s'" "$(printf '%s' "$1" | sed "s/'/''/g")"; }
RUN_ID=""

run_start() { # $1 = manual | nightly | startup ; $2 = id d'une demande en attente (facultatif)
  if [ -n "${2:-}" ]; then
    sql "UPDATE \"BackupRun\" SET status='RUNNING', \"startedAt\"=now() WHERE id=$(quote "$2")" >/dev/null && RUN_ID="$2"
  else
    RUN_ID=$(sql "INSERT INTO \"BackupRun\" (id, trigger, status, \"startedAt\") VALUES (gen_random_uuid(), $(quote "$1"), 'RUNNING', now()) RETURNING id" | head -1) || RUN_ID=""
  fi
}

run_end() { # $1 = OK | FAILED ; $2 = résumé ; $3 = fichier ; $4 = taille (octets) ; $5 = hors serveur (true/false)
  [ -n "$RUN_ID" ] || return 0
  sql "UPDATE \"BackupRun\" SET status=$(quote "$1"), \"finishedAt\"=now(), summary=$(quote "$2"), file=$( [ -n "${3:-}" ] && quote "$(basename "$3")" || echo NULL ), \"sizeBytes\"=${4:-NULL}, offsite=${5:-false} WHERE id=$(quote "$RUN_ID")" >/dev/null || true
  RUN_ID=""
}

# Battement de cœur vers une surveillance externe (moniteur « Push » d'Uptime Kuma, Better
# Stack, Healthchecks.io…) : BACKUP_HEARTBEAT_URL appelée après chaque sauvegarde.
heartbeat() { # $1 = up | down ; $2 = message
  [ -n "${BACKUP_HEARTBEAT_URL:-}" ] || return 0
  sep='?'; case "$BACKUP_HEARTBEAT_URL" in *\?*) sep='&' ;; esac
  msg=$(printf '%s' "$2" | sed 's/[^A-Za-z0-9._-]/+/g' | cut -c1-120)
  wget -q -T 10 -O /dev/null "${BACKUP_HEARTBEAT_URL}${sep}status=$1&msg=$msg" 2>/dev/null ||
    log "avertissement : battement de cœur non envoyé"
}

fail() { log "ÉCHEC : $1"; run_end FAILED "$1"; heartbeat down "$1"; return 1; }

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
  run_start "${1:-manual}" "${2:-}"
  mkdir -p "$BACKUP_DIR" || { fail "dossier $BACKUP_DIR"; return 1; }
  stamp=$(date -u +%Y-%m-%dT%H%M)
  file="$BACKUP_DIR/agenda-$stamp.dump"
  tmp="$file.partial"
  if ! pg_dump -Fc -f "$tmp" "$PGDATABASE"; then
    rm -f "$tmp"
    fail "pg_dump"
    return 1
  fi
  mv "$tmp" "$file" || { fail "écriture du dump"; return 1; }
  if ! counts=$(verify "$file"); then
    fail "le dump $(basename "$file") ne se restaure pas (conservé pour analyse)"
    return 1
  fi
  size=$(du -h "$file" | cut -f1)
  bytes=$(wc -c < "$file" | tr -d ' ')
  log "OK $file ($size) — restauration vérifiée : $counts"
  find "$BACKUP_DIR" -name 'agenda-*.dump' -mtime +"$RETENTION_DAYS" -delete
  offsite=false
  if [ -n "$OFFSITE" ]; then
    if ! rclone copy --no-traverse "$file" "$OFFSITE/"; then
      fail "copie hors serveur vers $OFFSITE"
      return 1
    fi
    rclone delete --min-age "${OFFSITE_RETENTION_DAYS}d" --include 'agenda-*.dump' "$OFFSITE/" ||
      log "avertissement : purge hors serveur impossible"
    log "copie hors serveur : $OFFSITE/$(basename "$file")"
    offsite=true
  else
    log "ATTENTION : aucune copie hors serveur (BACKUP_OFFSITE_REMOTE vide)"
  fi
  # Témoin lu par le healthcheck (sauvegarde réussie de moins de 26 h).
  date -u +%FT%TZ > "$BACKUP_DIR/last-success"
  run_end OK "$counts" "$file" "$bytes" "$offsite"
  heartbeat up "OK $size"
}

seconds_until() {
  now=$(date -u +%s)
  target=$(date -u -d "$(date -u +%F) ${BACKUP_HOUR:-2}:15" +%s 2>/dev/null ||
    date -u -D '%Y-%m-%d %H:%M' -d "$(date -u +%F) ${BACKUP_HOUR:-2}:15" +%s)
  [ "$target" -le "$now" ] && target=$((target + 86400))
  echo $((target - now))
}

case "${1:-loop}" in
  once) once manual ;;
  restore)
    file="${2:?usage: backup.sh restore /backups/agenda-….dump}"
    pg_restore --list "$file" >/dev/null
    log "restauration de $file dans $PGDATABASE (données actuelles remplacées)"
    pg_restore --clean --if-exists --no-owner --exit-on-error -d "$PGDATABASE" "$file"
    log "restauration terminée : redémarrer le service api"
    ;;
  loop)
    # Sauvegarde interrompue par un redémarrage du conteneur : marquée en échec.
    sql "UPDATE \"BackupRun\" SET status='FAILED', \"finishedAt\"=now(), summary='interrompue (redémarrage)' WHERE status='RUNNING'" >/dev/null || true
    # Au démarrage : sauvegarde immédiate si la dernière date de plus de 24 h.
    if [ -z "$(find "$BACKUP_DIR/last-success" -mmin -1440 2>/dev/null)" ]; then
      once startup || log "ÉCHEC de la sauvegarde"
    fi
    next=$(( $(date -u +%s) + $(seconds_until) ))
    log "prochaine sauvegarde dans $(( (next - $(date -u +%s)) / 3600 )) h (heure UTC ${BACKUP_HOUR:-2}:15)"
    while true; do
      sleep 30
      # Demandée depuis la page d'administration.
      pending=$(sql "SELECT id FROM \"BackupRun\" WHERE status='PENDING' ORDER BY \"createdAt\" LIMIT 1" || true)
      if [ -n "$pending" ]; then
        log "sauvegarde demandée depuis l'administration"
        once manual "$pending" || log "ÉCHEC de la sauvegarde"
      fi
      if [ "$(date -u +%s)" -ge "$next" ]; then
        once nightly || log "ÉCHEC de la sauvegarde"
        next=$(( $(date -u +%s) + $(seconds_until) ))
        log "prochaine sauvegarde dans $(( (next - $(date -u +%s)) / 3600 )) h (heure UTC ${BACKUP_HOUR:-2}:15)"
      fi
    done
    ;;
  *) echo "usage: backup.sh loop|once|restore FILE" >&2; exit 2 ;;
esac

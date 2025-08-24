#!/usr/bin/env bash
set -euo pipefail

# === CONFIG ===
PROJECT_NAME="grandmas-kitchen"
# Where to place archives (change if you prefer elsewhere)
BACKUP_ROOT="$HOME/Backups/${PROJECT_NAME}"

# List any SQLite DBs to include (add or remove paths as needed)
SQLITE_DB_PATHS=(
  "$PWD/database.sqlite"
  "$PWD/data/database.sqlite"
)

# Keep backups for this many days
RETENTION_DAYS=28

# Exclusions for code zips (speed + smaller files)
EXCLUDES=(
  "--exclude=.git"
  "--exclude=node_modules"
  "--exclude=.DS_Store"
  "--exclude=dist"
  "--exclude=.cache"
  "--exclude=*.log"
  "--exclude=archive"
)

# === PREP ===
NOW_ISO="$(date +"%Y-%m-%d_%H-%M-%S")"
DAY_BUCKET="$(date +"%Y-%m-%d")"
DEST_DIR="${BACKUP_ROOT}/${DAY_BUCKET}"
mkdir -p "${DEST_DIR}"

# Lock so two backups don't collide
LOCKFILE="${BACKUP_ROOT}/.backup.lock"
exec 9>"$LOCKFILE"
if command -v flock >/dev/null 2>&1; then
  flock -n 9 || { echo "Another backup is running. Exiting."; exit 0; }
fi

# === 1) Dump databases (tables included) ===
DB_DIR="${DEST_DIR}/db"
mkdir -p "${DB_DIR}"

dump_one_sqlite () {
  local db_path="$1"
  if [[ -f "$db_path" ]]; then
    local base="$(basename "$db_path")"
    local stem="${base%.*}"

    # Safe copy of entire DB file (snapshot)
    cp -p "$db_path" "${DB_DIR}/${stem}-${NOW_ISO}.sqlite" || true

    # Text dump (portable restore)
    if command -v sqlite3 >/dev/null 2>&1; then
      sqlite3 "$db_path" ".timeout 2000" ".backup '${DB_DIR}/${stem}-${NOW_ISO}-safe.sqlite'" || true
      sqlite3 "$db_path" ".dump" > "${DB_DIR}/${stem}-${NOW_ISO}.sql" || true
    else
      echo "sqlite3 not found; skipping SQL dump for $db_path"
    fi
  fi
}

for db in "${SQLITE_DB_PATHS[@]}"; do
  dump_one_sqlite "$db" || true
done

# === 2) Zip the code (repo root) ===
CODE_ZIP="${DEST_DIR}/${PROJECT_NAME}-code-${NOW_ISO}.zip"

if command -v zip >/dev/null 2>&1; then
  # shellcheck disable=SC2068
  zip -r "${CODE_ZIP}" . ${EXCLUDES[@]}
else
  CODE_ZIP="${DEST_DIR}/${PROJECT_NAME}-code-${NOW_ISO}.tar.gz"
  tar -czf "${CODE_ZIP}" \
    --exclude-vcs \
    ${EXCLUDES[@]/#/--exclude=} \
    .
fi

# === 3) Write a small manifest for quick reference ===
GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "no-git")"
GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo "no-git")"

cat > "${DEST_DIR}/manifest-${NOW_ISO}.txt" <<EOF
Project: ${PROJECT_NAME}
When:    ${NOW_ISO}
Where:   $(pwd)
User:    $(whoami) on $(hostname)
Git:     ${GIT_BRANCH}
Commit:  ${GIT_COMMIT}
Code:    $(basename "${CODE_ZIP}")
DB dir:  ${DB_DIR}
EOF

# === 4) Retention: delete folders older than N days ===
# keep only dated folders (YYYY-mm-dd) older than RETENTION_DAYS
find "${BACKUP_ROOT}" -maxdepth 1 -type d -name "20*" -mtime +${RETENTION_DAYS} -exec rm -rf {} \; || true

echo "✅ Backup complete → ${DEST_DIR}"

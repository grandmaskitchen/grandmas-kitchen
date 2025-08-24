#!/bin/zsh
set -euo pipefail

# === 1) Exclude patterns (zsh-safe) ===
# NOTE: Don't put inline comments inside the ( ... ) — zsh treats `#` as comment and can break the array.
#       Quote each pattern so the shell doesn't expand globs before `zip` sees them.
ZIP_EXCLUDES=(
  '.git/*'
  'node_modules/*'
  'dist/*'
  '.cache/*'
  '*.log'
  '.DS_Store'
  '.__MACOSX/*'
  'archive/*'
)

# === 2) Zip the code (repo root) ===
CODE_ZIP="${DEST_DIR}/${PROJECT_NAME}-code-${NOW_ISO}.zip"

if command -v zip >/dev/null 2>&1; then
  zip -r "${CODE_ZIP}" . -x "${ZIP_EXCLUDES[@]}"
else
  CODE_ZIP="${DEST_DIR}/${PROJECT_NAME}-code-${NOW_ISO}.tar.gz"
  tar -czf "${CODE_ZIP}" \
    --exclude-vcs \
    --exclude='.git' --exclude='node_modules' --exclude='dist' --exclude='.cache' \
    --exclude='*.log' --exclude='.DS_Store' \
    .
fi

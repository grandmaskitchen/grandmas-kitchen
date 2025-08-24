#!/usr/bin/env bash
set -euo pipefail

# Usage: schedule_tonight.sh HH MM
HH="${1:-23}"
MM="${2:-30}"

LABEL="com.${USER}.oneoff.$(date +%s).backup"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"

# Determine target datetime (tonight at HH:MM; if past, tomorrow)
if date -v0d "+%Y-%m-%d" >/dev/null 2>&1; then
  # macOS date
  TODAY="$(date +%Y-%m-%d)"
  TARGET_STR="${TODAY} ${HH}:${MM}"
  NOW_SEC=$(date +%s)
  TARGET_SEC=$(date -j -f "%Y-%m-%d %H:%M" "$TARGET_STR" +%s)
  if (( TARGET_SEC <= NOW_SEC )); then
    TARGET_STR="$(date -v+1d "+%Y-%m-%d") ${HH}:${MM}"
  fi
  Y=$(echo "$TARGET_STR" | cut -d'-' -f1)
  M=$(echo "$TARGET_STR" | cut -d'-' -f2)
  D=$(echo "$TARGET_STR" | cut -d'-' -f3 | cut -d' ' -f1)
  H=$(echo "$TARGET_STR" | cut -d' ' -f2 | cut -d':' -f1)
  N=$(echo "$TARGET_STR" | cut -d':' -f2)
else
  echo "This helper is designed for macOS (LaunchAgents)."
  exit 1
fi

REPO_PATH="${PWD}"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/bash</string>
    <string>${REPO_PATH}/scripts/backup.sh</string>
  </array>
  <key>RunAtLoad</key><false/>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Year</key><integer>${Y}</integer>
    <key>Month</key><integer>${M#0}</integer>
    <key>Day</key><integer>${D#0}</integer>
    <key>Hour</key><integer>${H#0}</integer>
    <key>Minute</key><integer>${N#0}</integer>
  </dict>
  <key>StandardOutPath</key><string>${HOME}/Library/Logs/${LABEL}.out</string>
  <key>StandardErrorPath</key><string>${HOME}/Library/Logs/${LABEL}.err</string>
</dict></plist>
EOF

launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load "$PLIST"

echo "One-off backup scheduled at ${TARGET_STR} (plist: $PLIST)"

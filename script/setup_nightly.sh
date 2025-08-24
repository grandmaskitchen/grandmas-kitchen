#!/usr/bin/env bash
set -euo pipefail

LABEL="com.gary.backup.nightly"
PLIST="$HOME/Library/LaunchAgents/${LABEL}.plist"
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
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>2</integer>
    <key>Minute</key><integer>15</integer>
  </dict>
  <key>StandardOutPath</key><string>${HOME}/Library/Logs/${LABEL}.out</string>
  <key>StandardErrorPath</key><string>${HOME}/Library/Logs/${LABEL}.err</string>
  <key>RunAtLoad</key><false/>
</dict></plist>
EOF

launchctl unload "$PLIST" >/dev/null 2>&1 || true
launchctl load  "$PLIST"

echo "✅ Nightly backup set for 02:15 using ${REPO_PATH}/scripts/backup.sh"

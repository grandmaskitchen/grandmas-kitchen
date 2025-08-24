GRANDMAS-KITCHEN • BACKUP KIT
================================

This bundle gives you:
- Manual backups on demand
- A pre-commit prompt (Now / After testing / Tonight / Skip)
- Nightly automatic backups (keeps last 28 days)
- SQLite database snapshots and .sql dumps

CONTENTS
--------
scripts/backup.sh               -> main backup script
scripts/schedule_tonight.sh     -> one-off backup tonight helper
scripts/setup_nightly.sh        -> installs a nightly LaunchAgent at 02:15
.git/hooks-template/pre-commit  -> copy into .git/hooks/ and make executable
LaunchAgents-template/com.gary.backup.nightly.plist -> reference template
.backupignore                   -> example ignore file for backups

INSTALL (macOS)
---------------
1) Put this entire folder *inside your repo* or copy the "scripts" folder into your repo.
   Example repo: ~/dev/grandmas-kitchen

2) Make scripts executable:
   chmod +x scripts/*.sh

3) Enable the pre-commit prompt:
   cp .git/hooks-template/pre-commit .git/hooks/pre-commit
   chmod +x .git/hooks/pre-commit

4) Set up the nightly backup (runs 02:15 daily):
   bash scripts/setup_nightly.sh

   (Alternative: open the LaunchAgents-template .plist,
    replace __REPO_PATH__ with your repo path,
    save to ~/Library/LaunchAgents/com.gary.backup.nightly.plist,
    then run: launchctl load ~/Library/LaunchAgents/com.gary.backup.nightly.plist)

MANUAL RUN
----------
./scripts/backup.sh

NPM alias (optional):
Add to package.json scripts: { "backup": "bash scripts/backup.sh" }
Then: npm run backup

ONE-OFF TONIGHT
---------------
bash scripts/schedule_tonight.sh 23 30   # runs at 23:30 tonight

RESTORE
-------
• Single file: open the dated backup folder, unzip the code archive and copy files.
• Whole project: unzip to a fresh folder and replace as needed.
• SQLite DB:
  - Fast replace: copy the *.sqlite snapshot into place.
  - Rebuild: sqlite3 database.sqlite < db/yourdb-YYYY-mm-dd_HH-MM-SS.sql

RETENTION
---------
Backups older than 28 days are automatically pruned.
Change RETENTION_DAYS in scripts/backup.sh to adjust.

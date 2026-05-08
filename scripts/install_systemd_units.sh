#!/usr/bin/env bash
#
# install_systemd_units.sh — Strike #122 systemd installer
#
# tfos cannot write /etc/systemd/system. Operator runs this manually with:
#
#     sudo /opt/teivaka/scripts/install_systemd_units.sh
#
# Idempotent: safe to re-run.

set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: must be run as root via sudo" >&2
  echo "       sudo $0" >&2
  exit 1
fi

REPO=/opt/teivaka
SRC_DIR="$REPO/scripts/systemd"
DST_DIR=/etc/systemd/system

for unit in teivaka-backup.service teivaka-backup.timer; do
  echo "Installing $unit"
  install -m 0644 -o root -g root "$SRC_DIR/$unit" "$DST_DIR/$unit"
done

echo "Reloading systemd"
systemctl daemon-reload

echo "Enabling + starting timer"
systemctl enable --now teivaka-backup.timer

echo ""
echo "─── Installed timers (filtered) ───"
systemctl list-timers --all | grep -E "(NEXT|teivaka-backup)" || true

echo ""
echo "─── Status ───"
systemctl status teivaka-backup.timer --no-pager || true

echo ""
echo "DONE. Next fire: $(systemctl list-timers --all | grep teivaka-backup | awk '{print $1, $2, $3}')"

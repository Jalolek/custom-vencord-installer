#!/usr/bin/env bash
# Custom Vencord installer
# Builds a single binary with ALL userplugins from ../Vencord, then installs.
# Usage:
#   ./install.sh
#   ./install.sh --repair
#   ./install.sh --uninstall
#   ./install.sh --setup-only

set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$ROOT"

ACTION="--install"
if [[ "${1:-}" == "--uninstall" ]]; then
    ACTION="--uninstall"
elif [[ "${1:-}" == "--repair" ]]; then
    ACTION="--repair"
elif [[ "${1:-}" == "--setup-only" ]]; then
    exec node "$ROOT/setup.mjs"
fi

node "$ROOT/buildInstaller.mjs"
echo "Close Discord before continuing."
exec "$ROOT/bin/CustomVencordInstaller" "$ACTION"

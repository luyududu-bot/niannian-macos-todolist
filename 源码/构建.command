#!/bin/zsh
set -eu
PROJECT_DIR="${0:A:h:h}"
exec /bin/zsh "$PROJECT_DIR/scripts/build.sh"

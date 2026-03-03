#!/bin/bash
# Start the Agent Dashboard dev server
# Uses brew-installed Node 24 (x64) to match native module builds
export PATH="/usr/local/opt/node/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
cd "$(dirname "$0")/.."
exec npx next dev --port 3333

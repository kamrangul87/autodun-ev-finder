#!/usr/bin/env bash
set -euo pipefail

branch=${1:-develop}

git add -A
git commit -m "replit: update"
git push origin "$branch"

echo "✅ Pushed to $branch. Open a PR to main when CI is green."

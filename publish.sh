#!/usr/bin/env bash
# Build the G3 dashboard and publish it to Coleslaw510/g3-dashboard (GitHub Pages).
#
# Every publish copies the build to both index.html (the live dashboard) and
# g3-dashboard.html (the stable download file), refreshes download/index.html
# and version.json (last updated in Central Time, short commit, file size).
#
# Usage:
#   ./publish.sh            # build, verify, copy into $PUB (default /workspace/g3-publish)
#   ./publish.sh --push     # also commit and push to origin/main
#   SKIP_VERIFY=1 ./publish.sh --push
#   PUB=/path/to/clone ./publish.sh --push
set -euo pipefail

SRC="$(cd "$(dirname "$0")" && pwd)"
PUB="${PUB:-/workspace/g3-publish}"
PUSH=0
for arg in "$@"; do
  case "$arg" in
    --push|push) PUSH=1 ;;
    --help|-h)
      sed -n '2,16p' "$0"
      exit 0
      ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 2
      ;;
  esac
done

cd "$SRC"
python3 build.py
if [[ "${SKIP_VERIFY:-}" != "1" ]]; then
  node verify.js
fi

BUILD="$SRC/g3-dashboard.html"
if [[ ! -f "$BUILD" ]]; then
  echo "missing $BUILD" >&2
  exit 1
fi
if [[ ! -d "$PUB/.git" ]]; then
  echo "publish repo not found at $PUB (clone Coleslaw510/g3-dashboard there, or set PUB=)" >&2
  exit 1
fi

mkdir -p "$PUB/download"
cp -f "$BUILD" "$PUB/index.html"
cp -f "$BUILD" "$PUB/g3-dashboard.html"
cp -f "$SRC/download/index.html" "$PUB/download/index.html"
cp -f "$SRC/build.py" "$PUB/build.py"
cp -f "$SRC/publish.sh" "$PUB/publish.sh"
cp -f "$SRC/README.md" "$PUB/README.md"
cp -f "$SRC/verify.js" "$PUB/verify.js"
cp -f "$SRC/perf.js" "$PUB/perf.js"
# Keep the published repo's source tree in sync, without node_modules or shots.
rm -rf "$PUB/src" "$PUB/tools" "$PUB/samples"
cp -a "$SRC/src" "$PUB/src"
cp -a "$SRC/tools" "$PUB/tools"
cp -a "$SRC/samples" "$PUB/samples"
touch "$PUB/.nojekyll"

SIZE="$(wc -c < "$BUILD" | tr -d ' ')"
UPDATED="$(TZ=America/Chicago date '+%b %-d, %Y, %-I:%M %p CT')"
UPDATED_ISO="$(TZ=America/Chicago date '+%Y-%m-%dT%H:%M:%S%z')"
# Insert colon in the timezone offset for a proper ISO-8601 value: -0600 -> -06:00
UPDATED_ISO="${UPDATED_ISO%??}:${UPDATED_ISO: -2}"

write_version() {
  local commit="$1"
  python3 - "$PUB/version.json" "$UPDATED" "$UPDATED_ISO" "$commit" "$SIZE" <<'PY'
import json, sys
path, updated, iso, commit, size = sys.argv[1:]
data = {
    "updated": updated,
    "updatedIso": iso,
    "commit": commit,
    "sizeBytes": int(size),
    "file": "g3-dashboard.html",
}
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY
}

# Placeholder until the publish commit hash is known.
write_version ""

echo "staged in $PUB  ($SIZE bytes, $UPDATED)"

if [[ "$PUSH" != "1" ]]; then
  echo "Not committing. Re-run with --push to commit and publish."
  exit 0
fi

cd "$PUB"
git config user.name "Coleslaw510"
git config user.email "338366194+Coleslaw510@users.noreply.github.com"
git add -- index.html g3-dashboard.html download/index.html version.json \
  build.py publish.sh README.md verify.js perf.js src tools samples .nojekyll

if git diff --cached --quiet; then
  echo "Nothing to commit."
  exit 0
fi

# Commit the dashboard and download page first, then record that commit's
# hash in version.json in a follow-up commit (a file cannot contain its
# own commit hash).
git commit -m "$(cat <<MSG
Publish the latest G3 Dashboard ($UPDATED)

index.html is the live dashboard; g3-dashboard.html is the downloadable
copy. /download/ reads version.json for the Central Time stamp, short
commit, and file size.
MSG
)"

HASH="$(git rev-parse --short HEAD)"
write_version "$HASH"
git add version.json
git commit -m "Record publish version $HASH"

export GH_TOKEN="${GH_TOKEN:-$(gh auth token -u Coleslaw510)}"
git push origin main
echo "published $HASH  https://coleslaw510.github.io/g3-dashboard/download/"

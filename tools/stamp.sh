#!/bin/bash
# tools/stamp.sh - one-command quick CI stamp.
#   tools/stamp.sh [--shards 4] [--tier full|smoke] [--commit] [--no-write]
# 1. refuses to run when anything outside game/design/ is modified (the stamped sha must be exactly the tested code; the stamp
#    commit is docs-only), then records sha = HEAD;
# 2. runs N shards of game/tests/run-all.js in parallel, each with its OWN static-server port and --lock-live (live-class tests
#    take turns on /tmp/live.lock, they never overlap) and --balance (cost from .timings.json);
# 3. merges the shard results, reruns every failure ALONE once (nothing else running, same sha, one process);
# 4. writes game/design/ci-status.json in the documented format; notes name every test that passed only on the solo rerun.
#    --commit then commits that one file (docs-only). Exit 0 only when everything is green.
# --no-write writes the stamp to the temp dir instead (dry run). Never writes to Firebase: the tests use ADMIN* bots / blockDb.
set -u
cd "$(dirname "$0")/.."
SHARDS=4; TIER=full; COMMIT=0; WRITE=1
while [ $# -gt 0 ]; do case "$1" in
  --shards) SHARDS="$2"; shift 2;; --tier) TIER="$2"; shift 2;; --commit) COMMIT=1; shift;; --no-write) WRITE=0; shift;;
  *) echo "unknown option $1" >&2; exit 2;; esac; done
case "$SHARDS" in ''|*[!0-9]*) echo "--shards must be a number" >&2; exit 2;; esac
dirty=$(git status --porcelain --untracked-files=no | grep -v -E '^.. game/design/' || true)
if [ -n "$dirty" ]; then echo "refusing: uncommitted changes outside game/design/ (the stamp must name the tested commit):" >&2; echo "$dirty" >&2; exit 2; fi
SHA=$(git rev-parse HEAD)
export NODE_PATH="${NODE_PATH:-$(npm root -g)}"
TMP=$(mktemp -d)
RUN=game/tests/run-all.js
unset PORT BASE
echo "stamping $SHA: tier=$TIER shards=$SHARDS logs in $TMP"
pids=()
for i in $(seq 1 "$SHARDS"); do
  node $RUN --tier "$TIER" --shard "$i/$SHARDS" --lock-live --balance --results "$TMP/shard-$i.json" > "$TMP/shard-$i.log" 2>&1 &
  pids+=($!)
done
for p in "${pids[@]}"; do wait "$p"; done
FIRST=""
for i in $(seq 1 "$SHARDS"); do
  if [ ! -s "$TMP/shard-$i.json" ]; then echo "shard $i produced no results (crashed?), see $TMP/shard-$i.log" >&2; tail -20 "$TMP/shard-$i.log" >&2; exit 3; fi
  FIRST="$FIRST${FIRST:+,}$TMP/shard-$i.json"
  grep -E '^(summary|FAIL)' "$TMP/shard-$i.log" | sed "s/^/[shard $i] /"
done
FAILED=$(node -e "const fs=require('fs');const o=[];for(const f of process.argv.slice(1))o.push(...JSON.parse(fs.readFileSync(f,'utf8')).failed);console.log(o.join(','))" ${FIRST//,/ })
RERUN_ARG=""
if [ -n "$FAILED" ]; then
  echo "rerunning alone: $FAILED"
  node $RUN --files "$FAILED" --lock-live --results "$TMP/rerun.json" > "$TMP/rerun.log" 2>&1
  grep -E '^(summary|ok|FAIL)' "$TMP/rerun.log"
  RERUN_ARG="--rerun $TMP/rerun.json"
fi
OUT=game/design/ci-status.json
[ "$WRITE" = 1 ] || OUT="$TMP/ci-status.json"
node game/tests/lib/stamp-merge.js --sha "$SHA" --out "$OUT" --tier "$TIER" --shards "$SHARDS" --first "$FIRST" $RERUN_ARG
rc=$?
if [ "$COMMIT" = 1 ] && [ "$WRITE" = 1 ]; then
  VERDICT=green; [ $rc = 0 ] || VERDICT=RED
  git add game/design/ci-status.json && git commit -q -m "CI stamp: $VERDICT on ${SHA:0:7}" \
    -m "Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01YYUkojBS4xUfZdkLhLvWtx" && echo "committed the stamp (docs-only)"
fi
exit $rc

#!/bin/sh
# Runs the whole automated battery against the isolated Neon `test` branch and a
# second dev server on :3101, so it never disturbs hand-testing on the dev branch
# (:3100). Needs .env.test.local (DATABASE_URL / DIRECT_URL of the test branch).
set -e
cd "$(dirname "$0")/.."
[ -f .env.test.local ] || { echo "Missing .env.test.local"; exit 1; }
set -a; . ./.env.local; . ./.env.test.local; set +a   # secrets from .env.local, database from the test branch
export TEST_ENV_FILE=.env.test.local ALLOW_DB_WRITE_TESTS=1 SMOKE_BASE_URL=http://localhost:3101
npx prisma migrate deploy >/dev/null
NEXT_DIST_DIR=.next-test npx next dev -p 3101 >/tmp/next-test.log 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; pkill -f "next dev -p 3101" 2>/dev/null' EXIT
for i in $(seq 1 60); do curl -s -o /dev/null http://localhost:3101/api/public/auction/stage && break; sleep 1; done
FAILED=""
npx playwright test || FAILED="$FAILED smoke"
for t in card batch timetext formation stats scoping identity formationdb apply adminui cards auction auctionui journey seasonflow teamsetup seasondetails adminnav; do
  printf "%s: " "$t"
  OUT=$(npm run --silent test:$t 2>&1) && STATUS=ok || STATUS=fail
  echo "$OUT" | tail -1
  [ "$STATUS" = ok ] || { FAILED="$FAILED $t"; echo "$OUT" | grep -v "^\s*at " | tail -12; sh scripts/clean-test-leftovers.sh >/dev/null 2>&1 || true; }
done
[ -z "$FAILED" ] && echo "ALL PASSED" || { echo "FAILED:$FAILED"; exit 1; }

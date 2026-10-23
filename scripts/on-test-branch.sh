#!/bin/sh
# Run any command against the isolated test branch + :3101 server config, e.g.
#   sh scripts/on-test-branch.sh npm run test:apply
cd "$(dirname "$0")/.."
set -a; . ./.env.local; . ./.env.test.local; set +a   # secrets from .env.local, database from the test branch
export TEST_ENV_FILE=.env.test.local ALLOW_DB_WRITE_TESTS=1 SMOKE_BASE_URL=http://localhost:3101
exec "$@"

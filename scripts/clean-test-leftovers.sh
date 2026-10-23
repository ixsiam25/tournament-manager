#!/bin/sh
# Used by test-dev.sh after a failed test so one crash cannot poison the next.
cd "$(dirname "$0")/.."
TEST_ENV_FILE=.env.test.local npx tsx scripts/clean-test-data.ts

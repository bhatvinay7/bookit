#!/usr/bin/env bash
# Runs a safe, development-only contention benchmark against one known free
# seat. The first accepted request owns the seat; the rest exercise gateway
# admission without flooding Redis/RabbitMQ with duplicate lock work.
set -Eeuo pipefail

: "${GRPC_SERVER_URL:?GRPC_SERVER_URL is required}"
: "${GRPC_PAYLOAD:?GRPC_PAYLOAD is required}"
: "${LOCK_RAMP_CONCURRENCY:=500}"
: "${LOCK_RAMP_CONNECTIONS:=50}"
: "${LOCK_RAMP_STAGE_DURATION:=10m}"
: "${LOCK_RAMP_COOLDOWN:=2m}"
: "${LOCK_RAMP_RESULTS_DIR:=load-test-results}"
: "${LOAD_TEST_PUSHGATEWAY_URL:?LOAD_TEST_PUSHGATEWAY_URL is required}"
: "${LOAD_TEST_RUN_ID:?LOAD_TEST_RUN_ID is required}"

if ! [[ "$LOCK_RAMP_CONCURRENCY" =~ ^[1-9][0-9]*$ ]] || (( LOCK_RAMP_CONCURRENCY > 5000 )); then
  echo "LOCK_RAMP_CONCURRENCY must be between 1 and 5000." >&2
  exit 1
fi

duration_to_seconds() {
  local value=$1 number unit
  if [[ "$value" =~ ^([1-9][0-9]*)([mh])$ ]]; then
    number=${BASH_REMATCH[1]}
    unit=${BASH_REMATCH[2]}
    if [ "$unit" = m ]; then
      printf '%s\n' "$((number * 60))"
    else
      printf '%s\n' "$((number * 3600))"
    fi
  else
    echo "LOCK_RAMP_STAGE_DURATION and LOCK_RAMP_COOLDOWN must be positive minutes or hours." >&2
    exit 1
  fi
}

stage_duration_seconds=$(duration_to_seconds "$LOCK_RAMP_STAGE_DURATION")
cooldown_seconds=$(duration_to_seconds "$LOCK_RAMP_COOLDOWN")
if (( stage_duration_seconds < 300 )); then
  echo "LOCK_RAMP_STAGE_DURATION must be at least 5m so the HPA can react." >&2
  exit 1
fi

showtime_id=$(jq -er '.showtime_id // .showtimeId' <<<"$GRPC_PAYLOAD")
seat_id=$(jq -er '.seat_ids[0] // .seatIds[0]' <<<"$GRPC_PAYLOAD")
jq -e '
  ((.showtime_id // .showtimeId) | type == "number") and
  ((.user_id // .userId) | type == "number") and
  ((.total_seat_count // .totalSeatCount) | type == "number") and
  ((.seat_ids // .seatIds) | length == 1) and
  ((.seat_indices // .seatIndices) | length == 1)
' >/dev/null <<<"$GRPC_PAYLOAD" || {
  echo "GRPC_PAYLOAD must describe exactly one seat with showtime_id, user_id, total_seat_count and seat_indices." >&2
  exit 1
}

target="${GRPC_SERVER_URL#http://}"
target="${target#https://}"
target="${target%%/*}"
mkdir -p "$LOCK_RAMP_RESULTS_DIR"

unlock() {
  "$HOME/go/bin/grpcurl" -insecure \
    -proto apps/gateway-keeper/proto/locking.proto \
    -d "$GRPC_PAYLOAD" "$target" locking.SlotLockingService/UnlockSlot >/dev/null || true
}
trap unlock EXIT

lock_once() {
  "$HOME/go/bin/grpcurl" -insecure \
  -proto apps/gateway-keeper/proto/locking.proto \
  -d "$GRPC_PAYLOAD" "$target" locking.SlotLockingService/LockSlot
}

expect_lock_success() {
  # Unlock work is asynchronous through the locking pipeline. Poll for a
  # bounded period rather than treating normal queue propagation as a test
  # failure, while still failing if a stale lock never clears.
  local response attempt
  for attempt in {1..30}; do
    if response=$(lock_once 2>/dev/null) && jq -e --argjson seat "$seat_id" \
      '.success == true and ((.lockedSeatIds // .locked_seat_ids // []) | index($seat) != null)' \
      >/dev/null <<<"$response"; then
      return 0
    fi
    sleep 1
  done
  echo "Expected schedule $showtime_id / seat $seat_id to be free, but LockSlot did not acquire it within 30 seconds." >&2
  exit 1
}

expect_lock_conflict() {
  local response
  response=$(lock_once)
  jq -e --argjson seat "$seat_id" \
    '.success == false and ((.failedSeatIds // .failed_seat_ids // []) | index($seat) != null)' \
    >/dev/null <<<"$response" || {
      echo "Expected exactly one active lock after the stage, but the seat was unexpectedly acquirable." >&2
      exit 1
    }
}

assert_ghz_transport_success() {
  local report=$1 expected_count=$2 count non_ok
  count=$(jq -r '.count // 0' "$report")
  non_ok=$(jq '[((.statusCodeDistribution // {}) | to_entries[]? | select(.key != "OK") | .value)] | add // 0' "$report")
  if [ "$count" -ne "$expected_count" ] || [ "$non_ok" -ne 0 ]; then
    echo "Stage report is incomplete or contains gRPC transport failures (count=$count expected=$expected_count non_ok=$non_ok)." >&2
    return 1
  fi
}

# Confirm the supplied development seat is available and can be released by
# this test user before sending any high-volume traffic.
expect_lock_success
unlock

# These are bounded request totals, not virtual-user counts. Each stage is
# rate-limited and held for at least five minutes so Kubernetes HPA has time to
# observe CPU/memory and add ready replicas. The reported completed count must
# equal the requested count; a stage fails on any non-OK gRPC status.
stages=(5000 15000 20000 30000 50000 600000)
for index in "${!stages[@]}"; do
  total=${stages[$index]}
  rps=$(( (total + stage_duration_seconds - 1) / stage_duration_seconds ))
  report="$LOCK_RAMP_RESULTS_DIR/single-seat-lock-${total}.json"
  echo "Running single-seat contention stage: ${total} requests at ${rps} RPS for up to ${LOCK_RAMP_STAGE_DURATION} (concurrency ${LOCK_RAMP_CONCURRENCY})"
  "$HOME/go/bin/ghz" --insecure \
    --proto apps/gateway-keeper/proto/locking.proto \
    --call locking.SlotLockingService.LockSlot \
    --data "$GRPC_PAYLOAD" \
    --connections "$LOCK_RAMP_CONNECTIONS" \
    --concurrency "$LOCK_RAMP_CONCURRENCY" \
    --rps "$rps" \
    --max-duration "$LOCK_RAMP_STAGE_DURATION" \
    --total "$total" \
    --format json \
    --output "$report" \
    "$target"
  assert_ghz_transport_success "$report" "$total"
  # The first accepted request must leave one seat lock. After asserting that
  # duplicate traffic did not unlock it, release and reacquire it once to
  # prove cleanup before the next stage starts.
  expect_lock_conflict
  unlock
  expect_lock_success
  unlock
  ./load-tests/push-prometheus-metrics.sh stage "$total" "$rps" \
    "$stage_duration_seconds" "$report"
  if (( index < ${#stages[@]} - 1 )); then
    echo "Cooling down for ${LOCK_RAMP_COOLDOWN} before the next stage."
    sleep "$cooldown_seconds"
  fi
done

echo "Completed stages: ${stages[*]} for schedule $showtime_id seat $seat_id."

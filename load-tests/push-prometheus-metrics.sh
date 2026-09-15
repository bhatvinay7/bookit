#!/usr/bin/env bash
# Push bounded, non-secret manual-load-test summaries to the in-cluster
# Pushgateway. Prometheus scrapes them and Grafana displays them in testLoad.
set -Eeuo pipefail

: "${LOAD_TEST_PUSHGATEWAY_URL:?LOAD_TEST_PUSHGATEWAY_URL is required}"
: "${LOAD_TEST_RUN_ID:?LOAD_TEST_RUN_ID is required}"

push() {
  local grouping=$1
  local metrics=$2
  curl --fail --silent --show-error --data-binary "$metrics" \
    "${LOAD_TEST_PUSHGATEWAY_URL}/metrics/job/bookit_load_test/run_id/${LOAD_TEST_RUN_ID}${grouping}" >/dev/null
}

record_run() {
  local observers=${1:-0}
  push "" "# TYPE bookit_load_test_run_info gauge
bookit_load_test_run_info{test_case=\"single_seat_lock_ramp\"} 1
# TYPE bookit_load_test_ws_observers gauge
bookit_load_test_ws_observers{test_case=\"single_seat_lock_ramp\"} ${observers}
"
}

record_stage() {
  local stage=$1 target_rps=$2 target_duration=$3 report=$4
  local count rps duration status_metrics status count_code
  count=$(jq -r '.count // 0' "$report")
  rps=$(jq -r '.rps // 0' "$report")
  duration=$(jq -r '((.total // 0) / 1000000000)' "$report")
  status_metrics=""
  while IFS=$'\t' read -r status count_code; do
    [ -n "$status" ] || continue
    status_metrics+="bookit_load_test_stage_grpc_status_requests{test_case=\"single_seat_lock_ramp\",grpc_status=\"${status}\"} ${count_code}
"
  done < <(jq -r '(.statusCodeDistribution // {}) | to_entries[]? | [.key, .value] | @tsv' "$report")
  push "/stage/${stage}" "# TYPE bookit_load_test_stage_requested_requests gauge
bookit_load_test_stage_requested_requests{test_case=\"single_seat_lock_ramp\"} ${stage}
# TYPE bookit_load_test_stage_target_rps gauge
bookit_load_test_stage_target_rps{test_case=\"single_seat_lock_ramp\"} ${target_rps}
# TYPE bookit_load_test_stage_target_duration_seconds gauge
bookit_load_test_stage_target_duration_seconds{test_case=\"single_seat_lock_ramp\"} ${target_duration}
# TYPE bookit_load_test_stage_completed_requests gauge
bookit_load_test_stage_completed_requests{test_case=\"single_seat_lock_ramp\"} ${count}
# TYPE bookit_load_test_stage_rps gauge
bookit_load_test_stage_rps{test_case=\"single_seat_lock_ramp\"} ${rps}
# TYPE bookit_load_test_stage_duration_seconds gauge
bookit_load_test_stage_duration_seconds{test_case=\"single_seat_lock_ramp\"} ${duration}
# TYPE bookit_load_test_stage_complete gauge
bookit_load_test_stage_complete{test_case=\"single_seat_lock_ramp\"} 1
${status_metrics}
"
}

case "${1:-}" in
  run) record_run "${2:-0}" ;;
  stage) record_stage "${2:?stage is required}" "${3:?target rps is required}" "${4:?target duration is required}" "${5:?ghz report is required}" ;;
  *) echo "usage: $0 run [ws_observers] | stage <request_total> <target_rps> <target_duration_seconds> <ghz_json_report>" >&2; exit 2 ;;
esac

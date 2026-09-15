#!/usr/bin/env bash
# Captures the Kubernetes state needed to correlate an offered load with HPA
# decisions and Gateway Keeper endpoints. It records metadata only; no secret
# values, request bodies, or pod logs are collected.
set -Eeuo pipefail

: "${LOAD_TEST_EVIDENCE_DIR:=load-test-results/cluster-evidence}"
: "${LOAD_TEST_EVIDENCE_INTERVAL_SECONDS:=15}"

if ! [[ "$LOAD_TEST_EVIDENCE_INTERVAL_SECONDS" =~ ^[1-9][0-9]*$ ]]; then
  echo "LOAD_TEST_EVIDENCE_INTERVAL_SECONDS must be a positive integer." >&2
  exit 2
fi

mkdir -p "$LOAD_TEST_EVIDENCE_DIR"

capture() {
  local timestamp=$1
  kubectl -n bookit get hpa -o json > "$LOAD_TEST_EVIDENCE_DIR/hpa-${timestamp}.json" || true
  kubectl -n bookit get pods -o json > "$LOAD_TEST_EVIDENCE_DIR/pods-${timestamp}.json" || true
  kubectl -n bookit get endpointslices \
    -l kubernetes.io/service-name=gateway-keeper -o json \
    > "$LOAD_TEST_EVIDENCE_DIR/gateway-keeper-endpoints-${timestamp}.json" || true
  kubectl -n bookit top pods > "$LOAD_TEST_EVIDENCE_DIR/pod-usage-${timestamp}.txt" 2>&1 || true
}

while true; do
  capture "$(date -u +%Y%m%dT%H%M%SZ)"
  sleep "$LOAD_TEST_EVIDENCE_INTERVAL_SECONDS"
done

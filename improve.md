
### 1.3 k6 Load Test — Seat Lock Concurrent `[ ]`

**File to create:** `load-tests/k6/seat-lock-concurrent.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const lockSuccesses = new Counter('seat_lock_success');
const lockConflicts = new Counter('seat_lock_conflict');
const lockLatency   = new Trend('seat_lock_latency_ms', true);

export const options = {
  scenarios: {
    seat_contention: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 },
        { duration: '60s', target: 200 },
        { duration: '30s', target: 0 },
      ],
    },
    payment_complete: {
      executor: 'constant-arrival-rate',
      rate: 10,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 20,
    },
  },
  thresholds: {
    'seat_lock_latency_ms': ['p(95)<500'],
    'http_req_failed':       ['rate<0.01'],
    'seat_lock_success':     ['count>0'],
  },
};

export default function seatLockScenario() {
  const scheduleId = Math.floor(Math.random() * 5) + 1;
  const seatId = Math.floor(Math.random() * 50) + 1;
  const userId = __VU;

  const start = Date.now();
  const res = http.post(
    `${__ENV.API_URL}/api/schedule/${scheduleId}/lock`,
    JSON.stringify({ seat_ids: [seatId], user_id: userId }),
    { headers: { 'Content-Type': 'application/json',
                 'Authorization': `Bearer ${__ENV.JWT_TOKEN}` } }
  );
  lockLatency.add(Date.now() - start);

  if (res.status === 200)      lockSuccesses.add(1);
  else if (res.status === 409) lockConflicts.add(1);

  check(res, {
    'status not 5xx': (r) => r.status < 500,
    'response < 500ms': (r) => r.timings.duration < 500,
  });
  sleep(0.1);
}
```

**Additional scripts needed:**
- `load-tests/k6/payment-flow.js` — end-to-end checkout flow
- `load-tests/k6/ws-seat-room.js` — WebSocket seat room fan-out

**What to record in `docs/load-test-report.md`:**
- Environment: cluster specs, DB tiers, replica counts
- p50/p95/p99 latency at each VU level
- Error rate at saturation
- First bottleneck (Redis pool? RMQ consumer lag? PG pool wait?)
- Lock-server RMQ queue depth under 200 VU contention

---

### 1.4 KEDA ScaledObjects for Workers `[ ]`

**Problem:** Workers use CPU HPAs (`bookit-k8s/apps/base/hpa.yaml` lines 147–238). CPU is the wrong signal for queue-backed workers. Under slow external calls (Razorpay, SMTP), CPU stays low while queues grow.

**New file: `bookit-k8s/apps/base/keda-scaledobjects.yaml`**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: lock-server-scaledobject
  annotations: { argocd.argoproj.io/sync-wave: "25" }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: lock-server }
  minReplicaCount: 1
  maxReplicaCount: 5
  cooldownPeriod: 120
  pollingInterval: 15
  triggers:
    - type: rabbitmq
      metadata:
        protocol: amqp
        queueName: seat_lock_queue
        mode: QueueLength
        value: "50"           # 1 replica per 50 messages in queue
      authenticationRef: { name: keda-rabbitmq-auth }
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: payment-processor-scaledobject
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: payment-processor }
  minReplicaCount: 1
  maxReplicaCount: 5
  cooldownPeriod: 300
  pollingInterval: 10
  triggers:
    - type: rabbitmq
      metadata: { protocol: amqp, queueName: payment_queue, mode: QueueLength, value: "10" }
      authenticationRef: { name: keda-rabbitmq-auth }
---
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: notification-worker-scaledobject
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: notification-worker }
  minReplicaCount: 1
  maxReplicaCount: 5
  cooldownPeriod: 120
  pollingInterval: 15
  triggers:
    - type: rabbitmq
      metadata: { protocol: amqp, queueName: notification_queue, mode: QueueLength, value: "100" }
      authenticationRef: { name: keda-rabbitmq-auth }
---
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: keda-rabbitmq-auth
spec:
  secretTargetRef:
    - { parameter: host, name: backend-secrets, key: RABBITMQ_URL }
```

**Also required:**
- Delete worker CPU HPAs from `hpa.yaml` (lines 147–238)
- Keep CPU HPAs for stateless services (http-server, gateway-keeper, ws-server, web, search-server)
- Add KEDA operator Argo Application: `bookit-k8s/argocd/bootstrap-keda.yaml`
- Add `keda-scaledobjects.yaml` to `bookit-k8s/apps/base/kustomization.yaml`

---

### 1.5 SLO Definitions `[ ]`

**File: `docs/slo.md`**

| SLO | Metric | Target | Window |
|---|---|---|---|
| Booking API availability | `1 - (5xx / total)` | 99.5% | 30-day rolling |
| Seat lock p95 latency | `http_request_duration_seconds` | < 500ms | 7-day rolling |
| Payment processing lag | RMQ oldest-message age on `payment_queue` | < 30s | 1-hour |
| Notification delivery | oldest-message age on `notification_queue` | < 120s | 1-hour |
| Search query p95 | Elasticsearch response time | < 300ms | 7-day rolling |
| WS reconnect success | reconnects OK / reconnect attempts | 95% | 24-hour |

**Error budget:**
```
booking_api_budget = (1 - 0.995) * 43200 min/month = 216 min/month
```

**Burn-rate alerts** (add to `prometheus-grafana.yaml`):
```yaml
- alert: BookingAPIFastErrorBurn  # 14x burn rate → page
  expr: |
    sum(rate(http_requests_total{status=~"5.."}[1h])) /
    sum(rate(http_requests_total[1h])) > (14 * 0.005)
  for: 2m
  labels: { severity: critical }

- alert: BookingAPISlowErrorBurn  # 3x burn rate → ticket
  expr: |
    sum(rate(http_requests_total{status=~"5.."}[6h])) /
    sum(rate(http_requests_total[6h])) > (3 * 0.005)
  for: 15m
  labels: { severity: warning }
```

**Files:**
- `docs/slo.md` — NEW
- `bookit-k8s/infra/base/monitoring/prometheus-grafana.yaml` — ADD burn-rate rules

---

### 1.6 CQRS Split `[ ]`

**Problem:** `apps/http-server` handles both write (booking, payment) and read (shows, schedules) requests on the same connection pool. Read-heavy traffic contends with write transactions.

**Target architecture:**
```
POST /api/booking        → CommandHandler → PostgreSQL (write)
POST /api/payment        → CommandHandler → PostgreSQL (write) + RMQ
GET  /api/shows          → QueryHandler  → Redis cache → (miss) Elasticsearch
GET  /api/schedule/:id   → QueryHandler  → Redis cache → (miss) PG read replica
GET  /api/tickets        → QueryHandler  → PG read replica
```

**Files:**
- `apps/http-server/src/commands/` — NEW directory (booking.rs, payment.rs)
- `apps/http-server/src/queries/` — NEW directory (shows.rs, schedule.rs, tickets.rs)
- `apps/http-server/src/main.rs` — separate command/query router
- `.env` — ADD `DATABASE_READ_URL` for PG read replica

---

## 2. AquaBid — Improvements

### 2.1 KEDA Kafka Lag ScaledObject `[ ]`

**Problem:** `auction-k8s/apps/base/auction-engine.yaml` lines 62–85 use CPU HPA with `maxReplicas: 1`. Auction engine throughput is Kafka partition-bound, not CPU-bound.

**New file: `auction-k8s/apps/base/keda-auction-engine.yaml`**

```yaml
apiVersion: keda.sh/v1alpha1
kind: ScaledObject
metadata:
  name: auction-engine-scaledobject
  annotations: { argocd.argoproj.io/sync-wave: "25" }
spec:
  scaleTargetRef: { apiVersion: apps/v1, kind: Deployment, name: auction-engine }
  minReplicaCount: 1
  maxReplicaCount: 32        # HARD LIMIT = auction-bids partition count
  cooldownPeriod: 300
  pollingInterval: 15
  triggers:
    - type: kafka
      metadata:
        bootstrapServers: auction-kafka-kafka-bootstrap.kafka.svc.cluster.local:9093
        consumerGroup: auction-engine
        topic: auction-bids
        lagThreshold: "50"           # 1 replica per 50 lagging messages
        offsetResetPolicy: latest
        allowIdleConsumers: "false"  # never exceed partition count
        scaleToZeroOnInvalidOffset: "false"
      authenticationRef: { name: keda-kafka-auth }
---
apiVersion: keda.sh/v1alpha1
kind: TriggerAuthentication
metadata:
  name: keda-kafka-auth
spec:
  secretTargetRef:
    - { parameter: tls,  name: backend-secrets,  key: KAFKA_TLS_ENABLED }
    - { parameter: ca,   name: kafka-tls-secret,  key: ca.crt }
    - { parameter: cert, name: kafka-tls-secret,  key: tls.crt }
    - { parameter: key,  name: kafka-tls-secret,  key: tls.key }
```

**Scaling math:**
```
lag=50   → 1 replica  (baseline)
lag=500  → 10 replicas
lag=1600 → 32 replicas (max = partition count)
```

**Constraint:** Never increase `auction-bids` partitions while auctions are active (per README). KEDA `allowIdleConsumers: false` enforces maxReplicas ≤ partition count.

**Files:**
- `auction-k8s/apps/base/keda-auction-engine.yaml` — NEW
- `auction-k8s/apps/base/auction-engine.yaml` — DELETE HPA section (lines 62–85)
- `auction-k8s/apps/base/kustomization.yaml` — ADD keda file

---

### 2.2 Sliding Window Rate Limiting `[ ]`

**Problem:** Gateway-keeper uses fixed-window counters. Fixed windows allow 2x rate at window boundaries (100 req/min → 100 at T=59s + 100 at T=60s = 200 req in 2 seconds).

**New file: `apps/gateway-keeper/src/rate_limit_sliding.rs`**

```rust
use redis::Script;
use std::time::{SystemTime, UNIX_EPOCH};

/// Sliding window rate limiter using Redis sorted sets.
/// Returns (allowed, current_count, reset_at_ms)
pub async fn check_sliding_window(
    conn: &mut redis::aio::ConnectionManager,
    key: &str,
    limit: i64,
    window_ms: i64,
) -> (bool, i64, i64) {
    let now_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH).unwrap().as_millis() as i64;
    let window_start = now_ms - window_ms;

    // Atomic: ZREMRANGEBYSCORE old entries, count, conditionally ZADD
    let script = Script::new(r#"
        local key          = KEYS[1]
        local now          = tonumber(ARGV[1])
        local window_start = tonumber(ARGV[2])
        local limit        = tonumber(ARGV[3])
        local ttl_ms       = tonumber(ARGV[4])
        local member       = ARGV[5]

        redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)
        local count = redis.call('ZCARD', key)

        if count < limit then
            redis.call('ZADD', key, now, member)
            redis.call('PEXPIRE', key, ttl_ms)
            return {1, count + 1}
        end
        return {0, count}
    "#);

    let member = format!("{}:{}", now_ms, fastrand::u32(..));

    let result: Vec<i64> = script
        .key(key)
        .arg(now_ms).arg(window_start).arg(limit)
        .arg(window_ms * 2)   // TTL = 2x window
        .arg(&member)
        .invoke_async(conn).await
        .unwrap_or(vec![0, 0]);

    (result[0] == 1, result[1], now_ms + window_ms)
}

// Usage in gateway-keeper middleware:
// let (allowed, count, reset_at) = check_sliding_window(
//     &mut redis, &format!("rl:user:{user_id}"), 100, 60_000
// ).await;
```

**Trade-off to document:**
- Fixed window: O(1) space, allows 2x rate at boundary
- Sliding window log (this): O(limit) space per key, exact enforcement
- Sliding window counter (approximate): O(1), ~1% error, use if memory constrained

**Files:**
- `apps/gateway-keeper/src/rate_limit_sliding.rs` — NEW
- `apps/gateway-keeper/src/main.rs` or rate_limiter module — call `check_sliding_window`

---

add the distributed tracing at chess and aquabid similar to bookit.
install the custom load balancer at bootstrap server as we did at bookit
As we mentined kheda should be exited for ques as queue length increases we need to increase the no. of pods. not cp
import http from 'k6/http';
import { check, sleep } from 'k6';

const baseUrl = (__ENV.LOAD_TEST_API_URL || '').replace(/\/$/, '');
const path = __ENV.LOAD_TEST_PATH || '/health';
const profile = __ENV.LOAD_TEST_PROFILE || 'peak-spike';
const duration = __ENV.LOAD_TEST_DURATION || '30s';
const maxVUs = Number(__ENV.LOAD_TEST_MAX_VUS || '250');
const targetRps = Number(__ENV.LOAD_TEST_TARGET_RPS || '50');
const expectedStatus = Number(__ENV.LOAD_TEST_EXPECTED_STATUS || '200');
const responseBodyContains = __ENV.LOAD_TEST_RESPONSE_BODY_CONTAINS || '';
const bearerToken = __ENV.LOAD_TEST_BEARER_TOKEN;

if (!baseUrl) {
  throw new Error('LOAD_TEST_API_URL must be configured from the existing environment secret.');
}
if (!Number.isInteger(maxVUs) || maxVUs < 1) {
  throw new Error('LOAD_TEST_MAX_VUS must be a positive integer.');
}
if (!Number.isInteger(targetRps) || targetRps < 1) {
  throw new Error('LOAD_TEST_TARGET_RPS must be a positive integer.');
}
if (!Number.isInteger(expectedStatus) || expectedStatus < 100 || expectedStatus > 599) {
  throw new Error('LOAD_TEST_EXPECTED_STATUS must be a valid HTTP status code.');
}

function optionsFor(selectedProfile) {
  const common = {
    tags: { test_suite: 'bookit', test_case: selectedProfile },
    thresholds: {
      http_req_failed: ['rate<0.05'],
      http_req_duration: ['p(95)<2000'],
      checks: ['rate>0.99'],
      dropped_iterations: ['count==0'],
    },
  };

  // A fixed arrival rate measures application capacity. A VU-only executor
  // increases the offered request rate whenever the application gets faster,
  // which makes HPA and latency results difficult to compare between runs.
  const preAllocatedVUs = Math.min(maxVUs, Math.max(1, targetRps));

  switch (selectedProfile) {
    case 'peak-spike':
      return {
        ...common,
        scenarios: {
          traffic: {
            executor: 'ramping-arrival-rate',
            startRate: 0,
            timeUnit: '1s',
            preAllocatedVUs,
            maxVUs,
            stages: [
              { duration: '1m', target: targetRps },
              { duration, target: targetRps },
              { duration: '1m', target: 0 },
            ],
            gracefulStop: '30s',
          },
        },
      };
    case 'endurance-soak':
      return {
        ...common,
        scenarios: {
          traffic: {
            executor: 'constant-arrival-rate',
            rate: targetRps,
            timeUnit: '1s',
            duration,
            preAllocatedVUs,
            maxVUs,
            gracefulStop: '30s',
          },
        },
      };
    default:
      throw new Error(`Unsupported LOAD_TEST_PROFILE: ${selectedProfile}`);
  }
}

export const options = optionsFor(profile);

export default function () {
  const headers = { 'User-Agent': 'bookit-load-test/1.0' };
  if (bearerToken) headers.Authorization = `Bearer ${bearerToken}`;

  const response = http.get(`${baseUrl}${path}`, {
    headers,
    tags: { endpoint: path, test_case: profile },
  });
  check(response, {
    [`response is HTTP ${expectedStatus}`]: (res) => res.status === expectedStatus,
    ...(responseBodyContains
      ? { 'response contains expected value': (res) => String(res.body).includes(responseBodyContains) }
      : {}),
  });

  // Arrival-rate executors pace requests globally. This short delay only
  // yields a VU after the request and does not set the offered request rate.
  sleep(0.01);
}

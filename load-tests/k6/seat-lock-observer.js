import ws from 'k6/ws';

const rawUrl = __ENV.LOAD_TEST_WS_URL || '';
const showtimeId = Number(__ENV.LOAD_TEST_SHOWTIME_ID || '0');
const observers = Number(__ENV.LOAD_TEST_WS_OBSERVERS || '25');

if (!rawUrl || !Number.isInteger(showtimeId) || showtimeId < 0) {
  throw new Error('LOAD_TEST_WS_URL and a non-negative LOAD_TEST_SHOWTIME_ID are required.');
}

const url = rawUrl.includes('?')
  ? `${rawUrl}&token=mock_token`
  : `${rawUrl}?token=mock_token`;

export const options = {
  vus: observers,
  duration: '4h',
  tags: { test_suite: 'bookit', test_case: 'single-seat-lock-ramp', component: 'ws-server' },
};

export default function () {
  ws.connect(url, { tags: { room_id: String(showtimeId) } }, (socket) => {
    socket.on('open', () => {
      socket.send(JSON.stringify({ type: 'Subscribe', room_id: showtimeId }));
    });
    // The CI workflow stops the observer after the final Ghz stage. Keeping it
    // open makes Redis room broadcasts measurable by ws-server throughout the
    // full contention ramp.
  });
}

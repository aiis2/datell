require('ts-node/register/transpile-only');

const assert = require('node:assert/strict');
const test = require('node:test');

const { executeWithDeadline } = require('../src/renderer/services/toolExecutionDeadline.ts');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test('returns a fast fulfillment unchanged', async () => {
  const outcome = await executeWithDeadline({
    timeoutMs: 50,
    execute: async () => 'ok',
  });

  assert.deepEqual(outcome, {
    status: 'fulfilled',
    value: 'ok',
    deadlineExceeded: false,
    parentAborted: false,
  });
});

test('retains a fast rejection', async () => {
  const failure = new Error('boom');
  const outcome = await executeWithDeadline({
    timeoutMs: 50,
    execute: async () => {
      throw failure;
    },
  });

  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.reason, failure);
  assert.equal(outcome.deadlineExceeded, false);
  assert.equal(outcome.parentAborted, false);
});

test('aborts a cooperative tool at the deadline and waits for settlement', async () => {
  const events = [];
  let sideEffects = 0;
  const outcome = await executeWithDeadline({
    timeoutMs: 10,
    execute: (signal) => new Promise((resolve, reject) => {
      const mutationTimer = setTimeout(() => {
        sideEffects += 1;
        resolve('committed');
      }, 40);
      signal.addEventListener('abort', () => {
        clearTimeout(mutationTimer);
        events.push('tool-aborted');
        setTimeout(() => {
          events.push('tool-settled');
          reject(new DOMException('cancelled', 'AbortError'));
        }, 5);
      }, { once: true });
    }),
  });
  events.push('helper-returned');

  assert.deepEqual(events, ['tool-aborted', 'tool-settled', 'helper-returned']);
  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.deadlineExceeded, true);
  assert.equal(outcome.parentAborted, false);
  await sleep(50);
  assert.equal(sideEffects, 0, 'a cooperative tool must not commit after deadline cancellation');
});

test('waits for a non-cooperative late fulfillment', async () => {
  const events = [];
  const outcome = await executeWithDeadline({
    timeoutMs: 5,
    execute: async () => {
      await sleep(20);
      events.push('tool-settled');
      return 'committed';
    },
  });
  events.push('helper-returned');

  assert.deepEqual(events, ['tool-settled', 'helper-returned']);
  assert.deepEqual(outcome, {
    status: 'fulfilled',
    value: 'committed',
    deadlineExceeded: true,
    parentAborted: false,
  });
});

test('waits for a non-cooperative late rejection', async () => {
  const failure = new Error('late failure');
  const outcome = await executeWithDeadline({
    timeoutMs: 5,
    execute: async () => {
      await sleep(20);
      throw failure;
    },
  });

  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.reason, failure);
  assert.equal(outcome.deadlineExceeded, true);
  assert.equal(outcome.parentAborted, false);
});

test('propagates parent cancellation to the per-call signal', async () => {
  const parent = new AbortController();
  let observedAbort = false;

  const pending = executeWithDeadline({
    timeoutMs: 100,
    parentSignal: parent.signal,
    execute: (signal) => new Promise((resolve) => {
      signal.addEventListener('abort', () => {
        observedAbort = true;
        resolve('stopped');
      }, { once: true });
    }),
  });

  parent.abort();
  const outcome = await pending;

  assert.equal(observedAbort, true);
  assert.equal(outcome.status, 'fulfilled');
  assert.equal(outcome.value, 'stopped');
  assert.equal(outcome.deadlineExceeded, false);
  assert.equal(outcome.parentAborted, true);
});

test('does not start execution when the parent is already aborted', async () => {
  const parent = new AbortController();
  parent.abort(new DOMException('stopped', 'AbortError'));
  let executed = false;

  const outcome = await executeWithDeadline({
    timeoutMs: 100,
    parentSignal: parent.signal,
    execute: async () => {
      executed = true;
      return 'unexpected';
    },
  });

  assert.equal(executed, false);
  assert.equal(outcome.status, 'rejected');
  assert.equal(outcome.parentAborted, true);
  assert.equal(outcome.deadlineExceeded, false);
});

test('removes the parent abort listener after settlement', async () => {
  let addCount = 0;
  let removeCount = 0;
  const parentSignal = {
    aborted: false,
    reason: undefined,
    addEventListener(type) {
      if (type === 'abort') addCount += 1;
    },
    removeEventListener(type) {
      if (type === 'abort') removeCount += 1;
    },
  };

  const outcome = await executeWithDeadline({
    timeoutMs: 50,
    parentSignal,
    execute: async () => 'done',
  });

  assert.equal(outcome.status, 'fulfilled');
  assert.equal(addCount, 1);
  assert.equal(removeCount, 1);
});

test('cleans the timer after fast settlement', async () => {
  let sawAbort = false;
  const outcome = await executeWithDeadline({
    timeoutMs: 5,
    execute: async (signal) => {
      signal.addEventListener('abort', () => {
        sawAbort = true;
      }, { once: true });
      return 'done';
    },
  });

  await sleep(20);

  assert.equal(outcome.status, 'fulfilled');
  assert.equal(outcome.deadlineExceeded, false);
  assert.equal(sawAbort, false, 'deadline timer must not abort after execution has settled');
});

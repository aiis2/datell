const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'public', 'vendor', 'report-event-bus-preview.js'),
  'utf8',
);

const documentListeners = Object.create(null);
const timerQueue = [];

const context = {
  console,
  document: {
    readyState: 'loading',
    addEventListener(type, fn) {
      (documentListeners[type] = documentListeners[type] || []).push(fn);
    },
  },
  setTimeout(fn) {
    timerQueue.push(fn);
    return timerQueue.length;
  },
  clearTimeout() {},
};

context.window = context;

vm.runInNewContext(source, context, { filename: 'report-event-bus-preview.js' });

const stableBus = context.__REPORT_EVENT_BUS__;
const observed = [];
const targetCalls = [];

stableBus.addEventListener('filterChange', function (evt) {
  observed.push(evt.detail.value);
});

stableBus.registerApex('sales_card', { id: 'apex-1' });
stableBus.emit('sales_card', 'click', { name: '北京' });

const target = {
  registerApex(cardId, instance) {
    targetCalls.push(['registerApex', cardId, instance.id]);
  },
  emit(cardId, eventType, payload) {
    targetCalls.push(['emit', cardId, eventType, payload.name]);
  },
};

context.__REPORT_EVENT_BUS__ = target;

assert.strictEqual(
  context.__REPORT_EVENT_BUS__,
  stableBus,
  'preview shell should keep a stable bus object identity after child engine upgrade',
);

stableBus.dispatchEvent({ type: 'filterChange', detail: { value: '北京' } });

assert.deepEqual(
  observed,
  ['北京'],
  'listeners registered before child engine upgrade should still receive bus events',
);

(documentListeners.DOMContentLoaded || []).forEach(function (listener) {
  listener({ type: 'DOMContentLoaded' });
});

while (timerQueue.length > 0) {
  const timer = timerQueue.shift();
  timer();
}

assert.deepEqual(
  targetCalls,
  [
    ['registerApex', 'sales_card', 'apex-1'],
    ['emit', 'sales_card', 'click', '北京'],
  ],
  'queued preview bus calls should replay after the child runtime becomes ready',
);

stableBus.registerApex('profit_card', { id: 'apex-2' });

assert.deepEqual(
  targetCalls[2],
  ['registerApex', 'profit_card', 'apex-2'],
  'calls after the runtime upgrade should proxy directly to the child engine',
);

console.log('preview event bus adapter ok');
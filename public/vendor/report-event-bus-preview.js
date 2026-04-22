(function (global) {
  'use strict';

  var existing = global.__REPORT_EVENT_BUS__;
  if (existing && existing.__isPreviewStableBus) {
    return;
  }

  var listenerMap = Object.create(null);
  var pendingCalls = [];
  var targetBus = null;
  var flushScheduled = false;
  var targetReady = false;

  function addListener(type, fn) {
    if (!type || typeof fn !== 'function') return;
    if (!listenerMap[type]) listenerMap[type] = [];
    if (listenerMap[type].indexOf(fn) === -1) {
      listenerMap[type].push(fn);
    }
  }

  function removeListener(type, fn) {
    if (!listenerMap[type]) return;
    listenerMap[type] = listenerMap[type].filter(function (candidate) {
      return candidate !== fn;
    });
  }

  function flushPendingCalls() {
    if (!targetBus) return;
    flushScheduled = false;
    targetReady = true;
    while (pendingCalls.length > 0) {
      var pending = pendingCalls.shift();
      var method = targetBus[pending.method];
      if (typeof method === 'function') {
        try {
          method.apply(targetBus, pending.args);
        } catch (error) {
          console.warn('[preview-bus] failed to replay call:', pending.method, error);
        }
      }
    }
  }

  function scheduleFlush() {
    if (!targetBus || flushScheduled) return;
    flushScheduled = true;

    if (global.document && global.document.readyState === 'loading' && global.document.addEventListener) {
      global.document.addEventListener('DOMContentLoaded', function _onReady() {
        global.setTimeout(flushPendingCalls, 0);
      }, { once: true });
      return;
    }

    global.setTimeout(flushPendingCalls, 0);
  }

  function proxyOrQueue(methodName, argsLike) {
    var args = Array.prototype.slice.call(argsLike || []);
    if (targetReady && targetBus && typeof targetBus[methodName] === 'function') {
      return targetBus[methodName].apply(targetBus, args);
    }
    pendingCalls.push({ method: methodName, args: args });
    scheduleFlush();
    return undefined;
  }

  var stableBus = {
    __isPreviewStableBus: true,

    addEventListener: function (type, fn) {
      addListener(type, fn);
    },

    removeEventListener: function (type, fn) {
      removeListener(type, fn);
    },

    dispatchEvent: function (evt) {
      if (!evt || !evt.type) return false;
      var listeners = (listenerMap[evt.type] || []).slice();
      listeners.forEach(function (listener) {
        try {
          listener(evt);
        } catch (error) {
          console.warn('[preview-bus] listener error:', error);
        }
      });
      return true;
    },

    init: function () {
      return proxyOrQueue('init', arguments);
    },

    register: function () {
      return proxyOrQueue('register', arguments);
    },

    registerECharts: function () {
      return proxyOrQueue('registerECharts', arguments);
    },

    registerApex: function () {
      return proxyOrQueue('registerApex', arguments);
    },

    emit: function () {
      return proxyOrQueue('emit', arguments);
    },

    clearFilter: function () {
      return proxyOrQueue('clearFilter', arguments);
    },

    resetAll: function () {
      return proxyOrQueue('resetAll', arguments);
    },

    refreshCard: function () {
      return proxyOrQueue('refreshCard', arguments);
    },

    updateFilterTags: function () {
      return proxyOrQueue('updateFilterTags', arguments);
    },

    getState: function () {
      if (targetReady && targetBus && typeof targetBus.getState === 'function') {
        return targetBus.getState();
      }
      return {
        filters: Object.assign({}, global.__FILTER_STATE__ || {}),
      };
    },

    getApexInstances: function () {
      if (targetReady && targetBus && typeof targetBus.getApexInstances === 'function') {
        return targetBus.getApexInstances();
      }
      return [];
    },

    getApexInstance: function (cardId) {
      if (targetReady && targetBus && typeof targetBus.getApexInstance === 'function') {
        return targetBus.getApexInstance(cardId);
      }
      return null;
    },

    __setTarget: function (nextTarget) {
      if (!nextTarget || nextTarget === stableBus) return;
      targetBus = nextTarget;
      targetReady = false;
      scheduleFlush();
    },
  };

  Object.defineProperty(global, '__REPORT_EVENT_BUS__', {
    configurable: true,
    enumerable: false,
    get: function () {
      return stableBus;
    },
    set: function (value) {
      stableBus.__setTarget(value);
    },
  });

  if (!global.__FILTER_STATE__) {
    global.__FILTER_STATE__ = {};
  }

  if (existing && existing !== stableBus) {
    stableBus.__setTarget(existing);
  }
})(window);
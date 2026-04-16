/**
 * filter-controls.js — E 类筛选控件自动初始化脚本
 *
 * 功能：
 *  - 自动发现 [data-filter-id] 节点，注册交互事件
 *  - 通过 window.__REPORT_EVENT_BUS__ 广播筛选变化
 *  - 支持：date-range、year-month、dropdown、checkbox-group、
 *           radio-group、search-box、numeric-range、tag-pills
 *  - 按钮组 (.filter-btn) active 态切换
 *  - 重置逻辑 (.filter-reset-button)
 *  - 全局面板"应用"按钮 (.filter-apply-btn)
 *
 * 使用：在报告 HTML 页面 </body> 前引入即可
 *   <script src="filter-controls.js"></script>
 *
 * 外部接口：
 *   window.__REPORT_EVENT_BUS__  EventTarget，发布 'filterChange' 事件
 *   window.__FILTER_STATE__      Object，当前全部筛选器状态快照
 */
(function (global) {
  'use strict';

  /* ── 事件总线 ───────────────────────────────────────────── */
  if (!global.__REPORT_EVENT_BUS__) {
    try {
      global.__REPORT_EVENT_BUS__ = new EventTarget();
    } catch (e) {
      // 极端兼容回退：简单发布-订阅
      var _listeners = {};
      global.__REPORT_EVENT_BUS__ = {
        addEventListener: function (type, fn) {
          (_listeners[type] = _listeners[type] || []).push(fn);
        },
        removeEventListener: function (type, fn) {
          _listeners[type] = (_listeners[type] || []).filter(function (f) { return f !== fn; });
        },
        dispatchEvent: function (evt) {
          (_listeners[evt.type] || []).forEach(function (fn) { fn(evt); });
        }
      };
    }
  }

  /* ── 全局状态存储 ──────────────────────────────────────── */
  if (!global.__FILTER_STATE__) {
    global.__FILTER_STATE__ = {};
  }

  /**
   * 发布筛选变化事件
   * @param {string} filterId  data-filter-id 值
   * @param {*}      value     新的筛选值
   * @param {string} type      筛选类型字符串
   * @param {string} [column]  可选：映射到数据列名（默认等同 filterId）
   */
  function emitChange(filterId, value, type, column) {
    // BUG-NEW-2 FIX: 存储 column 映射，供 filterApply 处理器用于正确解析列名
    // 当 filterId !== column 时（如 filterId="myFilter" 但列名为 "sale_amount"），
    // InteractivityEngine 的 filterApply 处理器需要 entry.column 才能正确生成 SQL
    var col = column || filterId;
    // BUG-FC-FLAT FIX: 使用扁平格式存储 __FILTER_STATE__（column→rawValue），与 IE 覆写格式一致。
    // 旧版富格式 { value, type, column } 导致 AI 图表代码的 document.addEventListener('filterChange')
    // 在 IE 处理之前触发时读到对象而非字符串，object !== '全部' 始终为 true，过滤掉全部数据行，
    // 造成所有图表在任意筛选后变为空白。
    if (value === null || value === undefined || value === '') {
      delete global.__FILTER_STATE__[col];
    } else {
      global.__FILTER_STATE__[col] = value;
    }
    // 保留富格式信息在 detail 中，供 filterApply 处理器解析（IE 的 BUG-NEW-6 FIX 支持两种格式）
    var detail = { filterId: filterId, column: col, value: value, type: type, state: global.__FILTER_STATE__ };
    console.log('[FC] emitChange filterId=%s col=%s value=%o type=%s', filterId, col, value, type);
    var evt;
    try {
      evt = new CustomEvent('filterChange', { bubbles: true, detail: detail });
    } catch (e) {
      // IE11 兼容
      evt = document.createEvent('CustomEvent');
      evt.initCustomEvent('filterChange', true, true, detail);
    }
    // 1. 通过旧版 EventTarget 总线（向后兼容）
    try {
      if (global.__REPORT_EVENT_BUS__ && global.__REPORT_EVENT_BUS__.dispatchEvent) {
        global.__REPORT_EVENT_BUS__.dispatchEvent(evt);
      }
    } catch (e2) { console.warn('[FC] EventBus dispatch error:', e2); }
    // 2. 通过 document 派发（InteractivityEngine 监听此入口）
    try {
      document.dispatchEvent(new CustomEvent('filterChange', { bubbles: false, detail: detail }));
      console.log('[FC] document filterChange dispatched ok');
    } catch (e3) { console.warn('[FC] document dispatch error:', e3); }
    // 3. 同时通过 window 派发（兼容 window.addEventListener('filterChange') 写法）
    try {
      global.dispatchEvent(new CustomEvent('filterChange', { bubbles: false, detail: detail }));
      console.log('[FC] window filterChange dispatched ok');
    } catch (e4) { console.warn('[FC] window dispatch error:', e4); }
  }

  /* ── 工具函数 ───────────────────────────────────────────── */

  function getFilterId(el) {
    return el.getAttribute('data-filter-id');
  }

  function getFilterType(el) {
    return el.getAttribute('data-filter-type') || 'generic';
  }

  /**
   * 读取控件或其最近祖先上的 data-filter-column 属性。
   * 当 filterId 与实际数据列名不同时，配置 data-filter-column 让 IE 正确绑定列。
   * 若未配置，则回退到 filterId（两者相同的常规情形）。
   */
  function getFilterColumn(el, filterId) {
    var col = el.getAttribute('data-filter-column');
    if (!col) {
      var parent = el.closest('[data-filter-column]');
      if (parent) col = parent.getAttribute('data-filter-column');
    }
    return col || filterId;
  }

  /* ── 按钮组（年 / 月 / 自定义快速切换）─────────────────── */
  function initBtnGroups() {
    var groups = document.querySelectorAll('.filter-btn-group[data-filter-id]');
    [].forEach.call(groups, function (group) {
      var filterId = getFilterId(group);
      var column = getFilterColumn(group, filterId);
      var type = getFilterType(group);
      var multiSelect = group.hasAttribute('data-multi-select');
      var btns = group.querySelectorAll('.filter-btn');

      [].forEach.call(btns, function (btn) {
        if (btn.hasAttribute('data-init-active')) {
          btn.classList.add('active');
        }
        btn.addEventListener('click', function () {
          if (btn.classList.contains('disabled')) return;
          if (multiSelect) {
            btn.classList.toggle('active');
          } else {
            [].forEach.call(btns, function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
          }
          // 收集当前激活值
          var vals = [].filter.call(btns, function (b) { return b.classList.contains('active'); })
                       .map(function (b) { return b.getAttribute('data-value') || b.textContent.trim(); });
          // data-filter-column FIX: 传入 column 确保 IE 用正确列名生成 SQL
          emitChange(filterId, multiSelect ? vals : (vals[0] || null), type, column);
        });
      });
    });
  }

  /* ── 下拉选择 <select> ──────────────────────────────────── */
  function initDropdowns() {
    // BUG-I FIX: 同时支持两种结构：
    //   1. <select data-filter-id="xxx"> — 属性直接在 select 上
    //   2. <div class="filter-dropdown" data-filter-id="xxx"><select>...</select></div>
    //      LLM 生成代码常见模式：外层容器有 data-filter-id，select 本身没有
    var selects = document.querySelectorAll('select.filter-select[data-filter-id], .filter-dropdown select[data-filter-id]');
    [].forEach.call(selects, function (sel) {
      var filterId = getFilterId(sel);
      var column = getFilterColumn(sel, filterId);
      var type = getFilterType(sel);
      sel.addEventListener('change', function () {
        var vals = [].filter.call(sel.options, function (o) { return o.selected; })
                     .map(function (o) { return o.value; });
        emitChange(filterId, sel.multiple ? vals : vals[0], type || 'dropdown', column);
      });
    });

    // 处理外层容器携带 data-filter-id 的情形
    var wrappers = document.querySelectorAll('.filter-dropdown[data-filter-id]:not(select)');
    [].forEach.call(wrappers, function (wrapper) {
      var filterId = getFilterId(wrapper);
      var column = getFilterColumn(wrapper, filterId);
      var type = getFilterType(wrapper);
      [].forEach.call(wrapper.querySelectorAll('select'), function (sel) {
        // 避免重复绑定（若 select 本身已有 data-filter-id 已被上面处理）
        if (getFilterId(sel)) return;
        sel.addEventListener('change', function () {
          var vals = [].filter.call(sel.options, function (o) { return o.selected; })
                       .map(function (o) { return o.value; });
          emitChange(filterId, sel.multiple ? vals : vals[0], type || 'dropdown', column);
        });
      });
    });
  }

  /* ── 复选框组 ────────────────────────────────────────────── */
  function initCheckboxGroups() {
    var groups = document.querySelectorAll('.filter-checkbox-group[data-filter-id]');
    [].forEach.call(groups, function (group) {
      var filterId = getFilterId(group);
      var column = getFilterColumn(group, filterId);
      var inputs = group.querySelectorAll('input[type="checkbox"]');
      function collect() {
        var vals = [].filter.call(inputs, function (i) { return i.checked; })
                     .map(function (i) { return i.value || i.closest('.filter-checkbox-item').textContent.trim(); });
        emitChange(filterId, vals, 'checkbox-group', column);
      }
      [].forEach.call(inputs, function (inp) { inp.addEventListener('change', collect); });
    });
  }

  /* ── 单选按钮组 ─────────────────────────────────────────── */
  function initRadioGroups() {
    var groups = document.querySelectorAll('.filter-radio-group[data-filter-id]');
    [].forEach.call(groups, function (group) {
      var filterId = getFilterId(group);
      var column = getFilterColumn(group, filterId);
      var inputs = group.querySelectorAll('input[type="radio"]');
      [].forEach.call(inputs, function (inp) {
        inp.addEventListener('change', function () {
          if (inp.checked) {
            emitChange(filterId, inp.value, 'radio-group', column);
          }
        });
      });
    });
  }

  /* ── 搜索框（防抖 300ms）───────────────────────────────── */
  function initSearchBoxes() {
    // BUG-INLINE-SEARCH FIX: 同时支持两种写法：
    //   1. .filter-search-box[data-filter-id] 包装容器（标准方式）
    //   2. input[type="search"][data-filter-id] / input[data-filter-type="search"][data-filter-id]
    //      — AI 生成代码常直接把 data-filter-id 写在 input 上，无外层 .filter-search-box 包装
    var boxes = document.querySelectorAll('.filter-search-box[data-filter-id]');
    [].forEach.call(boxes, function (box) {
      var filterId = getFilterId(box);
      // FC-SEARCH-01 FIX: 传入 column 支持 filterId≠column 场景
      var column = getFilterColumn(box, filterId);
      var inp = box.querySelector('.filter-search-input, input[type="text"], input[type="search"]');
      if (!inp) return;
      var timer;
      inp.addEventListener('input', function () {
        clearTimeout(timer);
        var val = inp.value;
        timer = setTimeout(function () { emitChange(filterId, val, 'search', column); }, 300);
      });
    });

    // BUG-INLINE-SEARCH FIX: 处理直接在 input 上写 data-filter-id 的写法
    // 避免与上方已经通过 .filter-search-box 包装处理的 input 重复绑定
    var directInputs = document.querySelectorAll(
      'input[type="search"][data-filter-id]:not(.filter-search-box input),' +
      'input[data-filter-type="search"][data-filter-id]:not(.filter-search-box input)'
    );
    [].forEach.call(directInputs, function (inp) {
      // 如果已在 .filter-search-box 容器内则跳过（上方已处理）
      if (inp.closest('.filter-search-box')) return;
      var filterId = getFilterId(inp);
      var column = getFilterColumn(inp, filterId);
      var timer;
      inp.addEventListener('input', function () {
        clearTimeout(timer);
        var val = inp.value;
        timer = setTimeout(function () { emitChange(filterId, val, 'search', column); }, 300);
      });
    });
  }

  /* ── 数值范围（滑块 + number 输入框）─────────────────────── */
  function initNumericRanges() {
    // FC-NUMERIC-02 FIX: 同时支持两种指定方式：
    //   1. .filter-numeric-range[data-filter-id] — 自定义 UI 滑块（原有）
    //   2. .filter-card[data-filter-type="numeric-range"][data-filter-id] — LLM 常用数字输入框
    var cards = document.querySelectorAll(
      '.filter-numeric-range[data-filter-id], .filter-card[data-filter-type="numeric-range"][data-filter-id]'
    );
    [].forEach.call(cards, function (card) {
      var filterId = getFilterId(card);
      var column = getFilterColumn(card, filterId); // FC-NUMERIC-01 FIX: 支持 column 映射
      var rangeFill = card.querySelector('.range-fill');
      var rangeInputs = card.querySelectorAll('input[type="range"]');
      // 先尝试 range 滑块，再 fallback 到 .filter-range-min/.filter-range-max (number inputs)
      var minInput = card.querySelector('.range-min') || rangeInputs[0]
                  || card.querySelector('.filter-range-min, input[data-role="min"]');
      var maxInput = card.querySelector('.range-max') || rangeInputs[1]
                  || card.querySelector('.filter-range-max, input[data-role="max"]');
      var labels = {
        min: card.querySelector('.range-current-min'),
        max: card.querySelector('.range-current-max')
      };

      function updateFill() {
        if (!rangeFill || !minInput || !maxInput) return;
        var min = parseFloat(minInput.min || 0);
        var max = parseFloat(maxInput.max || 100);
        var lo  = parseFloat(minInput.value);
        var hi  = parseFloat(maxInput.value);
        var leftPct  = ((lo - min) / (max - min) * 100).toFixed(1) + '%';
        var rightPct = (100 - (hi - min) / (max - min) * 100).toFixed(1) + '%';
        rangeFill.style.left  = leftPct;
        rangeFill.style.right = rightPct;
        card.style.setProperty('--range-min', leftPct);
        card.style.setProperty('--range-max', ((hi - min) / (max - min) * 100).toFixed(1) + '%');
      }

      function onChange() {
        updateFill();
        if (labels.min) labels.min.textContent = minInput ? minInput.value : '';
        if (labels.max) labels.max.textContent = maxInput ? maxInput.value : '';
        var lo = minInput ? parseFloat(minInput.value) : null;
        var hi = maxInput ? parseFloat(maxInput.value) : null;
        // 防止交叉
        if (minInput && maxInput && lo > hi) {
          if (this === minInput) { maxInput.value = lo; hi = lo; }
          else { minInput.value = hi; lo = hi; }
          updateFill();
        }
        emitChange(filterId, { min: lo, max: hi }, 'numeric-range', column);
      }

      // BUG-NUMERIC-DBLFIRE FIX: range 滑块和 number 输入框绑定的事件不同：
      //   - range 滑块：同时绑 'input'（拖动时实时反馈）和 'change'（松开时确认），
      //     对于 range 类型，input+change 不会在同一用户操作中重复触发。
      //   - number/text 输入框：仅绑 'change'（用户 blur 或 Enter 后才提交），
      //     若同时绑 'input'，每次按键都触发 emitChange，造成每次输入 ≥2× 重复事件。
      var allInputs = card.querySelectorAll(
        'input[type="range"], .filter-range-min, .filter-range-max, input[data-role="min"], input[data-role="max"]'
      );
      [].forEach.call(allInputs, function (inp) {
        if (inp.type === 'range') {
          // Range 滑块：实时 UI 更新 + 最终值确认
          inp.addEventListener('input', onChange);
          inp.addEventListener('change', onChange);
        } else {
          // Number / text 输入框：仅在 blur/Enter (change) 时触发，避免每键击都请求 DuckDB
          inp.addEventListener('change', onChange);
        }
      });
      updateFill();
    });
  }

  /* ── 日期范围 ─────────────────────────────────────────────── */
  function initDateRanges() {
    var cards = document.querySelectorAll('.filter-card[data-filter-type="date-range"][data-filter-id]');
    [].forEach.call(cards, function (card) {
      var filterId = getFilterId(card);
      var column = getFilterColumn(card, filterId); // FC-DATE-01 FIX
      var startInput = card.querySelector('.filter-date-start, input[data-role="start"]');
      var endInput   = card.querySelector('.filter-date-end,   input[data-role="end"]');
      if (!startInput && !endInput) return;
      function onChange() {
        emitChange(filterId, {
          start: startInput ? startInput.value : null,
          end:   endInput   ? endInput.value   : null
        }, 'date-range', column);
      }
      if (startInput) startInput.addEventListener('change', onChange);
      if (endInput)   endInput.addEventListener('change', onChange);
    });
  }

  /* ── 年月选择器（year-month） ─────────────────────────────────
   * 支持 <input type="month"> 或独立的 year/month 下拉组合：
   *   <div class="filter-card" data-filter-type="year-month" data-filter-id="col">
   *     <input type="month">                <!-- 单控件：value = "2024-03" -->
   *     <!-- 或 -->
   *     <select class="filter-year-select"> ... </select>
   *     <select class="filter-month-select"> ... </select>
   *   </div>
   * 发出的 value 为 "YYYY-MM" 字符串；_buildFilterWhere 对字符串会生成 "col" = 'YYYY-MM'，
   * 若列存储的是 DATE/TIMESTAMP，可在报告 SQL 中使用 STRFTIME 进行转换。
   */
  function initYearMonthPickers() {
    var cards = document.querySelectorAll('.filter-card[data-filter-type="year-month"][data-filter-id]');
    [].forEach.call(cards, function (card) {
      var filterId = getFilterId(card);
      var column = getFilterColumn(card, filterId); // FC-YM-01 FIX
      // 方式一：单个 <input type="month">
      var monthInput = card.querySelector('input[type="month"]');
      if (monthInput) {
        monthInput.addEventListener('change', function () {
          emitChange(filterId, monthInput.value || null, 'year-month', column);
        });
        return;
      }
      // 方式二：独立年份 + 月份 <select>
      var yearSel  = card.querySelector('.filter-year-select,  select[data-role="year"]');
      var monthSel = card.querySelector('.filter-month-select, select[data-role="month"]');
      if (!yearSel && !monthSel) return;
      function onCombinedChange() {
        var y = yearSel  ? yearSel.value  : '';
        var m = monthSel ? monthSel.value : '';
        // 归一为 "YYYY-MM" 或仅年份 "YYYY" 或仅月份 "MM"
        var val = (y && m) ? (y + '-' + m.padStart(2, '0'))
                : (y || (m ? m.padStart(2, '0') : null));
        emitChange(filterId, val || null, 'year-month', column);
      }
      if (yearSel)  yearSel.addEventListener('change',  onCombinedChange);
      if (monthSel) monthSel.addEventListener('change', onCombinedChange);
    });
  }

  /* ── 标签 pills 删除 ────────────────────────────────────── */
  function initTagPills() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-pill .pill-remove');
      if (!btn) return;
      var pill     = btn.closest('.filter-pill');
      var pillBar  = btn.closest('.filter-tag-pills');
      var filterId = pillBar ? getFilterId(pillBar) : null;
      var value    = pill ? (pill.getAttribute('data-value') || pill.textContent.trim().replace('×', '').trim()) : null;
      if (pill) pill.remove();
      if (filterId) {
        var remaining = [].map.call(
          pillBar.querySelectorAll('.filter-pill'),
          function (p) { return p.getAttribute('data-value') || p.textContent.trim().replace('×', '').trim(); }
        );
        emitChange(filterId, remaining, 'tag-pills');
      }
    });
  }

  /* ── 重置按钮 ────────────────────────────────────────────── */
  function initResetButtons() {
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-reset-button');
      if (!btn) return;
      var scope = btn.getAttribute('data-reset-scope');
      var container = scope
        ? document.querySelector('[data-filter-id="' + scope + '"]') || btn.closest('.filter-global-panel')
        : btn.closest('.filter-global-panel, .filter-card');

      if (container) {
        // 清空所有 input
        [].forEach.call(container.querySelectorAll('input, select'), function (el) {
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
          else el.value = '';
        });
        // 清空 btn active
        [].forEach.call(container.querySelectorAll('.filter-btn.active'), function (b) { b.classList.remove('active'); });
        // 清空 pills
        [].forEach.call(container.querySelectorAll('.filter-pill'), function (p) { p.remove(); });
        // 清空全局状态（__FILTER_STATE__ 现按 column 为 key 存储扁平格式）
        if (scope) {
          // scope 是 filterId，需解析对应的 column 名
          var scopeEl = document.querySelector('[data-filter-id="' + scope + '"]');
          var scopeCol = scopeEl ? getFilterColumn(scopeEl, scope) : scope;
          delete global.__FILTER_STATE__[scopeCol];
          // 兼容：同时删除 filterId 为 key 的旧残留（防止页面 HTML 有历史遗留）
          if (scopeCol !== scope) delete global.__FILTER_STATE__[scope];
        } else {
          [].forEach.call(container.querySelectorAll('[data-filter-id]'), function (el) {
            var elCol = getFilterColumn(el, getFilterId(el));
            delete global.__FILTER_STATE__[elCol];
            // 兼容：同时删除 filterId 为 key 的旧残留
            var elFid = getFilterId(el);
            if (elCol !== elFid) delete global.__FILTER_STATE__[elFid];
          });
        }
      } else {
        // BUG-05 FIX：无 container（如全局重置按钮位于所有筛选面板之外），全量清除 __FILTER_STATE__
        Object.keys(global.__FILTER_STATE__).forEach(function (k) { delete global.__FILTER_STATE__[k]; });
        // 同时清空页面所有 input/select 控件和激活样式
        [].forEach.call(document.querySelectorAll('.filter-global-panel input, .filter-card input, .filter-global-panel select, .filter-card select'), function (el) {
          if (el.type === 'checkbox' || el.type === 'radio') el.checked = false;
          else el.value = '';
        });
        [].forEach.call(document.querySelectorAll('.filter-btn.active'), function (b) { b.classList.remove('active'); });
        [].forEach.call(document.querySelectorAll('.filter-pill'), function (p) { p.remove(); });
      }
      // 广播重置事件
      var resetEvt;
      try {
        resetEvt = new CustomEvent('filterReset', {
          detail: { scope: scope, state: global.__FILTER_STATE__ }
        });
      } catch (_e) {
        resetEvt = document.createEvent('CustomEvent');
        resetEvt.initCustomEvent('filterReset', true, true, { scope: scope });
      }
      global.__REPORT_EVENT_BUS__.dispatchEvent(resetEvt);
      // 同时通过 document 派发：兼容 InteractivityEngine 新版 document.addEventListener('filterReset')
      try {
        document.dispatchEvent(new CustomEvent('filterReset', {
          bubbles: false,
          detail: { scope: scope, state: global.__FILTER_STATE__ }
        }));
      } catch (e5) { /* */ }
    });
  }

  /* ── 应用按钮（触发全量状态发布）──────────────────────────── */
  function initApplyButtons() {
    document.addEventListener('click', function (e) {
      // BUG-NEW-5 FIX: 同时兼容 .filter-apply-btn 和 .filter-apply-button 两种命名
      // 旧版 AI 生成代码常用 .filter-apply-btn；新版规范用 .filter-apply-button
      var btn = e.target.closest('.filter-apply-btn, .filter-apply-button');
      if (!btn) return;
      var detail = { state: global.__FILTER_STATE__ };
      var applyEvt;
      try {
        applyEvt = new CustomEvent('filterApply', { detail: detail });
      } catch (_e) {
        applyEvt = document.createEvent('CustomEvent');
        applyEvt.initCustomEvent('filterApply', true, true, detail);
      }
      // 通过 __REPORT_EVENT_BUS__ （向后兼容）
      try {
        global.__REPORT_EVENT_BUS__.dispatchEvent(applyEvt);
      } catch (e2) { /* */ }
      // 通过 document（InteractivityEngine 直接监听 document 上的 filterApply）
      try {
        document.dispatchEvent(new CustomEvent('filterApply', { bubbles: false, detail: detail }));
      } catch (e3) { /* */ }
    });
  }

  /* ── 入口：DOMContentLoaded 后初始化所有控件 ───────────────── */
  function initAll() {
    var btnGroups = document.querySelectorAll('.filter-btn-group[data-filter-id]');
    var checkboxGroups = document.querySelectorAll('.filter-checkbox-group[data-filter-id]');
    var radioGroups = document.querySelectorAll('.filter-radio-group[data-filter-id]');
    var dropdowns = document.querySelectorAll('select.filter-select[data-filter-id], .filter-dropdown select[data-filter-id]');
    console.log('[FC] initAll: btn-groups=%d checkbox-groups=%d radio-groups=%d dropdowns=%d',
      btnGroups.length, checkboxGroups.length, radioGroups.length, dropdowns.length);
    initBtnGroups();
    initDropdowns();
    initCheckboxGroups();
    initRadioGroups();
    initSearchBoxes();
    initNumericRanges();
    initDateRanges();
    initYearMonthPickers(); // BUG-NEW-3 FIX: year-month 筛选器初始化
    initTagPills();
    initResetButtons();
    initApplyButtons();
    initZoneFilter();   // Tech-11: zone-filter data-filter-field handler
    initFilterPanelCollapse(); // Auto collapse/expand for filter-global-panel
    console.log('[FC] filter-controls.js fully initialized. __FILTER_STATE__:', global.__FILTER_STATE__);
  }

  /* ── Tech-11: zone-filter 区域的 data-filter-field 控件 ─────────── */
  /* 处理 .zone-filter 容器内使用 data-filter-field 的 <select> 元素，
   * .filter-zone-reset / [data-action=filter-reset] 重置按钮 */
  function initZoneFilter() {
    // Delegate change on selects inside .zone-filter
    document.addEventListener('change', function (e) {
      var el = e.target;
      if (!el) return;
      var field = el.getAttribute('data-filter-field');
      if (!field) return;
      var zone = el.closest('.zone-filter');
      if (!zone) return;
      var groupId = zone.getAttribute('data-filter-group') || 'default';
      emitChange(field, el.value, 'zone-select', field);
    });

    // Delegate click for reset buttons inside .zone-filter
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-action="filter-reset"], .filter-zone-reset');
      if (!btn) return;
      var zone = btn.closest('.zone-filter');
      if (!zone) return;
      var scope = zone.getAttribute('data-filter-group') || 'default';
      // Reset all select elements in this zone-filter
      [].forEach.call(zone.querySelectorAll('[data-filter-field]'), function (ctrl) {
        var field = ctrl.getAttribute('data-filter-field');
        if (ctrl.tagName === 'SELECT') {
          ctrl.value = ctrl.options[0] ? ctrl.options[0].value : '';
          emitChange(field, ctrl.value, 'zone-select', field);
        } else if (ctrl.type === 'text' || ctrl.type === 'search') {
          ctrl.value = '';
          emitChange(field, '', 'zone-input', field);
        }
      });
      // Fire a reset event on the bus too
      var resetEvt;
      try {
        resetEvt = new CustomEvent('filterReset', { detail: { scope: scope }, bubbles: true });
      } catch (_e) {
        resetEvt = document.createEvent('CustomEvent');
        resetEvt.initCustomEvent('filterReset', true, true, { scope: scope });
      }
      global.__REPORT_EVENT_BUS__.dispatchEvent(resetEvt);
      // 通过 document 同步派发（兼容 IE 新版监听路径）
      try {
        document.dispatchEvent(new CustomEvent('filterReset', { bubbles: false, detail: { scope: scope } }));
      } catch (e6) { /* */ }
    });
  }

  /* ── 筛选面板自动折叠/展开 ─────────────────────────────────── */
  /**
   * initFilterPanelCollapse — 当 .filter-global-panel 内的 .filter-group 数量
   * 超过阈值时，自动收折多余的筛选项并插入"展开/收起"按钮。
   *
   * 触发条件：
   *   1. 面板上有 data-collapsible="true"，或
   *   2. 面板内 .filter-group 数量 >= data-collapse-threshold（默认 5）
   *
   * 始终可见的行数通过 data-visible-rows（默认 1 行，即 3 个 span-4 的 item）控制。
   * 实现上以"组下标"而非像素行来控制，简单计数前 N 个组为始终可见。
   */
  function initFilterPanelCollapse() {
    var panels = document.querySelectorAll('.filter-global-panel');
    [].forEach.call(panels, function (panel) {
      var groups = panel.querySelectorAll('.filter-group:not(.filter-group-actions)');
      var total = groups.length;
      // Determine threshold
      var threshold = parseInt(panel.getAttribute('data-collapse-threshold') || '5', 10);
      var explicit = panel.getAttribute('data-collapsible') === 'true';
      if (!explicit && total < threshold) return; // not enough items — skip

      // Determine how many items are "always visible" (visible rows * 3 items per row)
      var visibleRows = parseInt(panel.getAttribute('data-visible-rows') || '1', 10);
      var itemsPerRow = 3; // default: span-4 in 12-col = 3 per row
      var alwaysVisible = Math.max(visibleRows * itemsPerRow, 3);

      // Mark items beyond alwaysVisible as collapsible
      var hasCollapsible = false;
      [].forEach.call(groups, function (g, i) {
        if (i >= alwaysVisible) {
          g.setAttribute('data-filter-collapsible', 'true');
          hasCollapsible = true;
        }
      });
      if (!hasCollapsible) return;

      // Start collapsed
      panel.classList.add('filter-collapsed');

      // Build toggle row and button
      var toggleRow = document.createElement('div');
      toggleRow.className = 'filter-toggle-row';

      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'filter-toggle-btn';
      btn.innerHTML = '<span class="toggle-arrow">&#9650;</span> <span class="toggle-label">展开更多筛选</span>';

      btn.addEventListener('click', function () {
        var collapsed = panel.classList.toggle('filter-collapsed');
        btn.querySelector('.toggle-label').textContent = collapsed ? '展开更多筛选' : '收起筛选';
      });

      toggleRow.appendChild(btn);

      // Insert toggle row before the actions row, or append to panel
      var actionsRow = panel.querySelector('.filter-group-actions');
      if (actionsRow) {
        panel.insertBefore(toggleRow, actionsRow);
      } else {
        panel.appendChild(toggleRow);
      }
    });
  }

  console.log('[FC] filter-controls.js loaded, readyState=' + document.readyState);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }

})(window);

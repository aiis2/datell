/**
 * InteractivityEngine v1.0 — 报表联动事件引擎
 *
 * 功能：
 *  - 解析 data-interactions 属性，绑定图表联动规则
 *  - 收取 E 类筛选控件 filterChange 事件，同步全局筛选状态
 *  - 支持 filter / drill_down / drill_up / highlight / reset 五种动作
 *  - 可选 DuckDB WASM：当报表内嵌 __report_data_context__ 时自动初始化
 *  - 暴露 window.__REPORT_EVENT_BUS__ 到已有桥接点位无缝接管
 *
 * 依赖：echarts（通过 parent 窗口继承）、可选 DuckDB WASM
 * 文件：public/vendor/interactivity-engine.js
 */
(function (global) {
  'use strict';

  // ──────────────────────────────────────────────────────────────
  // 全局状态
  // ──────────────────────────────────────────────────────────────
  var _state = {
    filters: {},          // { columnName: value }
    filterTypes: {},      // { columnName: filterWidgetType } — 'search'|'dropdown'|'checkbox-group' 等
    filterIdToColumn: {}, // { filterId: columnName } — filterId≠column 时的反向映射（用于 filterReset）
    customFilters: {},    // { key: whereClause } — filterTemplate 生成的 WHERE 片段
    drillPaths: {},       // { cardId: { levels, currentLevel, breadcrumb } }
    chartInstances: {},   // { cardId: EChartsInstance }
    apexInstances: {},    // { cardId: ApexChartsInstance }
    filterControls: {},   // { filterId: { element, type } }
    db: null,             // { db, conn } DuckDB WASM 实例（可选）
    tables: {},           // 报表内嵌表数据 { tableName: { columns, data } }
    interactions: {},     // 已解析的联动规则 { cardId: InteractionRule[] }
    initialized: false,
  };

  // ──────────────────────────────────────────────────────────────
  // 初始化入口
  // ──────────────────────────────────────────────────────────────
  async function init() {
    if (_state.initialized) return;
    _state.initialized = true;
    console.log('[IE] interactivity-engine init start');

    // 1. 加载 DataContext
    var ctxEl = document.getElementById('__report_data_context__');
    if (ctxEl) {
      try {
        var ctx = JSON.parse(ctxEl.textContent || ctxEl.innerText || '{}');
        _state.tables = ctx.tables || {};
        // 深拷贝 drillPaths，防止破坏原始数据
        var dp = ctx.drillPaths || {};
        Object.keys(dp).forEach(function (k) {
          _state.drillPaths[k] = Object.assign({ levels: [], currentLevel: 0, breadcrumb: [] }, dp[k]);
        });
      } catch (e) {
        console.warn('[IE] Failed to parse __report_data_context__:', e);
      }
    }

    // 2. 扫描 data-interactions 属性
    document.querySelectorAll('[data-card-id][data-interactions]').forEach(function (el) {
      var cardId = el.getAttribute('data-card-id');
      try {
        _state.interactions[cardId] = JSON.parse(el.getAttribute('data-interactions'));
      } catch (e) {
        console.warn('[IE] Bad data-interactions on', cardId, e);
      }
    });

    // 3. 条件加载 DuckDB WASM
    var hasTables = Object.keys(_state.tables).length > 0;
    // FIL-04 FIX: 任一条件满足即加载 DuckDB（原 AND 过严，AI 漏写 data-interactions 时 DuckDB 不启动）
    var hasDataSql      = document.querySelectorAll('[data-sql]').length > 0;
    var hasInteractions = document.querySelectorAll('[data-interactions]').length > 0;
    if (hasTables && (hasDataSql || hasInteractions)) {
      await _tryInitDuckDB();
    }

    // 4. 监听 E 类筛选控件事件
    _listenFilterControls();

    // 5. 设置卡片观察器（等待 ECharts 实例注册）
    _observeChartCards();

    // 6. 注册已存在的图表实例（BRIDGE_SCRIPT 在本引擎加载前已 monkey-patch echarts.init，
    //    图表可能已创建并存入 __ecInstances / __apexInstances，但尚未注册到本引擎）
    _registerExistingChartInstances();

    console.log('[IE] InteractivityEngine ready. filters:', _state.filters,
      'tables:', Object.keys(_state.tables), 'duckdb:', !!_state.db,
      'echartsRegistered:', Object.keys(_state.chartInstances),
      'apexRegistered:', Object.keys(_state.apexInstances));
  }

  // ──────────────────────────────────────────────────────────────
  // DuckDB WASM 初始化（可选，按需加载）
  // ──────────────────────────────────────────────────────────────
  async function _tryInitDuckDB() {
    // DuckDB 文件需存在于 app://localhost/vendor/duckdb/
    var baseUrl = (typeof window !== 'undefined' && window.location)
      ? (window.location.origin || 'app://localhost')
      : 'app://localhost';

    // 检测 DuckDB 是否已加载（父框架或当前框架）
    var DuckDB = global.DuckDB ||
      (global.parent && global.parent.DuckDB) ||
      null;

    if (!DuckDB) {
      // 尝试动态加载
      try {
        await _loadScript(baseUrl + '/vendor/duckdb/duckdb.js');
        DuckDB = global.DuckDB;
      } catch (e) {
        console.info('[IE] DuckDB not available, running without SQL interactivity:', e.message);
        return;
      }
    }

    try {
      var bundles = {
        mvp: {
          mainModule: baseUrl + '/vendor/duckdb/duckdb-mvp.wasm',
          mainWorker: baseUrl + '/vendor/duckdb/duckdb-browser-mvp.worker.js',
        },
        eh: {
          mainModule: baseUrl + '/vendor/duckdb/duckdb-eh.wasm',
          mainWorker: baseUrl + '/vendor/duckdb/duckdb-browser-eh.worker.js',
        },
      };
      var selectedBundle = DuckDB.selectBundle ? DuckDB.selectBundle(bundles) : bundles.mvp;
      var db = await DuckDB.instantiate(selectedBundle);
      var conn = await db.connect();
      _state.db = { db: db, conn: conn };

      // 将内嵌表数据注入到 DuckDB
      for (var tableName in _state.tables) {
        if (!Object.prototype.hasOwnProperty.call(_state.tables, tableName)) continue;
        var tableData = _state.tables[tableName];
        await _createDuckDBTable(conn, tableName, tableData);
      }
      console.log('[IE] DuckDB ready. Tables:', Object.keys(_state.tables));
    } catch (e) {
      console.warn('[IE] DuckDB init failed:', e);
      _state.db = null;
    }
  }

  async function _createDuckDBTable(conn, tableName, tableData) {
    var columns = tableData.columns || [];
    var data = tableData.data || [];
    if (columns.length === 0 || data.length === 0) return;

    var safeTable = '"' + _escapeIdent(tableName) + '"';
    await conn.query('DROP TABLE IF EXISTS ' + safeTable);

    // P2-C: 使用 db.registerFileText + read_csv_auto 替代 INSERT 拼接，
    // 避免含特殊字符（换行/引号/逗号）的数据导致 SQL 解析错误。
    var db = _state.db && _state.db.db;
    if (db && db.registerFileText) {
      var csvLines = [columns.map(_csvEscape).join(',')];
      data.forEach(function (row) {
        csvLines.push(row.map(_csvEscape).join(','));
      });
      var csvText = csvLines.join('\n');
      var fileName = tableName.replace(/[^a-zA-Z0-9_]/g, '_') + '_data.csv';
      await db.registerFileText(fileName, csvText);
      await conn.query(
        'CREATE TABLE ' + safeTable + ' AS SELECT * FROM read_csv_auto(\'' +
        fileName.replace(/'/g, "''") + '\', ALL_VARCHAR=FALSE)'
      );
      return;
    }

    // 降级：构建 CREATE TABLE + 批量 INSERT（保留兼容性）
    // IDENT-01: 列名使用 _escapeIdent 而非 _escapeSql
    var colDefs = columns.map(function (c, i) {
      var sample = data[0] && data[0][i];
      var t = typeof sample;
      if (t === 'number') return '"' + _escapeIdent(c) + '" DOUBLE';
      return '"' + _escapeIdent(c) + '" VARCHAR';
    }).join(', ');
    await conn.query('CREATE TABLE ' + safeTable + ' (' + colDefs + ')');

    var batchSize = 100;
    for (var i = 0; i < data.length; i += batchSize) {
      var batch = data.slice(i, i + batchSize);
      var rows = batch.map(function (row) {
        var vals = row.map(function (v, j) {
          var sample = data[0] && data[0][j];
          if (typeof sample === 'number') return (v === null || v === undefined) ? 'NULL' : +v;
          return v === null || v === undefined ? 'NULL' : ("'" + _escapeSql(String(v)) + "'");
        });
        return '(' + vals.join(', ') + ')';
      }).join(', ');
      await conn.query('INSERT INTO ' + safeTable + ' VALUES ' + rows);
    }
  }

  /**
   * CSV 转义：处理含逗号、换行符、双引号的字段
   */
  function _csvEscape(val) {
    if (val === null || val === undefined) return '';
    var s = String(val);
    if (s.includes(',') || s.includes('\n') || s.includes('\r') || s.includes('"')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  // ──────────────────────────────────────────────────────────────
  // 图表实例注册（ECharts）
  // ──────────────────────────────────────────────────────────────
  function registerChart(cardId, chartInstance) {
    _state.chartInstances[cardId] = chartInstance;

    var rules = _state.interactions[cardId];
    if (!rules || !rules.length) return;

    // 绑定 click
    chartInstance.on('click', function (params) {
      _handleChartEvent(cardId, 'click', params);
    });

    // 绑定 datazoom
    chartInstance.on('datazoom', function (params) {
      _handleChartEvent(cardId, 'datazoom', params);
    });

    // 绑定 mouseover（highlight 用）
    chartInstance.on('mouseover', function (params) {
      _handleChartEvent(cardId, 'mouseover', params);
    });
  }

  // ──────────────────────────────────────────────────────────────
  // 图表实例注册（ApexCharts）
  // ──────────────────────────────────────────────────────────────
  /**
   * 注册 ApexCharts 实例到联动引擎
   * 约定：AI 生成 ApexCharts 报表时，chart.render().then() 中必须调用此函数
   * 若该 cardId 存在 click 联动规则，引擎自动注入 dataPointSelection 事件回调，
   * 无需 AI 手动写 events.dataPointSelection —— BUG-03 修复
   */
  function registerApexChart(cardId, apexInstance) {
    _state.apexInstances[cardId] = apexInstance;
    console.log('[IE] ApexCharts instance registered:', cardId);
    // 自动绑定 click 联动事件（若该卡片有对应规则）
    var rules = _state.interactions[cardId] || [];
    var hasClick = rules.some(function (r) { return r.trigger === 'click' || r.trigger === 'select'; });
    if (hasClick && apexInstance && typeof apexInstance.updateOptions === 'function') {
      try {
        apexInstance.updateOptions({
          chart: {
            events: {
              dataPointSelection: function (event, chartCtx, config) {
                try {
                  var seriesIdx = config.seriesIndex;
                  var dataIdx = config.dataPointIndex;
                  var series = (chartCtx.w.config.series[seriesIdx] || {});
                  var seriesName = series.name;
                  var categories = (chartCtx.w.config.xaxis || {}).categories || [];
                  var catLabel = categories[dataIdx];
                  var dataArr = series.data || [];
                  var dataVal = dataArr[dataIdx];
                  // data 元素可能是对象 {x, y}
                  if (dataVal !== null && typeof dataVal === 'object') {
                    dataVal = dataVal.y !== undefined ? dataVal.y : dataVal.x;
                  }
                  _handleChartEvent(cardId, 'click', {
                    name: catLabel !== undefined ? catLabel : seriesName,
                    value: dataVal,
                    seriesName: seriesName,
                    dataIndex: dataIdx,
                    seriesIndex: seriesIdx,
                  });
                } catch (inner) { console.warn('[IE] ApexCharts dataPointSelection handler error:', inner); }
              }
            }
          }
        }, false, false);
      } catch (e) { console.warn('[IE] ApexCharts auto event binding failed:', e); }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 监听 E 类筛选控件（filter-controls.js 发来的 filterChange 事件）
  // ──────────────────────────────────────────────────────────────
  // BUG-A FIX: 用 flag 防止因 init() 被多次调用（或未来兼容性改动）而重复注册监听器
  var _filterListenerAttached = false;
  // CONCUR-01: 并发刷新标记 — 防止快速连续筛选时多个 _refreshAllBoundCards 同时查询 DuckDB
  var _refreshInProgress = false;
  var _refreshPending = false;

  var _initScanDone = false; // 独立于 _filterListenerAttached 的扫描标记

  function _listenFilterControls() {
    // EAGER-FILTER-FIX: filterChange/filterApply 监听器已由 _eagerListenFilters() 在脚本加载时同步注册。
    // _listenFilterControls() 只需执行 DOM 扫描（_scanInitialActiveFilters），跳过重复的 addEventListener。
    if (_initScanDone) return;
    _initScanDone = true;

    // BUG-INIT-ACTIVE FIX: 扫描 DOM 中已有 active 状态的按钮组，补充填充 _state.filters
    // 按钮组支持 data-init-active 属性来预设激活状态（仅添加 CSS），但 filter-controls.js
    // 未在初始化时调用 emitChange，导致 IE 的 _state.filters 为空，DuckDB 查询忽略预设筛选。
    // 此处在 IE 自身初始化时扫描 DOM，直接写入 _state.filters 作为兜底。
    (function _scanInitialActiveFilters() {
      document.querySelectorAll('.filter-btn-group[data-filter-id]').forEach(function(group) {
        var filterId = group.getAttribute('data-filter-id');
        var column = group.getAttribute('data-filter-column') || filterId;
        if (!column) return;
        var multiSelect = group.hasAttribute('data-multi-select');
        var activeBtns = group.querySelectorAll('.filter-btn.active:not(.disabled)');
        if (activeBtns.length === 0) return;
        var vals = Array.prototype.map.call(activeBtns, function(b) {
          return b.getAttribute('data-value') || b.textContent.trim();
        });
        var val = multiSelect ? vals : vals[0];
        if (!_isEmptyValue(val)) {
          _state.filters[column] = val;
          var widgetType = group.getAttribute('data-filter-type') || 'btn-group';
          _state.filterTypes[column] = widgetType;
          if (filterId !== column) _state.filterIdToColumn[filterId] = column;
          console.log('[IE] BUG-INIT-ACTIVE: initial active filter set — col=%s val=%o', column, val);
        }
      });
      // 同步到 __FILTER_STATE__
      if (Object.keys(_state.filters).length > 0) {
        try { global.__FILTER_STATE__ = Object.assign({}, _state.filters); } catch(e) { /* */ }
      }
    })();

    // EAGER-FILTER-FIX: filterChange / filterApply 监听器已由 _eagerListenFilters() 在脚本
    // 加载时同步注册（早于所有 DOMContentLoaded 回调），无需在此重复注册。
    // _filterListenerAttached 标志仅保留以供其他逻辑判断是否已初始化。
    _filterListenerAttached = true;
  }

  // ──────────────────────────────────────────────────────────────
  // 事件处理中枢
  // ──────────────────────────────────────────────────────────────
  async function _handleChartEvent(sourceCardId, eventType, params) {
    var rules = (_state.interactions[sourceCardId] || []).filter(function (r) {
      return r.trigger === eventType;
    });

    for (var i = 0; i < rules.length; i++) {
      var rule = rules[i];
      var payload = _resolvePayload(rule.payloadMapping, params);

      switch (rule.action) {
        case 'filter':
          await _applyFilter(rule, payload);
          break;
        case 'drill_down':
          await _applyDrillDown(sourceCardId, rule, payload);
          break;
        case 'drill_up':
          await _applyDrillUp(sourceCardId, rule);
          break;
        case 'highlight':
          _applyHighlight(rule, payload);
          break;
        case 'reset':
          await _resetFilters(rule.targetCardIds);
          break;
        default:
          console.warn('[IE] Unknown action:', rule.action);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Filter 联动
  // ──────────────────────────────────────────────────────────────
  async function _applyFilter(rule, payload) {
    // 支持 filterTemplate（SQL WHERE 片段模板，如 "date BETWEEN '{startDate}' AND '{endDate}'"）
    if (rule.filterTemplate) {
      var whereClause = rule.filterTemplate.replace(/\{(\w+)\}/g, function (_, k) {
        return _escapeSql(String(payload[k] != null ? payload[k] : ''));
      });
      _state.customFilters = _state.customFilters || {};
      // BUG-G2 FIX: customFilter 以列名为 key（若有 rule.column），便于 _clearFilter 按列清除
      var cfKey = rule.column || rule.filterTemplate;
      _state.customFilters[cfKey] = whereClause;
    } else if (rule.column) {
      // BUG-7b FIX: AI 常写 { action:"filter", column:"city", trigger:"click" }，
      // 此时 payloadMapping 缺失，payload 里是自动提取的 {name,value,...}
      // 应把 payload 中最有意义的值写到 rule.column 对应的列
      var filterVal = payload[rule.column] !== undefined
        ? payload[rule.column]                   // 恰好用了列名作为 key
        : (payload.name !== undefined ? payload.name : payload.value);  // 最常见：name=类目维度
      if (!_isEmptyValue(filterVal)) {
        _state.filters[rule.column] = filterVal;
      }
    } else {
      // 写入全局 filter 状态（等值匹配）
      Object.keys(payload).forEach(function (key) {
        _state.filters[key] = payload[key];
      });
    }
    try { global.__FILTER_STATE__ = Object.assign({}, _state.filters); } catch (e) { /* */ }

    // LINK-FIX-2: 向 document 派发带 ieRefresh 标志的 filterChange，通知 AI 代码的客户端筛选逻辑
    // 场景：联动点击（chart click → _applyFilter）触发筛选，但 AI 代码的 filterChange 监听器
    // 没有被原始事件触发（联动不走 filter-controls.js 通道）。通过此重派发，AI 代码获知最新
    // _state.filters 状态并可用 window.__FILTER_STATE__ 进行客户端更新。
    // ieRefresh:true 标志防止 IE 自身的 filterChange 处理器再次处理（无限循环）。
    try {
      document.dispatchEvent(new CustomEvent('filterChange', {
        bubbles: false,
        detail: {
          ieRefresh: true,
          filterId: rule && rule.column || '_linkage_',
          column: rule && rule.column || null,
          value: rule && rule.column ? (_state.filters[rule.column] || null) : null,
          type: 'linkage',
          state: global.__FILTER_STATE__
        }
      }));
    } catch (_) {}

    // 刷新目标卡片（若无明确 targetCardIds，则刷新全部）
    var targets = rule.targetCardIds || [];
    if (targets.length > 0) {
      for (var i = 0; i < targets.length; i++) {
        await _refreshCard(targets[i]);
      }
    } else {
      await _refreshAllBoundCards();
    }
    _updateFilterTagsUI();
  }

  // ──────────────────────────────────────────────────────────────
  // Drill Down 联动
  // ──────────────────────────────────────────────────────────────
  async function _applyDrillDown(sourceCardId, rule, payload) {
    var drillPath = _state.drillPaths[sourceCardId];
    if (!drillPath) {
      // 初始化 drillPath
      drillPath = { levels: rule.drillDimension ? [rule.drillDimension] : [], currentLevel: 0, breadcrumb: [] };
      _state.drillPaths[sourceCardId] = drillPath;
    }

    var maxLevel = Math.max(0, drillPath.levels.length - 1);
    if (drillPath.currentLevel >= maxLevel && maxLevel > 0) return; // 已到最底层

    drillPath.currentLevel = Math.min(drillPath.currentLevel + 1, maxLevel > 0 ? maxLevel : 1);
    var breadLabel = Object.values(payload)[0] || '详情';
    drillPath.breadcrumb.push({ label: breadLabel, payload: payload });

    var targets = rule.targetCardIds || [];
    for (var i = 0; i < targets.length; i++) {
      var targetId = targets[i];
      if (_state.db && rule.drillSql) {
        var allParams = Object.assign({}, payload, { __where: _buildFilterWhere() });
        var sql = _interpolateSql(rule.drillSql, allParams);
        try {
          var result = await _state.db.conn.query(sql);
          _updateChartFromArrow(targetId, result, rule);
        } catch (e) {
          console.warn('[IE] Drill SQL error:', e, sql);
        }
      } else {
        // 无 DuckDB：仅传递 payload 触发重绑
        _emitCardUpdate(targetId, payload);
      }
    }

    _updateDrillBreadcrumb(sourceCardId, drillPath);
    _addDrillUpButton(sourceCardId);
  }

  // ──────────────────────────────────────────────────────────────
  // Drill Up 联动
  // ──────────────────────────────────────────────────────────────
  async function _applyDrillUp(sourceCardId, rule) {
    var drillPath = _state.drillPaths[sourceCardId];
    if (!drillPath || drillPath.currentLevel <= 0) return;

    drillPath.breadcrumb.pop();
    drillPath.currentLevel = Math.max(0, drillPath.currentLevel - 1);

    _updateDrillBreadcrumb(sourceCardId, drillPath);
    _updateFilterTagsUI();

    // 刷新目标卡片（恢复原始数据）
    var targets = rule.targetCardIds || [];
    for (var i = 0; i < targets.length; i++) {
      await _refreshCard(targets[i]);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Highlight 联动
  // ──────────────────────────────────────────────────────────────
  function _applyHighlight(rule, payload) {
    var name = Object.values(payload)[0];
    var targets = rule.targetCardIds || [];
    targets.forEach(function (targetId) {
      // ECharts 高亮
      var inst = _state.chartInstances[targetId];
      if (inst) {
        inst.dispatchAction({ type: 'highlight', name: name });
        setTimeout(function () {
          try { inst.dispatchAction({ type: 'downplay' }); } catch (e) { /* */ }
        }, 2000);
      }
      // ApexCharts 高亮（通过 states 更新模拟）
      var apexInst = _state.apexInstances && _state.apexInstances[targetId];
      if (apexInst) {
        try {
          apexInst.updateOptions({
            states: { active: { filter: { type: 'darken', value: 0.7 } } }
          }, false, false);
          setTimeout(function () {
            try {
              apexInst.updateOptions({
                states: { active: { filter: { type: 'none' } } }
              }, false, false);
            } catch (e) { /* */ }
          }, 2000);
        } catch (e) {
          console.warn('[IE] ApexCharts highlight error for', targetId, ':', e);
        }
      }
    });
  }

  // ──────────────────────────────────────────────────────────────
  // Reset 联动
  // ──────────────────────────────────────────────────────────────
  /**
   * 重置筛选状态并刷新卡片
   * @param {string[]|null} scopeColumns — BUG-B FIX:
   *   原语义是 targetCardIds，但 FIL-03 修复后传入的是 [scopeColumnName]（筛选列名数组）。
   *   现在统一改为 "受影响列名数组"：
   *   - null / undefined → 全量重置所有列、刷新所有卡片
   *   - ['city']        → 仅删除 _state.filters['city'] + customFilters 中含该列的条目，刷新所有卡片
   *   注意：刷新目标始终是"所有已注册卡片"，因为一列筛选可能影响多张卡片。
   */
  async function _resetFilters(scopeColumns) {
    if (!scopeColumns || !scopeColumns.length) {
      // 全量重置
      _state.filters = {};
      _state.filterTypes = {};
      _state.filterIdToColumn = {};
      _state.customFilters = {};
      try { global.__FILTER_STATE__ = {}; } catch (e) { /* */ }
    } else {
      // BUG-B FIX: 按列名精确重置，不要把列名当 cardId 去 _refreshCard
      // BUG-RESET-COL FIX: scope 可能是 filterId，需要通过 filterIdToColumn 映射到真实列名
      scopeColumns.forEach(function (scope) {
        var col = (_state.filterIdToColumn && _state.filterIdToColumn[scope]) || scope;
        delete _state.filters[col];
        delete _state.filterTypes[col];
        // 同时清除 customFilters 中以该列名为 key 的条目
        if (_state.customFilters) {
          delete _state.customFilters[col];
        }
        // BUG-SCOPED-RESET-MAP-LEAK FIX: 清除 filterIdToColumn 中以 scope(filterId) 为 key 的条目。
        // _clearFilter 已有此逻辑，但 _resetFilters 的 scoped 路径漏掉了，导致精确重置后
        // filterIdToColumn 仍残留旧映射。全量重置路径（filterIdToColumn={}）不受此影响。
        if (_state.filterIdToColumn && _state.filterIdToColumn[scope]) {
          delete _state.filterIdToColumn[scope];
        }
        // 若 scope 本身也作为 key 存在（filterId == column 的常规情形），一并清除
        if (col !== scope) {
          delete _state.filters[scope];
          delete _state.filterTypes[scope];
          if (_state.customFilters) delete _state.customFilters[scope];
        }
      });
      try { global.__FILTER_STATE__ = Object.assign({}, _state.filters); } catch (e) { /* */ }
    }

    _updateFilterTagsUI();

    // 刷新所有已注册卡片（含 vtable）
    await _refreshAllBoundCards();
  }

  // ──────────────────────────────────────────────────────────────
  // 卡片数据刷新（执行 data-sql，重绑 ECharts）
  // ──────────────────────────────────────────────────────────────
  async function _refreshCard(cardId) {
    // BUG-D FIX: 同时支持 id 和 data-card-id 两种关联方式
    var chartEl = document.getElementById(cardId) ||
      document.querySelector('[data-card-id="' + cardId + '"]');
    if (!chartEl) return;

    var sql = chartEl.getAttribute('data-sql');
    if (!sql) return;

    var whereClause = _buildFilterWhere();
    // SEQ-01 FIX: 使用正则全局替换（原 string.replace 只替换第一个出现位置，含子查询时后续 {{WHERE}} 残留）
    // BUG-SQL-REPLACE FIX: 使用函数式替换而非字符串拼接，避免 whereClause 中含 $& $1 $' $` 等
    // JS 特殊替换序列时产生错误 SQL（如用户搜索 "the $1 item" 会导致 $1 被替换为空串）
    var fullSql = whereClause
      ? sql.replace(/\{\{WHERE\}\}/g, function() { return 'WHERE ' + whereClause; })
      : sql.replace(/\{\{WHERE\}\}/g, '');

    if (_state.db) {
      try {
        var result = await _state.db.conn.query(fullSql);
        _updateChartFromArrow(cardId, result, null);
      } catch (e) {
        console.warn('[IE] Refresh SQL error for', cardId, ':', e, fullSql);
      }
    } else {
      // 无 DuckDB：触发自定义事件让卡片本身处理重绑
      _emitCardUpdate(cardId, { filters: Object.assign({}, _state.filters), sql: fullSql });
    }
  }

  async function _refreshAllBoundCards() {
    // CONCUR-01 FIX: 防止并发执行 —— 快速连续筛选事件可能发起多批并发 DuckDB 查询导致连接错误
    // 若当前已有 refresh 在跑，仅记录「有新请求」，等当前完成后立即再跑一次
    if (_refreshInProgress) {
      _refreshPending = true;
      return;
    }
    _refreshInProgress = true;
    _refreshPending = false;
    try {
      // FIL-05 FIX: 除已注册的图表实例外，额外扫描 DOM 中所有带 data-sql 的卡片
      // （KPI 卡、表格卡等不调用 registerChart，不在 chartInstances/apexInstances 中）
      var registeredIds = Object.keys(_state.chartInstances)
        .concat(Object.keys(_state.apexInstances || {}))
        .concat(Object.keys(_state.vtableInstances || {}));
      var domSqlIds = Array.from(document.querySelectorAll('[data-card-id][data-sql]'))
        .map(function(el) { return el.getAttribute('data-card-id'); })
        .filter(Boolean);
      var allIds = registeredIds.concat(domSqlIds);
      var cardIds = allIds.filter(function(id, idx) { return id && allIds.indexOf(id) === idx; });
      console.log('[IE] _refreshAllBoundCards: %d cards to check, filters=%s', cardIds.length, JSON.stringify(_state.filters));
      for (var i = 0; i < cardIds.length; i++) {
        var el = document.getElementById(cardIds[i]) ||
                 document.querySelector('[data-card-id="' + cardIds[i] + '"]');
        if (el && el.getAttribute('data-sql')) {
          console.log('[IE] refreshing DuckDB card:', cardIds[i]);
          await _refreshCard(cardIds[i]);
        } else if (!el) {
          console.log('[IE] card element not found for id:', cardIds[i]);
        } else {
          console.log('[IE] card %s has no data-sql, skipping DuckDB refresh (relies on window filterChange listener)', cardIds[i]);
        }
      }
    } finally {
      _refreshInProgress = false;
      // 若期间有新请求到来，立即处理最新的筛选状态
      if (_refreshPending) {
        _refreshPending = false;
        setTimeout(function() { _refreshAllBoundCards(); }, 0);
      }
    }
  }

  // ──────────────────────────────────────────────────────────────
  // Arrow 结果 → ECharts setOption / ApexCharts updateSeries
  // ──────────────────────────────────────────────────────────────
  function _updateChartFromArrow(cardId, arrowResult, rule) {
    // 优先检测是否为 ApexCharts 实例
    var apexInst = _state.apexInstances && _state.apexInstances[cardId];
    if (apexInst) {
      _updateApexChartFromArrow(cardId, apexInst, arrowResult);
      return;
    }

    var inst = _state.chartInstances[cardId];
    if (!inst) {
      // BUG-E FIX: 非图表卡片（KPI 卡、表格卡等）没有注册图表实例，
      // fallback 到 cardUpdate 自定义事件，让卡片的 JS 代码自行处理数据更新
      _emitCardUpdate(cardId, { arrowResult: arrowResult, rule: rule });
      return;
    }

    try {
      var rows = arrowResult.toArray ? arrowResult.toArray() : [];
      var fields = arrowResult.schema && arrowResult.schema.fields
        ? arrowResult.schema.fields.map(function (f) { return f.name; })
        : [];

      if (fields.length === 0 || rows.length === 0) return;

      // 自动推断：第一列为 category（xAxis），后续列为 series values
      var xData = rows.map(function (r) { return r[fields[0]]; });
      var seriesData = fields.slice(1).map(function (field) {
        return {
          name: field,
          data: rows.map(function (r) { return r[field]; }),
        };
      });

      inst.setOption({
        xAxis: { data: xData },
        series: seriesData,
      }, { replaceMerge: ['xAxis', 'series'] });

    } catch (e) {
      console.warn('[IE] Arrow parse error for', cardId, ':', e);
    }
  }

  function _updateApexChartFromArrow(cardId, apexInst, arrowResult) {
    try {
      var rows = arrowResult.toArray ? arrowResult.toArray() : [];
      var fields = arrowResult.schema && arrowResult.schema.fields
        ? arrowResult.schema.fields.map(function (f) { return f.name; })
        : [];
      if (fields.length === 0 || rows.length === 0) return;

      // ApexCharts series 格式：[{ name: colName, data: [v1, v2, ...] }]
      var categories = rows.map(function (r) { return r[fields[0]]; });
      var series = fields.slice(1).map(function (field) {
        return {
          name: field,
          data: rows.map(function (r) { return r[field]; }),
        };
      });

      apexInst.updateOptions({
        xaxis: { categories: categories },
      }, false, false);
      // NAN-FIX: 使用 animate=false 防止完整 SVG 重绘时容器宽度未就绪导致 foreignObject width=NaN
      apexInst.updateSeries(series, false);
    } catch (e) {
      console.warn('[IE] ApexCharts update error for', cardId, ':', e);
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 空值判断工具（统一处理 null / '' / 空数组 / 空对象）
  // ──────────────────────────────────────────────────────────────
  function _isEmptyValue(value) {
    if (value === null || value === undefined || value === '') return true;
    // '全部' / 'all' 在筛选控件中表示"不过滤"，与空值语义等同。
    // 若不将其视为空值：IE 会把 '全部' 写入 _state.filters，_buildFilterWhere 生成
    // WHERE col = '全部' 导致 DuckDB 返回 0 行；同时 __FILTER_STATE__ 中残留 '全部' 会
    // 使 AI 图表代码的朴素比较（row[col] !== '全部'）误将所有真实数据行过滤掉。
    if (typeof value === 'string' && (value === '全部' || value.toLowerCase() === 'all')) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    // 数组中若唯一元素为 '全部'/'all' 也视为空（如 checkbox-group 全选时返回 ['全部']）
    if (Array.isArray(value) && value.length === 1 &&
        typeof value[0] === 'string' &&
        (value[0] === '全部' || value[0].toLowerCase() === 'all')) return true;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return Object.values(value).every(function(v) {
        return v === null || v === undefined || v === '';
      });
    }
    return false;
  }

  // ──────────────────────────────────────────────────────────────
  // WHERE 子句构建
  // ──────────────────────────────────────────────────────────────
  function _buildFilterWhere() {
    var parts = [];
    Object.keys(_state.filters).forEach(function (col) {
      var val = _state.filters[col];
      if (_isEmptyValue(val)) return;
      // IDENT-01 FIX: 列名使用 _escapeIdent（转义 "），值使用 _escapeSql（转义 '）
      var safeCol = '"' + _escapeIdent(col) + '"';
      if (Array.isArray(val)) {
        if (val.length === 0) return;
        // TYPE-01 FIX: 检测数组元素类型 — 所有元素均为有限数字时不加引号，其余统一字符串引号
        var allNumeric = val.every(function(v) { return v !== '' && v !== null && v !== undefined && isFinite(Number(v)); });
        var quoted = val.map(function (v) {
          return allNumeric ? String(Number(v)) : ("'" + _escapeSql(String(v)) + "'");
        }).join(', ');
        parts.push(safeCol + ' IN (' + quoted + ')');
      } else if (val && typeof val === 'object' && ('start' in val || 'end' in val)) {
        // date-range 类型：{ start, end }
        var s = val.start, e = val.end;
        if (s && e)  parts.push(safeCol + ' BETWEEN \'' + _escapeSql(String(s)) + "' AND '" + _escapeSql(String(e)) + "'");
        else if (s)  parts.push(safeCol + ' >= \'' + _escapeSql(String(s)) + "'");
        else if (e)  parts.push(safeCol + ' <= \'' + _escapeSql(String(e)) + "'");
      } else if (val && typeof val === 'object' && ('min' in val || 'max' in val)) {
        // numeric-range 类型：{ min, max }
        var lo = val.min, hi = val.max;
        var hasLo = lo !== undefined && lo !== null && lo !== '';
        var hasHi = hi !== undefined && hi !== null && hi !== '';
        if (hasLo && hasHi) parts.push(safeCol + ' BETWEEN ' + Number(lo) + ' AND ' + Number(hi));
        else if (hasLo)     parts.push(safeCol + ' >= ' + Number(lo));
        else if (hasHi)     parts.push(safeCol + ' <= ' + Number(hi));
      } else if (val && typeof val === 'object') {
        // 未知对象类型：跳过，避免输出 [object Object]
        return;
      } else {
        // TYPE-01 FIX: 单值，若为纯数字则不加引号（避免 VARCHAR vs INTEGER 类型不匹配）
        var isNum = val !== '' && isFinite(Number(val));
        // BUG-SEARCH-SQL FIX: 搜索框类型使用 ILIKE '%term%'（模糊、大小写不敏感匹配）
        // BUG-SEARCH-NUMERIC FIX: 移除 !isNum 条件 — 搜索框即使输入纯数字（如 "42"）也应模糊匹配，
        // 而不是退化为精确数值等值匹配 (= 42)，因为搜索列通常是文本类型。
        var colType = (_state.filterTypes || {})[col];
        if (colType === 'search') {
          parts.push(safeCol + " ILIKE '%" + _escapeSql(_escapeLike(String(val))) + "%'");
        } else {
          parts.push(isNum ? (safeCol + ' = ' + Number(val)) : (safeCol + ' = \'' + _escapeSql(String(val)) + "'"));
        }
      }
    });
    // 合并 filterTemplate 生成的 WHERE 片段
    Object.keys(_state.customFilters || {}).forEach(function (key) {
      var clause = _state.customFilters[key];
      if (clause) parts.push('(' + clause + ')');
    });
    return parts.join(' AND ');
  }

  // ──────────────────────────────────────────────────────────────
  // 面包屑导航 UI
  // ──────────────────────────────────────────────────────────────
  function _updateDrillBreadcrumb(cardId, drillPath) {
    var cardEl = document.querySelector('[data-card-id="' + cardId + '"]');
    if (!cardEl) return;

    var bc = cardEl.querySelector('.drill-breadcrumb');
    if (!bc) {
      // 自动创建面包屑导航
      bc = document.createElement('div');
      bc.className = 'drill-breadcrumb';
      cardEl.insertBefore(bc, cardEl.firstChild);
    }

    var items = ['全部'].concat(drillPath.breadcrumb.map(function (b) { return b.label; }));
    bc.innerHTML = items.map(function (label, i) {
      var isLast = i === items.length - 1;
      var cls = 'bc-item' + (isLast ? ' bc-current' : ' bc-link');
      return '<span class="' + cls + '" data-level="' + i + '">' +
        _escapeHtml(String(label)) + '</span>';
    }).join('<span class="bc-sep"> › </span>');

    // 绑定点击回到某层
    bc.querySelectorAll('.bc-link').forEach(function (el) {
      el.addEventListener('click', function () {
        var level = parseInt(el.getAttribute('data-level') || '0', 10);
        _drillToLevel(cardId, level);
      });
    });
  }

  function _addDrillUpButton(cardId) {
    var cardEl = document.querySelector('[data-card-id="' + cardId + '"]');
    if (!cardEl) return;
    if (cardEl.querySelector('.drill-up-btn')) return; // 已有则跳过

    var btn = document.createElement('button');
    btn.className = 'drill-up-btn';
    btn.textContent = '↑ 上钻';
    btn.addEventListener('click', function () {
      var rules = _state.interactions[cardId] || [];
      var drillUpRule = rules.find(function (r) { return r.action === 'drill_up'; });
      if (drillUpRule) {
        _applyDrillUp(cardId, drillUpRule);
      } else {
        // 构造临时规则
        _applyDrillUp(cardId, { action: 'drill_up', targetCardIds: [cardId] });
      }
    });

    var bc = cardEl.querySelector('.drill-breadcrumb');
    if (bc) bc.appendChild(btn);
  }

  function _drillToLevel(cardId, level) {
    var drillPath = _state.drillPaths[cardId];
    if (!drillPath) return;

    // 截断面包屑到目标层级
    drillPath.breadcrumb = drillPath.breadcrumb.slice(0, level);
    drillPath.currentLevel = level;

    _updateDrillBreadcrumb(cardId, drillPath);
    // 恢复原始数据（level=0 移除所有 drill 筛选）
    // BUG-NEW-4 FIX: 调用 _updateFilterTagsUI 同步标签显示
    _updateFilterTagsUI();
    // BUG-DRILLTO-NOAWAIT FIX: _refreshCard 是 async 函数，不 await 会产生浮动 Promise，
    // DuckDB 查询失败时错误被静默吞掉。用 .catch() 捕获并打印，不影响调用者流程。
    _refreshCard(cardId).catch(function(e) { console.warn('[IE] _drillToLevel refresh error:', e); });
  }

  // ──────────────────────────────────────────────────────────────
  // 筛选标签 UI
  // ──────────────────────────────────────────────────────────────
  function _updateFilterTagsUI() {
    var filters = _state.filters;
    var tagContainers = Array.prototype.slice.call(
      document.querySelectorAll('.filter-active-tags, .filter-tag-pills-container')
    );

    // ISSUE-07: 若报表没有预置 .filter-active-tags 容器，自动注入浮动提示条
    if (tagContainers.length === 0) {
      var autoBar = document.getElementById('__ie-auto-filter-bar__');
      if (!autoBar) {
        autoBar = document.createElement('div');
        autoBar.id = '__ie-auto-filter-bar__';
        autoBar.className = 'filter-active-tags __auto-injected';
        autoBar.style.cssText = [
          'position:fixed',
          'bottom:10px',
          'right:10px',
          'display:flex',
          'gap:4px',
          'flex-wrap:wrap',
          'z-index:9999',
          'max-width:calc(100vw - 20px)',
          'pointer-events:auto',
        ].join(';');
        document.body && document.body.appendChild(autoBar);
      }
      if (autoBar) tagContainers.push(autoBar);
    }

    tagContainers.forEach(function (container) {
      if (Object.keys(filters).length === 0) {
        container.innerHTML = '';
        return;
      }
      container.innerHTML = Object.keys(filters).map(function (col) {
        var val = filters[col];
        var display;
        // BUG-H FIX: 日期区间 / 数字区间对象格式化，避免显示 [object Object]
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          if ('start' in val || 'end' in val) {
            var s = val.start || '', e2 = val.end || '';
            display = (s && e2) ? (s + ' ~ ' + e2) : (s || e2 || '?');
          } else if ('min' in val || 'max' in val) {
            var lo = val.min != null ? val.min : '-∞';
            var hi = val.max != null ? val.max : '+∞';
            display = lo + ' ~ ' + hi;
          } else {
            display = JSON.stringify(val);
          }
        } else {
          display = Array.isArray(val) ? val.join(', ') : String(val);
        }
        return '<span class="filter-pill" style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;background:#3b82f6;color:#fff;border-radius:99px;font-size:12px;">' +
          _escapeHtml(col) + ': ' + _escapeHtml(display) +
          '<button class="pill-remove" data-col="' + _escapeHtml(col) + '" aria-label="移除筛选" style="background:none;border:none;color:#fff;cursor:pointer;padding:0 2px;font-size:14px;line-height:1;">×</button>' +
          '</span>';
      }).join('');
      // 绑定移除按钮
      container.querySelectorAll('.pill-remove').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var col = btn.getAttribute('data-col');
          _clearFilter(col);
        });
      });
    });
  }

  // ──────────────────────────────────────────────────────────────
  // 卡片 update 自定义事件（无 DuckDB 时的降级机制）
  // ──────────────────────────────────────────────────────────────
  function _emitCardUpdate(cardId, detail) {
    var el = document.getElementById(cardId) ||
      document.querySelector('[data-card-id="' + cardId + '"]');
    if (!el) return;
    try {
      // BUG-CARDUP-BUBBLE FIX: bubbles:true 确保 document.addEventListener('cardUpdate') 能收到事件。
      // AI 生成的 KPI 卡片常用 document 级监听器（而非元素级），bubbles:false 会导致事件丢失。
      el.dispatchEvent(new CustomEvent('cardUpdate', { bubbles: true, detail: detail }));
    } catch (e) { /* IE */ }
  }

  // ──────────────────────────────────────────────────────────────
  // MutationObserver：自动感知 data-card-id 元素加载
  // ──────────────────────────────────────────────────────────────
  function _observeChartCards() {
    if (typeof MutationObserver === 'undefined') return;
    var observer = new MutationObserver(function (mutations) {
      mutations.forEach(function (m) {
        m.addedNodes.forEach(function (node) {
          if (node.nodeType !== 1) return;
          // 仅扫描新增节点中的 data-interactions
          if (node.hasAttribute && node.hasAttribute('data-interactions')) {
            var cardId = node.getAttribute('data-card-id');
            if (cardId) {
              try {
                _state.interactions[cardId] = JSON.parse(node.getAttribute('data-interactions'));
              } catch (e) { /* */ }
            }
          }
          // 同样扫描子节点
          node.querySelectorAll && node.querySelectorAll('[data-card-id][data-interactions]').forEach(function (el) {
            var cardId = el.getAttribute('data-card-id');
            if (cardId && !_state.interactions[cardId]) {
              try {
                _state.interactions[cardId] = JSON.parse(el.getAttribute('data-interactions'));
              } catch (e) { /* */ }
            }
          });
        });
      });
    });
    observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  // ──────────────────────────────────────────────────────────────
  // 注册已存在的图表实例（修复 BRIDGE_SCRIPT → InteractivityEngine 时序问题）
  // ──────────────────────────────────────────────────────────────
  function _registerExistingChartInstances() {
    // ECharts: BRIDGE_SCRIPT 将所有实例存入 window.__ecInstances
    if (global.__ecInstances && global.__ecInstances.length) {
      global.__ecInstances.forEach(function (inst) {
        try {
          var dom = inst.getDom ? inst.getDom() : null;
          if (!dom) return;
          // BUG-04 FIX: 优先找父级 data-card-id（LLM 常见结构：父卡片有 data-card-id，图表容器只有 id）
          // 之前直接用 dom.id，导致注册为 chart1 而非 card1，联动规则匹配失败
          var cardId = (dom.closest && dom.closest('[data-card-id]')
              ? dom.closest('[data-card-id]').getAttribute('data-card-id')
              : null) ||
            dom.getAttribute('data-card-id') ||
            dom.id;
          if (cardId && !_state.chartInstances[cardId]) {
            registerChart(cardId, inst);
          }
        } catch (e) { /* ignore */ }
      });
    }

    // ApexCharts: BRIDGE_SCRIPT 将所有实例存入 window.__apexInstances
    if (global.__apexInstances && global.__apexInstances.length) {
      global.__apexInstances.forEach(function (inst) {
        try {
          var el = inst.el;
          if (!el) return;
          // BUG-04 FIX: 优先父级 data-card-id，再 fallback 到 el.id
          var cardId = (el.closest && el.closest('[data-card-id]')
              ? el.closest('[data-card-id]').getAttribute('data-card-id')
              : null) ||
            el.getAttribute('data-card-id') ||
            el.id;
          if (cardId && !_state.apexInstances[cardId]) {
            registerApexChart(cardId, inst);
          }
        } catch (e) { /* ignore */ }
      });
    }

    // ISSUE-06: VTable 联动事件支持
    // BRIDGE_SCRIPT 将所有 VTable 实例存入 window.__vtableInstances
    if (global.__vtableInstances && global.__vtableInstances.length) {
      if (!_state.vtableInstances) _state.vtableInstances = {};
      global.__vtableInstances.forEach(function (inst) {
        try {
          // VTable 实例通常有 container 属性或 getElement() 方法
          var el = (inst.getElement && inst.getElement()) || inst.container || null;
          if (!el) return;
          var cardId = (el.closest && el.closest('[data-card-id]')
              ? el.closest('[data-card-id]').getAttribute('data-card-id')
              : null) ||
            el.getAttribute('data-card-id') ||
            el.id;
          if (!cardId || _state.vtableInstances[cardId]) return;
          _state.vtableInstances[cardId] = inst;
          // 绑定 selected_cell 事件，映射到 click 联动
          try {
            inst.on('selected_cell', function (args) {
              _handleChartEvent(cardId, 'click', {
                name: args.value != null ? String(args.value) : '',
                value: args.value,
                col: args.col,
                row: args.row,
                field: args.field,
              });
            });
            console.log('[IE] VTable instance registered with selected_cell binding:', cardId);
          } catch (bindErr) {
            console.warn('[IE] VTable event binding failed for', cardId, ':', bindErr);
          }
        } catch (e) { /* ignore */ }
      });
    }
  }

  // ──────────────────────────────────────────────────────────────
  // 辅助函数
  // ──────────────────────────────────────────────────────────────
  function _resolvePayload(mapping, params) {
    // BUG-7 FIX: 若 mapping 为空，尝试从 params 自动提取 name/value/seriesName 作为 payload，
    // 避免 "filter" action 因缺 payloadMapping 而产生空 payload 导致 _state.filters 写入无效键 undefined
    if (!mapping) {
      var auto = {};
      if (params) {
        if (params.name !== undefined)       auto.name       = params.name;
        if (params.value !== undefined)      auto.value      = params.value;
        if (params.seriesName !== undefined) auto.seriesName = params.seriesName;
        if (params.dataIndex !== undefined)  auto.dataIndex  = params.dataIndex;
      }
      return auto;
    }
    var result = {};
    Object.keys(mapping).forEach(function (key) {
      var expr = mapping[key];
      if (typeof expr === 'string' && expr.startsWith('$event.')) {
        var val = _getPath(params, expr.slice(7));
        // datazoom 场景：startValue/endValue 可能在 batch[0] 中（ECharts 新版格式）
        if (val === undefined && (expr === '$event.startValue' || expr === '$event.endValue')) {
          var batchKey = expr.slice(7); // 'startValue' or 'endValue'
          if (params.batch && params.batch[0]) {
            val = _getPath(params.batch[0], batchKey);
          }
        }
        result[key] = val;
      } else {
        result[key] = expr;
      }
    });
    return result;
  }

  function _getPath(obj, path) {
    return path.split('.').reduce(function (o, k) {
      return o != null ? o[k] : undefined;
    }, obj);
  }

  function _escapeSql(str) {
    return String(str).replace(/'/g, "''");
  }

  // BUG-SEARCH-SQL FIX: 转义 LIKE 模式中的通配符 % 和 _ （防止用户输入破坏 LIKE 语义）
  function _escapeLike(str) {
    return String(str).replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_');
  }

  // IDENT-01 FIX: 列名/表名标识符中的双引号必须转义为 ""，否则含 " 的标识符会产生 broken SQL
  // 所有 _buildFilterWhere 中拼 "colName" 的场合改用此函数
  function _escapeIdent(str) {
    return String(str).replace(/"/g, '""');
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function _interpolateSql(sql, params) {
    return sql.replace(/\{(\w+)\}/g, function (_, k) {
      return params[k] !== undefined ? _escapeSql(String(params[k])) : '';
    });
  }

  function _loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.setAttribute('data-optional', '1'); // Mark as optional so error handlers can suppress
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Failed to load: ' + src)); };
      document.head.appendChild(s);
    });
  }

  async function _clearFilter(col) {
    delete _state.filters[col];
    delete _state.filterTypes[col];
    // BUG-G FIX: 同时清除 customFilters 中以该列名为 key 的条目（由 _applyFilter rule.column 写入）
    if (_state.customFilters) {
      delete _state.customFilters[col];
    }
    // BUG-CLEARFILTER-MAP-LEAK FIX: 清除 filterIdToColumn 中所有指向该列的反向映射。
    // 之前只清 filters/filterTypes，filterId≠column 场景下用 pill-remove 清除筛选后，
    // filterIdToColumn 中残留旧条目，导致后续 filterReset(scope=filterId) 再次清除该列
    // 时能匹配到（虽无害），但若 filterId 被复用指向新列则会清错目标列。
    Object.keys(_state.filterIdToColumn || {}).forEach(function(fid) {
      if (_state.filterIdToColumn[fid] === col) {
        delete _state.filterIdToColumn[fid];
      }
    });
    try { global.__FILTER_STATE__ = Object.assign({}, _state.filters); } catch (e) { /* */ }
    _updateFilterTagsUI();
    await _refreshAllBoundCards();
  }

  // ──────────────────────────────────────────────────────────────
  // 公开 API（暴露为 window.__REPORT_EVENT_BUS__）
  // ──────────────────────────────────────────────────────────────
  // 内部事件监听器 map（支持 addEventListener / removeEventListener / dispatchEvent API）
  var _eventListeners = {};

  var publicAPI = {
    init: init,

    /** 注册图表实例（每个 ECharts chart 初始化后必须调用） */
    register: registerChart,

    /**
     * 发送事件（替代旧版 EventTarget.emit 用法）
     * @param {string} cardId 来源卡片 ID
     * @param {string} eventType 事件类型：click/datazoom/change
     * @param {object} params ECharts 事件参数
     */
    emit: _handleChartEvent,

    /** 清除单个筛选列 */
    clearFilter: _clearFilter,

    /** 重置所有筛选 */
    resetAll: async function () {
      await _resetFilters(null);
    },

    /** 注册 ECharts 实例（registerECharts 别名，兼容 AI 生成代码调用） */
    registerECharts: registerChart,

    /** 注册 ApexCharts 实例（每个 ApexCharts chart 初始化后 render().then() 中调用） */
    registerApex: registerApexChart,

    /** 获取所有已注册的 ApexCharts 实例数组（用于主题热更新等遍历操作） */
    getApexInstances: function () {
      return Object.values(_state.apexInstances || {});
    },

    /** 按 cardId 获取已注册的 ApexCharts 实例（供 ApexCharts.getInstanceById shim 使用） */
    getApexInstance: function (cardId) {
      return (_state.apexInstances || {})[cardId] || null;
    },

    /** 获取完整引擎状态（调试用） */
    getState: function () {
      return {
        filters: Object.assign({}, _state.filters),
        filterTypes: Object.assign({}, _state.filterTypes),
        filterIdToColumn: Object.assign({}, _state.filterIdToColumn),
        drillPaths: _state.drillPaths,
        chartIds: Object.keys(_state.chartInstances),
        apexChartIds: Object.keys(_state.apexInstances || {}),
        hasDuckDB: !!_state.db,
        tables: Object.keys(_state.tables),
      };
    },

    /** 手动触发卡片刷新 */
    refreshCard: _refreshCard,

    /** 更新筛选标签 UI（供外部调用） */
    updateFilterTags: _updateFilterTagsUI,

    /** 向后兼容：EventTarget-style addEventListener（实际注册监听器）*/
    addEventListener: function (type, fn) {
      if (!_eventListeners[type]) _eventListeners[type] = [];
      if (fn && _eventListeners[type].indexOf(fn) === -1) _eventListeners[type].push(fn);
    },
    removeEventListener: function (type, fn) {
      if (_eventListeners[type]) {
        _eventListeners[type] = _eventListeners[type].filter(function(f) { return f !== fn; });
      }
    },
    dispatchEvent: function (evt) {
      var listeners = _eventListeners[evt.type] || [];
      listeners.forEach(function(fn) { try { fn(evt); } catch(e) {} });
    },
  };

  // ──────────────────────────────────────────────────────────────
  // 挂载：如果旧版 __REPORT_EVENT_BUS__ 已存在（EventTarget），则升级
  // ──────────────────────────────────────────────────────────────
  var existingBus = global.__REPORT_EVENT_BUS__;
  if (existingBus && existingBus.emit && existingBus.emit === publicAPI.emit) {
    // 已是本引擎，跳过
  } else {
    global.__REPORT_EVENT_BUS__ = publicAPI;
  }

  // BUG-01 FIX: 监听 filter-controls.js 的 filterReset 事件并真正清空引擎状态
  // filter-controls.js 的重置按钮通过 __REPORT_EVENT_BUS__.dispatchEvent(filterResetEvt) 触发，
  // 但引擎从未注册 filterReset 监听器，导致 _state.filters 永远不被清空。
  // FIL-03 FIX: 读取 scope 参数，支持单筛选器精确重置
  //
  // BUG-RESET-DOUBLE FIX: FC 同时向 bus + document 派发 filterReset，导致 _resetFilters 被双调用
  // （bus listener → IE._eventListeners，document listener → IE DOM listener）。
  // 引入 _resetInFlight 去重标志：同一同步任务内只执行一次 _resetFilters，第二次调用被丢弃。
  var _resetInFlight = false;
  function _deduplicatedReset(scope) {
    if (_resetInFlight) {
      console.log('[IE] BUG-RESET-DOUBLE: duplicate filterReset suppressed (scope=%s)', scope);
      return;
    }
    _resetInFlight = true;
    // 使用 setTimeout(0) 在当前同步任务结束后重置标志，允许下一次真实重置
    setTimeout(function() { _resetInFlight = false; }, 0);
    _resetFilters(scope ? [scope] : null).catch(function(err) { console.warn('[IE] filterReset error:', err); });
  }
  global.__REPORT_EVENT_BUS__.addEventListener('filterReset', function(e) {
    var scope = e && e.detail && e.detail.scope;
    _deduplicatedReset(scope);
  });
  // 同时监听 document 上的 filterReset（兼容直接 document.dispatchEvent 的写法）
  document.addEventListener('filterReset', function(e) {
    var scope = e && e.detail && e.detail.scope;
    _deduplicatedReset(scope);
  });

  // ──────────────────────────────────────────────────────────────
  // EAGER-FILTER-FIX: 立即同步注册 filterChange / filterApply / filterReset 监听器
  // ──────────────────────────────────────────────────────────────
  // 根本原因：若 filterChange 监听器在 init()→DOMContentLoaded 内注册，则 AI 生成代码
  // 的 DOMContentLoaded 监听器（更早排队）会先触发，读到 IE 尚未更新的 __FILTER_STATE__
  // 导致筛选失效。通过在脚本解析时立即注册，确保 IE 始终比 AI 代码的监听器更早执行。
  // _listenFilterControls() 中仍保留重复注册保护（_filterListenerAttached 标志），
  // 但其 document.addEventListener 分支通过此处预注册后变为无操作。
  (function _eagerListenFilters() {
    // filterChange（核心路径）
    document.addEventListener('filterChange', function (e) {
      var detail = e.detail || {};
      if (detail.ieRefresh) return;

      var filterId = detail.filterId;
      var value = detail.value;
      var columnHint = detail.column || filterId;

      console.log('[IE] filterChange received: filterId=%s col=%s value=%o', filterId, columnHint, value);

      if (!columnHint) {
        // 即使没有列名也更新 __FILTER_STATE__，确保 AI 代码后续读到的是最新状态
        try { global.__FILTER_STATE__ = Object.assign({}, _state.filters); } catch(e2) {}
        return;
      }

      if (_isEmptyValue(value)) {
        delete _state.filters[columnHint];
        delete _state.filterTypes[columnHint];
        if (_state.customFilters) {
          Object.keys(_state.customFilters).forEach(function (k) {
            if (k === columnHint) delete _state.customFilters[k];
          });
        }
      } else {
        _state.filters[columnHint] = value;
        var widgetType = detail.type || 'generic';
        _state.filterTypes[columnHint] = widgetType;
        if (filterId && filterId !== columnHint) {
          _state.filterIdToColumn[filterId] = columnHint;
        }
      }

      console.log('[IE] _state.filters after update:', JSON.stringify(_state.filters));
      console.log('[IE] chartInstances:', Object.keys(_state.chartInstances), 'apexInstances:', Object.keys(_state.apexInstances || {}));

      // 立即更新 __FILTER_STATE__，确保后续 AI 代码的同一事件监听器读到最新状态
      try { global.__FILTER_STATE__ = Object.assign({}, _state.filters); } catch (e2) { /* */ }

      console.log('[IE] filterChange processed. filterId=%s col=%s val=%o type=%s', filterId, columnHint, value, (detail.type || 'generic'));

      _refreshAllBoundCards();
      _updateFilterTagsUI();
    });

    // filterApply（应用按钮）
    document.addEventListener('filterApply', function (e) {
      var detail = (e && e.detail) || {};
      var state = detail.state || {};
      Object.keys(state).forEach(function (filterId) {
        var entry = state[filterId];
        var col, val, type;
        if (entry !== null && entry !== undefined && typeof entry === 'object' && 'value' in entry) {
          col = entry.column || filterId;
          val = entry.value;
          type = entry.type || null;
        } else {
          col = filterId;
          val = entry;
          type = null;
        }
        if (_isEmptyValue(val)) {
          delete _state.filters[col];
          delete _state.filterTypes[col];
          if (_state.customFilters) delete _state.customFilters[col];
          if (filterId !== col && _state.filterIdToColumn) delete _state.filterIdToColumn[filterId];
        } else {
          _state.filters[col] = val;
          if (type) _state.filterTypes[col] = type;
          if (filterId !== col) _state.filterIdToColumn[filterId] = col;
        }
      });
      try { global.__FILTER_STATE__ = Object.assign({}, _state.filters); } catch (e2) { /* */ }
      console.log('[IE] filterApply received, refreshing all cards. filters:', JSON.stringify(_state.filters));
      _refreshAllBoundCards();
      _updateFilterTagsUI();
    });

    // 标记：防止 _listenFilterControls() 在 init() 时重复注册
    _filterListenerAttached = true;
  })();

  // ──────────────────────────────────────────────────────────────
  // 自动初始化
  // ──────────────────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      init().catch(function (e) { console.warn('[IE] init error:', e); });
    });
  } else {
    // DOMContentLoaded 已触发
    setTimeout(function () {
      init().catch(function (e) { console.warn('[IE] init error:', e); });
    }, 0);
  }

  // 延迟二次扫描：捕获在 init() 之后异步渲染的图表实例
  setTimeout(function () {
    if (_state.initialized) {
      _registerExistingChartInstances();
    }
  }, 800);

})(window);

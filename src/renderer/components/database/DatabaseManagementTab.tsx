/**
 * DatabaseManagementTab — Three-panel database management UI.
 *
 * Layout:
 *   Left  — data source list (user DBs + external sources)
 *   Middle — table browser for the selected source
 *   Right — table detail / SQL console (tabbed)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  DatabaseZap, Database, Server, Table2, Plus,
  Trash2, Pencil, Download, Upload, RefreshCw,
  Play, X, ChevronRight, ChevronDown,
  Columns2, AlertCircle, Check, Copy, Search,
  History, Loader2, FileInput, FileOutput,
  TableProperties,
} from 'lucide-react';
// Re-export with Tabler-style names for backward compatibility within this file
const IconDatabasePlus = DatabaseZap;
const IconDatabase = Database;
const IconServer = Server;
const IconTable = Table2;
const IconPlus = Plus;
const IconTrash = Trash2;
const IconEdit = Pencil;
const IconDownload = Download;
const IconUpload = Upload;
const IconRefresh = RefreshCw;
const IconPlayerPlay = Play;
const IconX = X;
const IconChevronRight = ChevronRight;
const IconChevronDown = ChevronDown;
const IconColumns = Columns2;
const IconAlertCircle = AlertCircle;
const IconCheck = Check;
const IconCopy = Copy;
const IconSearch = Search;
const IconHistory = History;
const IconLoader2 = Loader2;
const IconFileImport = FileInput;
const IconFileExport = FileOutput;
const IconTablePlus = TableProperties;
import { useDatasourceStore } from '../../stores/datasourceStore';
import type { UserDBConfig, DatasourceConfig, ActiveDatasource, SchemaInfo } from '../../stores/datasourceStore';
import { useI18n } from '../../i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableInfo {
  name: string;
  comment?: string;
  columns: Array<{ name: string; type: string; nullable: boolean; comment?: string }>;
}

type RightPanelTab = 'detail' | 'console';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUserDB(ds: ActiveDatasource): ds is UserDBConfig {
  return ds.type === 'userdb';
}

const api = () => window.electronAPI as any;

// ─── Sub-components ───────────────────────────────────────────────────────────

/** Left panel: data source list */
const DBSourceList: React.FC<{
  selectedId: string | null;
  onSelect: (id: string) => void;
}> = ({ selectedId, onSelect }) => {
  const { datasources, userDBs, loadDatasources, loadUserDBs, createUserDB, deleteUserDB } = useDatasourceStore();
  const { t } = useI18n();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    loadDatasources();
    loadUserDBs();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const cfg = await createUserDB(newName.trim(), newDesc.trim() || undefined);
      setCreating(false);
      setNewName('');
      setNewDesc('');
      onSelect(cfg.id);
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm(t.dbManagement.deleteConfirm)) return;
    await deleteUserDB(id);
    if (selectedId === id) onSelect('');
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{t.dbManagement.sectionTitle}</span>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          title={t.dbManagement.createBtnTitle}
        >
          <IconDatabasePlus size={12} />
          {t.dbManagement.createBtn}
        </button>
      </div>

      {/* User DBs */}
      {userDBs.length > 0 && (
        <div className="px-3 py-1.5">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">{t.dbManagement.sectionUserDbs}</p>
          {userDBs.map((db) => (
            <div
              key={db.id}
              onClick={() => onSelect(db.id)}
              className={`group flex items-center justify-between px-2 py-1.5 rounded cursor-pointer transition-colors ${
                selectedId === db.id
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <IconDatabasePlus size={14} className="shrink-0 text-blue-500" />
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">{db.name}</div>
                  {db.tableCount !== undefined && (
                    <div className="text-xs text-gray-400">{db.tableCount} {t.dbManagement.tableCountUnit}</div>
                  )}
                </div>
              </div>
              <button
                onClick={(e) => handleDelete(e, db.id)}
                title={t.dbManagement.deleteBtnTitle}
                className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-500 transition-all"
              >
                <IconTrash size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* External sources */}
      {datasources.length > 0 && (
        <div className="px-3 py-1.5 border-t border-gray-100 dark:border-gray-700/50">
          <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider mb-1">{t.dbManagement.sectionExternal}</p>
          {datasources.map((ds) => (
            <div
              key={ds.id}
              onClick={() => onSelect(ds.id)}
              className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
                selectedId === ds.id
                  ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
              }`}
            >
              <IconServer size={14} className="shrink-0 text-gray-400" />
              <div className="min-w-0">
                <div className="text-xs font-medium truncate">{ds.name}</div>
                <div className="text-xs text-gray-400 uppercase">{ds.type}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {userDBs.length === 0 && datasources.length === 0 && !creating && (
        <div className="flex-1 flex flex-col items-center justify-center p-4 text-center text-gray-400 dark:text-gray-500">
          <IconDatabase size={28} className="mb-2 opacity-40" />
          <p className="text-xs">{t.dbManagement.emptyTitle}</p>
          <p className="text-xs mt-1">{t.dbManagement.emptyHint}</p>
        </div>
      )}

      {/* Create user DB form */}
      {creating && (
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <p className="text-xs font-medium text-gray-600 dark:text-gray-300 mb-2">{t.dbManagement.createFormTitle}</p>
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
            placeholder={t.dbManagement.namePlaceholder}
            className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 mb-1.5"
          />
          <textarea
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder={t.dbManagement.descPlaceholder}
            rows={2}
            className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 resize-none mb-2"
          />
          <div className="flex gap-1.5">
            <button
              onClick={handleCreate}
              disabled={busy || !newName.trim()}
              className="flex-1 flex items-center justify-center gap-1 px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {busy ? <IconLoader2 size={12} className="animate-spin" /> : <IconCheck size={12} />}
              {t.dbManagement.createConfirm}
            </button>
            <button
              onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
              className="px-2 py-1 rounded text-xs border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {t.dbManagement.cancelBtn}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Middle panel: table list */
const TableBrowser: React.FC<{
  sourceId: string;
  isUserDB: boolean;
  selectedTable: string | null;
  onSelectTable: (name: string) => void;
  onImport: () => void;
  onRefresh: () => void;
  schema: SchemaInfo | null;
  loading: boolean;
}> = ({ sourceId, isUserDB, selectedTable, onSelectTable, onImport, onRefresh, schema, loading }) => {
  const { t } = useI18n();
  const [search, setSearch] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [newTableDDL, setNewTableDDL] = useState('CREATE TABLE my_table (\n  id INTEGER PRIMARY KEY,\n  name TEXT NOT NULL\n)');
  const [creating, setCreating] = useState(false);

  const tables = schema?.tables ?? [];
  const filtered = search
    ? tables.filter((t) => t.name.toLowerCase().includes(search.toLowerCase()))
    : tables;

  const handleCreateTable = async () => {
    setCreating(true);
    try {
      await api().userdbCreateTable(sourceId, newTableDDL);
      setCreateDialogOpen(false);
      onRefresh();
    } catch (err) {
      alert(t.dbManagement.createTableError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search */}
      <div className="px-2 pt-2 pb-1.5 border-b border-gray-200 dark:border-gray-700">
        <div className="relative">
          <IconSearch size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.dbManagement.searchPlaceholder}
            className="w-full pl-6 pr-2 py-1 text-xs border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
          />
        </div>
      </div>

      {/* Table list */}
      <div className="flex-1 overflow-y-auto px-1 py-1">
        {loading && (
          <div className="flex items-center justify-center p-6">
            <IconLoader2 size={16} className="animate-spin text-gray-400" />
          </div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-center text-gray-400 dark:text-gray-500 py-6">
            <IconTable size={24} className="mx-auto mb-1 opacity-40" />
            <p className="text-xs">{search ? t.dbManagement.noMatches : t.dbManagement.noTables}</p>
          </div>
        )}
        {!loading && filtered.map((table) => (
          <div
            key={table.name}
            onClick={() => onSelectTable(table.name)}
            className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
              selectedTable === table.name
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
            }`}
          >
            <IconTable size={13} className="shrink-0 text-gray-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium truncate">{table.name}</div>
              <div className="text-xs text-gray-400">{table.columns.length} {t.dbManagement.columnCountUnit}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="p-2 border-t border-gray-200 dark:border-gray-700 flex gap-1.5">
        <button
          onClick={onRefresh}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          title={t.dbManagement.refreshTitle}
        >
          <IconRefresh size={11} />
        </button>
        {isUserDB && (
          <>
            <button
              onClick={() => setCreateDialogOpen(true)}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t.dbManagement.createTableBtn}
            >
              <IconTablePlus size={11} />
              {t.dbManagement.createTableBtn}
            </button>
            <button
              onClick={onImport}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              title={t.dbManagement.importBtn}
            >
              <IconFileImport size={11} />
              {t.dbManagement.importBtn}
            </button>
          </>
        )}
      </div>

      {/* Create table dialog */}
      {createDialogOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-5 w-[480px] max-w-[90vw]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.dbManagement.createTableTitle}</h3>
              <button onClick={() => setCreateDialogOpen(false)} title={t.dbManagement.closeTitle} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <IconX size={16} />
              </button>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">{t.dbManagement.createTableLabel}</p>
            <textarea
              value={newTableDDL}
              onChange={(e) => setNewTableDDL(e.target.value)}
              rows={8}
              title={t.dbManagement.createTableLabel}
              aria-label={t.dbManagement.createTableLabel}
              placeholder="CREATE TABLE my_table (...)"
              className="w-full text-xs font-mono px-3 py-2 border border-gray-300 dark:border-gray-600 rounded bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 resize-none mb-3"
              spellCheck={false}
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreateDialogOpen(false)} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">{t.dbManagement.cancelBtn}</button>
              <button
                onClick={handleCreateTable}
                disabled={creating}
                className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {creating ? t.dbManagement.creatingBtn : t.dbManagement.createTableConfirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/** Right panel: table column details */
const TableDetailPanel: React.FC<{
  sourceId: string;
  tableName: string;
  columns: TableInfo['columns'];
  isUserDB: boolean;
  onRefresh: () => void;
}> = ({ sourceId, tableName, columns, isUserDB, onRefresh }) => {
  const { t } = useI18n();
  const [editingCol, setEditingCol] = useState<string | null>(null);
  const [editType, setEditType] = useState('');
  const [editComment, setEditComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [addingCol, setAddingCol] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColType, setNewColType] = useState('TEXT');

  const handleDropTable = async () => {
    if (!confirm(t.dbManagement.dropTableConfirmPrefix + tableName + t.dbManagement.dropTableConfirmSuffix)) return;
    await api().userdbDropTable(sourceId, tableName);
    onRefresh();
  };

  const handleSaveCol = async () => {
    if (!editingCol) return;
    setBusy(true);
    try {
      await api().userdbAlterColumn(sourceId, tableName, editingCol, editType || undefined, editComment || undefined);
      setEditingCol(null);
      onRefresh();
    } catch (err) {
      alert(t.dbManagement.alterColError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleAddCol = async () => {
    if (!newColName.trim()) return;
    setBusy(true);
    try {
      await api().userdbAddColumn(sourceId, tableName, newColName.trim(), newColType);
      setAddingCol(false);
      setNewColName('');
      setNewColType('TEXT');
      onRefresh();
    } catch (err) {
      alert(t.dbManagement.addColError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const content = await api().userdbExport(sourceId, tableName, format);
      const blob = new Blob([content], { type: format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(t.dbManagement.exportError + (err instanceof Error ? err.message : String(err)));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <IconTable size={14} className="text-blue-500" />
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 font-mono">{tableName}</span>
          <span className="text-xs text-gray-400">{columns.length} {t.dbManagement.columnCountUnit}</span>
        </div>
        <div className="flex items-center gap-1">
          {isUserDB && (
            <>
              <button onClick={() => setAddingCol(true)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-blue-600 transition-colors" title={t.dbManagement.addColumnTitle}>
                <IconPlus size={13} />
              </button>
              <button onClick={() => handleExport('csv')} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-green-600 transition-colors" title={t.dbManagement.exportCsvTitle}>
                <IconFileExport size={13} />
              </button>
              <button onClick={handleDropTable} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-red-600 transition-colors" title={t.dbManagement.dropTableTitle}>
                <IconTrash size={13} />
              </button>
            </>
          )}
          {!isUserDB && (
            <button onClick={() => handleExport('csv')} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-green-600 transition-colors" title={t.dbManagement.exportCsvTitle}>
              <IconFileExport size={13} />
            </button>
          )}
        </div>
      </div>

      {/* Add column form */}
      {addingCol && isUserDB && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-200 dark:border-blue-800">
          <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-1.5">{t.dbManagement.addColHeader}</p>
          <div className="flex gap-1.5 items-center">
            <input
              autoFocus
              value={newColName}
              onChange={(e) => setNewColName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddCol(); if (e.key === 'Escape') setAddingCol(false); }}
              placeholder={t.dbManagement.colNamePlaceholder}
              className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />
            <select
              value={newColType}
              onChange={(e) => setNewColType(e.target.value)}
              title={t.dbManagement.colType}
              aria-label={t.dbManagement.colType}
              className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            >
              {['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC'].map((typ) => (
                <option key={typ} value={typ}>{typ}</option>
              ))}
            </select>
            <button onClick={handleAddCol} disabled={busy} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">{t.dbManagement.addColBtn}</button>
            <button onClick={() => setAddingCol(false)} className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700">{t.dbManagement.cancelBtn}</button>
          </div>
        </div>
      )}

      {/* Column table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/80">
            <tr>
              <th className="text-left px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400">{t.dbManagement.colName}</th>
              <th className="text-left px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400">{t.dbManagement.colType}</th>
              <th className="text-left px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400">{t.dbManagement.colNullable}</th>
              <th className="text-left px-3 py-1.5 font-medium text-gray-500 dark:text-gray-400">{t.dbManagement.colComment}</th>
              {isUserDB && <th className="px-3 py-1.5" />}
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name} className="border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-3 py-1.5 font-mono text-gray-800 dark:text-gray-200">{col.name}</td>
                <td className="px-3 py-1.5">
                  {editingCol === col.name && isUserDB ? (
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value)}
                      title={t.dbManagement.colType}
                      aria-label={t.dbManagement.colType}
                      className="text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                      autoFocus
                    >
                      {['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC'].map((typ) => (
                        <option key={typ} value={typ}>{typ}</option>
                      ))}
                    </select>
                  ) : (
                    <span className="font-mono text-purple-600 dark:text-purple-400">{col.type}</span>
                  )}
                </td>
                <td className="px-3 py-1.5 text-gray-500">
                  {col.nullable ? <span className="text-green-500">Y</span> : <span className="text-red-400">N</span>}
                </td>
                <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">
                  {editingCol === col.name && isUserDB ? (
                    <input
                      value={editComment}
                      onChange={(e) => setEditComment(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCol(); }}
                      placeholder={t.dbManagement.commentPlaceholder}
                      className="text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 w-full"
                    />
                  ) : (
                    col.comment ?? '-'
                  )}
                </td>
                {isUserDB && (
                  <td className="px-2 py-1.5">
                    {editingCol === col.name ? (
                      <div className="flex gap-1">
                        <button onClick={handleSaveCol} disabled={busy} title={t.dbManagement.saveTitle} className="p-0.5 text-green-600 hover:text-green-700 disabled:opacity-50"><IconCheck size={12} /></button>
                        <button onClick={() => setEditingCol(null)} title={t.dbManagement.cancelBtn} className="p-0.5 text-gray-400 hover:text-gray-600"><IconX size={12} /></button>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEditingCol(col.name); setEditType(col.type); setEditComment(col.comment ?? ''); }}
                        title={t.dbManagement.editColTitle}
                        className="p-0.5 text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-all"
                      >
                        <IconEdit size={12} />
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/** Right panel: SQL console */
const SQLConsole: React.FC<{
  sourceId: string;
  isUserDB: boolean;
}> = ({ sourceId, isUserDB }) => {
  const { t } = useI18n();
  const [sql, setSql] = useState('SELECT * FROM sqlite_master WHERE type = \'table\';');
  const [result, setResult] = useState<{ columns: string[]; rows: unknown[][]; rowCount: number; executionMs: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const execute = async () => {
    if (!sql.trim() || executing) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    try {
      let res: any;
      if (isUserDB) {
        res = await api().userdbExecute(sourceId, sql);
      } else {
        res = await api().datasourceQuery(sourceId, sql);
      }
      setResult(res);
      setHistory((prev) => [sql, ...prev.filter((s) => s !== sql)].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.ctrlKey && e.key === 'Enter') {
      e.preventDefault();
      execute();
    }
  };

  const copyResult = () => {
    if (!result) return;
    const lines = [
      result.columns.join('\t'),
      ...result.rows.map((r) => (r as unknown[]).map((v) => (v == null ? '' : String(v))).join('\t')),
    ];
    navigator.clipboard.writeText(lines.join('\n'));
  };

  return (
    <div className="flex flex-col h-full">
      {/* SQL input */}
      <div className="relative border-b border-gray-200 dark:border-gray-700">
        <textarea
          ref={textareaRef}
          value={sql}
          onChange={(e) => setSql(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={5}
          placeholder={`${t.dbManagement.sqlPlaceholder}${!isUserDB ? t.dbManagement.readOnlyPlaceholderSuffix : ''}`}
          className="w-full px-3 py-2 text-xs font-mono bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 resize-none focus:outline-none"
          spellCheck={false}
        />
        <div className="flex items-center justify-between px-2 py-1.5 bg-gray-100 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-1.5">
            <button
              onClick={execute}
              disabled={executing}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {executing ? <IconLoader2 size={11} className="animate-spin" /> : <IconPlayerPlay size={11} />}
              {t.dbManagement.executeBtn}
            </button>
            <button
              onClick={() => setSql('')}
              className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-gray-700 transition-colors"
            >
              {t.dbManagement.clearBtn}
            </button>
          </div>
          <span className="text-xs text-gray-400">{!isUserDB ? t.dbManagement.readOnlyMode : t.dbManagement.ctrlEnterHint}</span>
        </div>
      </div>

      {/* Result */}
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="p-3 m-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2">
              <IconAlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">{error}</pre>
            </div>
          </div>
        )}

        {result && (
          <div>
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {result.rowCount} rows · {result.executionMs}ms
              </span>
              <button onClick={copyResult} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <IconCopy size={11} />
                {t.dbManagement.copyBtn}
              </button>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
                  <tr>
                    {result.columns.map((col) => (
                      <th key={col} className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.rows.slice(0, 500).map((row, ri) => (
                    <tr key={ri} className={`border-t border-gray-100 dark:border-gray-700/50 ${ri % 2 === 0 ? '' : 'bg-gray-50 dark:bg-gray-800/30'}`}>
                      {(row as unknown[]).map((cell, ci) => (
                        <td key={ci} className="px-3 py-1 text-gray-700 dark:text-gray-300 border-r border-gray-100 dark:border-gray-700/50 max-w-[200px] truncate font-mono" title={cell == null ? 'NULL' : String(cell)}>
                          {cell == null ? <span className="text-gray-400 italic">NULL</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {result.rows.length > 500 && (
                <div className="text-center text-xs text-gray-400 py-2">{t.dbManagement.truncatedNote}</div>
              )}
            </div>
          </div>
        )}

        {!error && !result && (
          <div className="flex flex-col items-center justify-center h-32 text-gray-400 dark:text-gray-500">
            <IconPlayerPlay size={20} className="opacity-30 mb-1" />
            <p className="text-xs">{t.dbManagement.consoleEmptyHint}</p>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Import Data Dialog ───────────────────────────────────────────────────────

const ImportDataDialog: React.FC<{
  sourceId: string;
  onClose: () => void;
  onDone: () => void;
}> = ({ sourceId, onClose, onDone }) => {
  const { t } = useI18n();
  const [mode, setMode] = useState<'direct' | 'llm'>('direct');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: unknown[][] } | null>(null);
  const [tableName, setTableName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ inserted: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inferType = (values: unknown[]): string => {
    const nonNull = values.filter((v) => v != null && v !== '');
    if (!nonNull.length) return 'TEXT';
    if (nonNull.every((v) => /^-?\d+$/.test(String(v)))) return 'INTEGER';
    if (nonNull.every((v) => /^-?\d*\.?\d+$/.test(String(v)))) return 'REAL';
    return 'TEXT';
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    const name = f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    setTableName(name || 'imported_data');

    // Parse file for preview
    const ext = f.name.split('.').pop()?.toLowerCase();
    try {
      if (ext === 'json') {
        const text = await f.text();
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0]);
          const rows = data.slice(0, 20).map((row: any) => headers.map((h) => row[h] ?? null));
          setPreview({ headers, rows });
        }
      } else if (ext === 'csv' || ext === 'tsv') {
        const text = await f.text();
        const sep = ext === 'tsv' ? '\t' : ',';
        const lines = text.split('\n').filter(Boolean);
        if (lines.length > 0) {
          const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ''));
          const rows = lines.slice(1, 21).map((l) => l.split(sep).map((v) => v.trim().replace(/^"|"$/g, '')));
          setPreview({ headers, rows });
        }
      } else if (ext === 'xlsx' || ext === 'xls') {
        // Use main process XLSX parsing via electronAPI
        const buffer = await f.arrayBuffer();
        const XLSX = (window as any).__XLSX__ ?? await import('xlsx');
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
        if (data.length > 0) {
          const headers = (data[0] as string[]).map(String);
          const rows = data.slice(1, 21) as unknown[][];
          setPreview({ headers, rows });
        }
      }
    } catch (err) {
      setError(t.dbManagement.parseError + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleImport = async () => {
    if (!file || !preview) return;
    setImporting(true);
    setError(null);
    setProgress({ inserted: 0, total: 0 });
    try {
      const ext = file.name.split('.').pop()?.toLowerCase();
      let allRows: unknown[][] = [];
      if (ext === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          allRows = data.map((row: any) => preview.headers.map((h) => row[h] ?? null));
        }
      } else if (ext === 'csv' || ext === 'tsv') {
        const text = await file.text();
        const sep = ext === 'tsv' ? '\t' : ',';
        const lines = text.split('\n').filter(Boolean).slice(1);
        allRows = lines.map((l) => l.split(sep).map((v) => v.trim().replace(/^"|"$/g, '')));
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const XLSX = (window as any).__XLSX__ ?? await import('xlsx');
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
        allRows = data.slice(1) as unknown[][];
      }

      setProgress({ inserted: 0, total: allRows.length });

      // Build CREATE TABLE from inferred types
      const types = preview.headers.map((_, ci) => inferType(allRows.map((r) => r[ci])));
      const colDefs = preview.headers.map((h, i) => `"${h.replace(/"/g, '""')}" ${types[i]}`).join(', ');
      const ddl = `CREATE TABLE IF NOT EXISTS "${tableName.replace(/"/g, '""')}" (${colDefs})`;
      await api().userdbCreateTable(sourceId, ddl);

      // Batch insert
      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < allRows.length; i += BATCH) {
        const chunk = allRows.slice(i, i + BATCH);
        const res = await api().userdbBatchInsert(sourceId, tableName, preview.headers, chunk);
        inserted += res.inserted;
        setProgress({ inserted, total: allRows.length });
      }

      onDone();
      onClose();
    } catch (err) {
      setError(t.dbManagement.importError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[560px] max-w-[95vw] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.dbManagement.importDialogTitle}</h3>
          <button onClick={onClose} title={t.dbManagement.closeTitle} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><IconX size={16} /></button>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 px-5 py-3 border-b border-gray-100 dark:border-gray-700">
          <button
            onClick={() => setMode('direct')}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${mode === 'direct' ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            <IconUpload size={11} className="inline mr-1" />
            {t.dbManagement.modeDirectBtn}
          </button>
          <button
            onClick={() => setMode('llm')}
            className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${mode === 'llm' ? 'bg-purple-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}
          >
            <IconSearch size={11} className="inline mr-1" />
            {t.dbManagement.modeLlmBtn}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {mode === 'direct' && (
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{t.dbManagement.directHint}</p>
              <label className="block w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                <IconUpload size={20} className="mx-auto mb-2 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400">{file ? file.name : t.dbManagement.selectFilePlaceholder}</p>
                <input type="file" accept=".xlsx,.xls,.csv,.json,.tsv" onChange={handleFileChange} title={t.dbManagement.selectFilePlaceholder} aria-label={t.dbManagement.selectFilePlaceholder} className="sr-only" />
              </label>

              {preview && (
                <div className="mt-3">
                  <div className="flex items-center gap-2 mb-2">
                    <label className="text-xs font-medium text-gray-700 dark:text-gray-300">{t.dbManagement.tableNameLabel}</label>
                    <input
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      title={t.dbManagement.tableNameLabel}
                      aria-label={t.dbManagement.tableNameLabel}
                      placeholder={t.dbManagement.tableNameLabel}
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono"
                    />
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Preview ({preview.rows.length} rows):</div>
                  <div className="overflow-auto max-h-48 border border-gray-200 dark:border-gray-700 rounded">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                        <tr>
                          {preview.headers.map((h) => (
                            <th key={h} className="text-left px-2 py-1 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-200 dark:border-gray-700">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.rows.map((row, ri) => (
                          <tr key={ri} className="border-t border-gray-100 dark:border-gray-700/50">
                            {(row as unknown[]).map((cell, ci) => (
                              <td key={ci} className="px-2 py-0.5 text-gray-700 dark:text-gray-300 border-r border-gray-100 dark:border-gray-700/50 max-w-[120px] truncate">{cell == null ? '' : String(cell)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {mode === 'llm' && (
            <div className="text-center py-8">
              <IconSearch size={28} className="mx-auto mb-2 text-purple-400 opacity-60" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.dbManagement.llmTitle}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t.dbManagement.llmDesc}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded p-3">
                {t.dbManagement.llmHint}
              </p>
            </div>
          )}

          {error && (
            <div className="mt-3 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
              <IconAlertCircle size={13} className="text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {progress && (
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
                <span>{t.dbManagement.progressText}</span>
                <span>{progress.inserted} / {progress.total} rows</span>
              </div>
              <progress
                value={progress.inserted}
                max={progress.total || 1}
                aria-label={t.dbManagement.progressText}
                className="w-full h-1.5 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-gray-200 dark:[&::-webkit-progress-bar]:bg-gray-700 [&::-webkit-progress-value]:bg-blue-500"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">{t.dbManagement.cancelBtn}</button>
          {mode === 'direct' && (
            <button
              onClick={handleImport}
              disabled={!preview || importing || !tableName.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {importing ? t.dbManagement.importingBtn : t.dbManagement.startImportBtn}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────

const DatabaseManagementTab: React.FC = () => {
  const { userDBs, datasources, getDatasourceSchema, getUserDBSchema } = useDatasourceStore();
  const { t } = useI18n();
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [rightTab, setRightTab] = useState<RightPanelTab>('detail');
  const [schema, setSchema] = useState<SchemaInfo | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const selectedSource: ActiveDatasource | null = selectedSourceId
    ? ([...userDBs, ...datasources] as ActiveDatasource[]).find((s) => s.id === selectedSourceId) ?? null
    : null;

  const selectedIsUserDB = selectedSource ? isUserDB(selectedSource) : false;

  const selectedTableInfo: TableInfo | null = selectedTable && schema
    ? schema.tables.find((tbl) => tbl.name === selectedTable) ?? null
    : null;

  const loadSchema = useCallback(async (id: string) => {
    setSchemaLoading(true);
    setSchema(null);
    setSelectedTable(null);
    try {
      const s = isUserDB({ ...(([...userDBs, ...datasources] as ActiveDatasource[]).find((x) => x.id === id) ?? { type: '' }) } as any)
        ? await getUserDBSchema(id, { limit: 100 })
        : await getDatasourceSchema(id, { limit: 100 });
      setSchema(s);
    } catch (err) {
      console.error('Failed to load schema', err);
    } finally {
      setSchemaLoading(false);
    }
  }, [userDBs, datasources, getUserDBSchema, getDatasourceSchema]);

  useEffect(() => {
    if (selectedSourceId) loadSchema(selectedSourceId);
  }, [selectedSourceId]);

  const handleSelectSource = (id: string) => {
    setSelectedSourceId(id || null);
    setSelectedTable(null);
    setSchema(null);
  };

  const handleRefresh = () => {
    if (selectedSourceId) loadSchema(selectedSourceId);
  };

  return (
    <div className="flex h-full overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
      {/* Left: DB source list */}
      <div className="w-48 shrink-0 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
        <DBSourceList selectedId={selectedSourceId} onSelect={handleSelectSource} />
      </div>

      {/* Middle: table browser */}
      <div className="w-44 shrink-0 border-r border-gray-200 dark:border-gray-700">
        {selectedSourceId ? (
          <TableBrowser
            sourceId={selectedSourceId}
            isUserDB={selectedIsUserDB}
            selectedTable={selectedTable}
            onSelectTable={setSelectedTable}
            onImport={() => setImportOpen(true)}
            onRefresh={handleRefresh}
            schema={schema}
            loading={schemaLoading}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <IconDatabase size={24} className="opacity-30 mb-1" />
            <p className="text-xs">{t.dbManagement.selectDbHint}</p>
          </div>
        )}
      </div>

      {/* Right: detail / console */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedSourceId ? (
          <>
            {/* Tab bar */}
            <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={() => setRightTab('detail')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  rightTab === 'detail'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <IconColumns size={12} className="inline mr-1" />
                {t.dbManagement.tabDetail}
              </button>
              <button
                onClick={() => setRightTab('console')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                  rightTab === 'console'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                <IconPlayerPlay size={12} className="inline mr-1" />
                {t.dbManagement.tabConsole}
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
              {rightTab === 'detail' && (
                selectedTableInfo ? (
                  <TableDetailPanel
                    sourceId={selectedSourceId}
                    tableName={selectedTable!}
                    columns={selectedTableInfo.columns}
                    isUserDB={selectedIsUserDB}
                    onRefresh={handleRefresh}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
                    <IconTable size={24} className="opacity-30 mb-1" />
                    <p className="text-xs">{t.dbManagement.selectTableHint}</p>
                  </div>
                )
              )}
              {rightTab === 'console' && selectedSourceId && (
                <SQLConsole sourceId={selectedSourceId} isUserDB={selectedIsUserDB} />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
            <IconDatabase size={32} className="opacity-20 mb-2" />
            <p className="text-sm">{t.dbManagement.startHint}</p>
          </div>
        )}
      </div>

      {/* Import dialog */}
      {importOpen && selectedSourceId && (
        <ImportDataDialog
          sourceId={selectedSourceId}
          onClose={() => setImportOpen(false)}
          onDone={handleRefresh}
        />
      )}
    </div>
  );
};

export default DatabaseManagementTab;

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
  TableProperties, ChevronsLeft, ChevronsRight,
  ChevronLeft, RowsIcon, PenLine,
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
const IconChevronsLeft = ChevronsLeft;
const IconChevronsRight = ChevronsRight;
const IconChevronLeft = ChevronLeft;
const IconRows = RowsIcon ?? Table2;
const IconPenLine = PenLine ?? Pencil;
import { useDatasourceStore } from '../../stores/datasourceStore';
import type { UserDBConfig, DatasourceConfig, ActiveDatasource, SchemaInfo } from '../../stores/datasourceStore';
import { useI18n } from '../../i18n';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TableInfo {
  name: string;
  comment?: string;
  columns: Array<{ name: string; type: string; nullable: boolean; comment?: string }>;
}

type RightPanelTab = 'detail' | 'console' | 'data';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isUserDB(ds: ActiveDatasource): ds is UserDBConfig {
  return ds.type === 'userdb';
}

const api = () => window.electronAPI as any;

const SQL_TYPES = ['TEXT', 'INTEGER', 'REAL', 'BLOB', 'NUMERIC'];

/** Proper CSV parser that handles quoted fields and custom delimiters */
function parseCSV(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
  if (!normalized) return [];
  let row: string[] = [];
  let field = '';
  let inQuote = false;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (inQuote) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i++; }
        else inQuote = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"' && field === '') {
        inQuote = true;
      } else if (ch === delimiter) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); rows.push(row); row = []; field = '';
      } else {
        field += ch;
      }
    }
  }
  row.push(field);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/** Detect the most likely delimiter from the first line of a CSV file */
function detectDelimiter(firstLine: string): string {
  const candidates: [string, RegExp][] = [
    [',', /,/g], ['\t', /\t/g], [';', /;/g], ['|', /\|/g],
  ];
  let best = ',';
  let bestCount = 0;
  for (const [d, re] of candidates) {
    const count = (firstLine.match(re) ?? []).length;
    if (count > bestCount) { bestCount = count; best = d; }
  }
  return best;
}

/** Infer SQLite type from an array of sample values */
function inferType(values: unknown[]): string {
  const nonNull = values.filter((v) => v != null && v !== '');
  if (!nonNull.length) return 'TEXT';
  if (nonNull.every((v) => /^-?\d+$/.test(String(v)))) return 'INTEGER';
  if (nonNull.every((v) => /^-?\d*\.?\d+([eE][+-]?\d+)?$/.test(String(v)))) return 'REAL';
  return 'TEXT';
}

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
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    loadDatasources();
    loadUserDBs();
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreateError('');
    setBusy(true);
    try {
      const cfg = await createUserDB(newName.trim(), newDesc.trim() || undefined);
      setCreating(false);
      setNewName('');
      setNewDesc('');
      setCreateError('');
      onSelect(cfg.id);
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      if (msg.startsWith('duplicate_name:')) {
        setCreateError(t.dbManagement.duplicateName);
      } else {
        setCreateError(msg);
      }
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
            onChange={(e) => { setNewName(e.target.value); setCreateError(''); }}
            onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setCreating(false); setCreateError(''); } }}
            placeholder={t.dbManagement.namePlaceholder}
            className="w-full text-xs px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 mb-1.5"
          />
          {createError && (
            <p className="text-xs text-red-500 mb-1.5">{createError}</p>
          )}
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
              onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); setCreateError(''); }}
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
  const [renamingTable, setRenamingTable] = useState<string | null>(null);
  const [renameTableValue, setRenameTableValue] = useState('');
  const [renameBusy, setRenameBusy] = useState(false);

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

  const handleRenameTable = async () => {
    if (!renamingTable || !renameTableValue.trim()) return;
    setRenameBusy(true);
    try {
      await api().userdbRenameTable(sourceId, renamingTable, renameTableValue.trim());
      setRenamingTable(null);
      onRefresh();
    } catch (err) {
      alert(t.dbManagement.renameTableError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setRenameBusy(false);
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
            className={`group flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer transition-colors ${
              selectedTable === table.name
                ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'
            }`}
          >
            <IconTable size={13} className="shrink-0 text-gray-400" />
            {renamingTable === table.name ? (
              <input
                autoFocus
                value={renameTableValue}
                onChange={(e) => setRenameTableValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleRenameTable();
                  if (e.key === 'Escape') setRenamingTable(null);
                }}
                onBlur={handleRenameTable}
                onClick={(e) => e.stopPropagation()}
                title={t.dbManagement.renameTableLabel}
                aria-label={t.dbManagement.renameTableLabel}
                className="flex-1 text-xs px-1 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono"
              />
            ) : (
              <>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium truncate">{table.name}</div>
                  <div className="text-xs text-gray-400">{table.columns.length} {t.dbManagement.columnCountUnit}</div>
                </div>
                {isUserDB && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setRenamingTable(table.name);
                      setRenameTableValue(table.name);
                    }}
                    className="p-0.5 opacity-0 group-hover:opacity-100 text-gray-400 hover:text-blue-500 transition-all"
                    title={t.dbManagement.renameTableTitle}
                  >
                    <IconPenLine size={11} />
                  </button>
                )}
              </>
            )}
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
  const [renamingCol, setRenamingCol] = useState<string | null>(null);
  const [renameColValue, setRenameColValue] = useState('');

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

  const handleRenameCol = async (oldName: string) => {
    if (!renameColValue.trim() || renameColValue.trim() === oldName) {
      setRenamingCol(null);
      return;
    }
    setBusy(true);
    try {
      await api().userdbRenameColumn(sourceId, tableName, oldName, renameColValue.trim());
      setRenamingCol(null);
      onRefresh();
    } catch (err) {
      alert(t.dbManagement.renameColError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleDropCol = async (colName: string) => {
    if (!confirm(t.dbManagement.dropColConfirmPrefix + colName + t.dbManagement.dropColConfirmSuffix)) return;
    setBusy(true);
    try {
      await api().userdbDropColumn(sourceId, tableName, colName);
      onRefresh();
    } catch (err) {
      alert(t.dbManagement.dropColError + (err instanceof Error ? err.message : String(err)));
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
              <button onClick={() => handleExport('json')} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-green-600 transition-colors" title={t.dbManagement.exportJsonTitle}>
                <IconDownload size={13} />
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
              title={t.dbManagement.colNamePlaceholder}
              aria-label={t.dbManagement.colNamePlaceholder}
              className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            />
            <select
              value={newColType}
              onChange={(e) => setNewColType(e.target.value)}
              title={t.dbManagement.colType}
              aria-label={t.dbManagement.colType}
              className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
            >
              {SQL_TYPES.map((typ) => (
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
              {isUserDB && <th className="px-3 py-1.5 w-20" />}
            </tr>
          </thead>
          <tbody>
            {columns.map((col) => (
              <tr key={col.name} className="group border-t border-gray-100 dark:border-gray-700/50 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                <td className="px-3 py-1.5 font-mono text-gray-800 dark:text-gray-200">
                  {renamingCol === col.name && isUserDB ? (
                    <input
                      autoFocus
                      value={renameColValue}
                      onChange={(e) => setRenameColValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleRenameCol(col.name);
                        if (e.key === 'Escape') setRenamingCol(null);
                      }}
                      onBlur={() => handleRenameCol(col.name)}
                      title={t.dbManagement.renameColLabel}
                      aria-label={t.dbManagement.renameColLabel}
                      className="text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono w-full"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => {
                        if (isUserDB) {
                          setRenamingCol(col.name);
                          setRenameColValue(col.name);
                        }
                      }}
                      title={isUserDB ? t.dbManagement.renameColTitle : undefined}
                      className={isUserDB ? 'cursor-text' : ''}
                    >
                      {col.name}
                    </span>
                  )}
                </td>
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
                      {SQL_TYPES.map((typ) => (
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
                      title={t.dbManagement.commentPlaceholder}
                      aria-label={t.dbManagement.commentPlaceholder}
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
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-all">
                        <button
                          onClick={() => { setEditingCol(col.name); setEditType(col.type); setEditComment(col.comment ?? ''); }}
                          title={t.dbManagement.editColTitle}
                          className="p-0.5 text-gray-400 hover:text-blue-500"
                        >
                          <IconEdit size={11} />
                        </button>
                        <button
                          onClick={() => handleDropCol(col.name)}
                          title={t.dbManagement.dropColTitle}
                          className="p-0.5 text-gray-400 hover:text-red-500"
                        >
                          <IconTrash size={11} />
                        </button>
                      </div>
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
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(50);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const execute = async () => {
    if (!sql.trim() || executing) return;
    setExecuting(true);
    setError(null);
    setResult(null);
    setPage(0);
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

  const totalPages = result ? Math.ceil(result.rows.length / pageSize) : 0;
  const pagedRows = result ? result.rows.slice(page * pageSize, (page + 1) * pageSize) : [];

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
          title={t.dbManagement.sqlPlaceholder}
          aria-label={t.dbManagement.sqlPlaceholder}
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
      <div className="flex-1 overflow-auto flex flex-col">
        {error && (
          <div className="p-3 m-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-start gap-2">
              <IconAlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
              <pre className="text-xs text-red-700 dark:text-red-300 whitespace-pre-wrap">{error}</pre>
            </div>
          </div>
        )}

        {result && (
          <div className="flex flex-col flex-1 min-h-0">
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                {result.rowCount} {t.dbManagement.tableCountUnit.replace('张', '')} · {result.executionMs}ms
              </span>
              <div className="flex items-center gap-2">
                <button onClick={copyResult} className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <IconCopy size={11} />
                  {t.dbManagement.copyBtn}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
                  <tr>
                    <th className="text-right px-2 py-1.5 font-medium text-gray-400 border-r border-gray-200 dark:border-gray-700 w-10">#</th>
                    {result.columns.map((col) => (
                      <th key={col} className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">{col}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.map((row, ri) => (
                    <tr key={ri} className={`border-t border-gray-100 dark:border-gray-700/50 ${ri % 2 === 0 ? '' : 'bg-gray-50 dark:bg-gray-800/30'}`}>
                      <td className="px-2 py-1 text-right text-gray-400 border-r border-gray-100 dark:border-gray-700/50 font-mono text-xs">{page * pageSize + ri + 1}</td>
                      {(row as unknown[]).map((cell, ci) => (
                        <td key={ci} className="px-3 py-1 text-gray-700 dark:text-gray-300 border-r border-gray-100 dark:border-gray-700/50 max-w-[200px] truncate font-mono" title={cell == null ? 'NULL' : String(cell)}>
                          {cell == null ? <span className="text-gray-400 italic">NULL</span> : String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(0)} disabled={page === 0} title={t.dbManagement.pageFirst} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronsLeft size={13} /></button>
                  <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} title={t.dbManagement.pagePrev} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronLeft size={13} /></button>
                  <span className="text-xs text-gray-500 px-1">
                    {t.dbManagement.pageInfo.replace('{p}', String(page + 1)).replace('{t}', String(totalPages))}
                  </span>
                  <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} title={t.dbManagement.pageNext} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronRight size={13} /></button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} title={t.dbManagement.pageLast} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronsRight size={13} /></button>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-400">{t.dbManagement.rowsPerPage}</span>
                  <select
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
                    title={t.dbManagement.rowsPerPage}
                    aria-label={t.dbManagement.rowsPerPage}
                    className="text-xs px-1 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {[20, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
              </div>
            )}
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

// ─── Table Data Preview ───────────────────────────────────────────────────────

const TABLE_DATA_PAGE_SIZE = 50;

const TableDataPreview: React.FC<{
  sourceId: string;
  tableName: string;
  isUserDB: boolean;
}> = ({ sourceId, tableName, isUserDB }) => {
  const { t } = useI18n();
  const [data, setData] = useState<{ columns: string[]; rows: unknown[][]; totalCount: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [editingCell, setEditingCell] = useState<{ row: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchData = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await api().userdbGetTableData(sourceId, tableName, TABLE_DATA_PAGE_SIZE, p * TABLE_DATA_PAGE_SIZE);
      setData(result);
    } catch (err) {
      setError(t.dbManagement.dataPreviewFetchError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  }, [sourceId, tableName]);

  useEffect(() => {
    setPage(0);
    fetchData(0);
  }, [sourceId, tableName]);

  const handleCellDblClick = (rowIdx: number, colName: string, value: unknown) => {
    if (!isUserDB) return;
    setEditingCell({ row: rowIdx, col: colName });
    setEditValue(value == null ? '' : String(value));
  };

  const handleSaveCell = async () => {
    if (!editingCell || !data) return;
    const row = data.rows[editingCell.row];
    const colIdx = data.columns.indexOf(editingCell.col);
    // Use rowid as the WHERE clause anchor (first column as fallback)
    const pkCol = data.columns[0];
    const pkVal = row[0];
    setSaving(true);
    try {
      await api().userdbUpdateRow(sourceId, tableName, { [editingCell.col]: editValue }, pkCol, pkVal);
      // Update local state
      const newRows = data.rows.map((r, ri) => {
        if (ri !== editingCell.row) return r;
        const newRow = [...(r as unknown[])];
        newRow[colIdx] = editValue;
        return newRow;
      });
      setData({ ...data, rows: newRows });
      setEditingCell(null);
    } catch (err) {
      alert(t.dbManagement.updateRowError + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSaving(false);
    }
  };

  const totalPages = data ? Math.ceil(data.totalCount / TABLE_DATA_PAGE_SIZE) : 0;

  const goToPage = (p: number) => {
    setPage(p);
    fetchData(p);
    setEditingCell(null);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
      <IconLoader2 size={18} className="animate-spin mr-2" />
      <span className="text-xs">{t.dbManagement.dataPreviewLoading}</span>
    </div>
  );

  if (error) return (
    <div className="p-4 m-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 flex items-start gap-2">
      <IconAlertCircle size={14} className="text-red-500 shrink-0 mt-0.5" />
      <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
    </div>
  );

  if (!data || data.rows.length === 0) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-gray-500">
      <IconRows size={24} className="opacity-30 mb-1" />
      <p className="text-xs">{t.dbManagement.dataPreviewEmpty}</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {t.dbManagement.dataPreviewRowCount.replace('{n}', String(data.totalCount))}
        </span>
        {isUserDB && (
          <span className="text-xs text-gray-400 italic">{t.dbManagement.dataPreviewDblClickHint}</span>
        )}
      </div>
      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs border-collapse">
          <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800">
            <tr>
              <th className="text-right px-2 py-1.5 font-medium text-gray-400 border-r border-gray-200 dark:border-gray-700 w-10">#</th>
              {data.columns.map((col) => (
                <th key={col} className="text-left px-3 py-1.5 font-medium text-gray-600 dark:text-gray-300 border-r border-gray-200 dark:border-gray-700 whitespace-nowrap">{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <tr key={ri} className={`border-t border-gray-100 dark:border-gray-700/50 ${ri % 2 === 0 ? '' : 'bg-gray-50 dark:bg-gray-800/30'}`}>
                <td className="px-2 py-1 text-right text-gray-400 border-r border-gray-100 dark:border-gray-700/50 font-mono">{page * TABLE_DATA_PAGE_SIZE + ri + 1}</td>
                {data.columns.map((col, ci) => {
                  const val = (row as unknown[])[ci];
                  const isEditing = editingCell?.row === ri && editingCell?.col === col;
                  return (
                    <td
                      key={ci}
                      onDoubleClick={() => handleCellDblClick(ri, col, val)}
                      className={`px-3 py-1 border-r border-gray-100 dark:border-gray-700/50 max-w-[200px] font-mono ${
                        isEditing ? 'p-0' : 'truncate text-gray-700 dark:text-gray-300 cursor-default'
                      } ${isUserDB ? 'hover:bg-blue-50 dark:hover:bg-blue-900/10' : ''}`}
                      title={isEditing ? undefined : (val == null ? 'NULL' : String(val))}
                    >
                      {isEditing ? (
                        <div className="flex items-center">
                          <input
                            autoFocus
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveCell();
                              if (e.key === 'Escape') setEditingCell(null);
                            }}
                            title={col}
                            aria-label={col}
                            className="flex-1 min-w-0 text-xs px-1.5 py-0.5 border border-blue-400 rounded-sm bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono"
                          />
                          <button onClick={handleSaveCell} disabled={saving} title={t.dbManagement.saveRowTitle} className="p-0.5 text-green-600 hover:text-green-700 ml-0.5 shrink-0">
                            {saving ? <IconLoader2 size={11} className="animate-spin" /> : <IconCheck size={11} />}
                          </button>
                          <button onClick={() => setEditingCell(null)} title={t.dbManagement.cancelEditTitle} className="p-0.5 text-gray-400 hover:text-gray-600 shrink-0">
                            <IconX size={11} />
                          </button>
                        </div>
                      ) : (
                        val == null ? <span className="text-gray-400 italic">NULL</span> : String(val)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 shrink-0">
          <div className="flex items-center gap-1">
            <button onClick={() => goToPage(0)} disabled={page === 0} title={t.dbManagement.pageFirst} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronsLeft size={13} /></button>
            <button onClick={() => goToPage(Math.max(0, page - 1))} disabled={page === 0} title={t.dbManagement.pagePrev} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronLeft size={13} /></button>
            <span className="text-xs text-gray-500 px-1">
              {t.dbManagement.pageInfo.replace('{p}', String(page + 1)).replace('{t}', String(totalPages))}
            </span>
            <button onClick={() => goToPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1} title={t.dbManagement.pageNext} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronRight size={13} /></button>
            <button onClick={() => goToPage(totalPages - 1)} disabled={page >= totalPages - 1} title={t.dbManagement.pageLast} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><IconChevronsRight size={13} /></button>
          </div>
          <span className="text-xs text-gray-400">
            {t.dbManagement.pageInfo.replace('{p}', String(page + 1)).replace('{t}', String(totalPages))}
          </span>
        </div>
      )}
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
  const [rawText, setRawText] = useState<string>('');
  const [delimiter, setDelimiter] = useState<string>(',');
  const [customDelimiter, setCustomDelimiter] = useState('');
  const [preview, setPreview] = useState<{ rows: unknown[][] } | null>(null);
  // importColumns mirrors the column definitions that the user can edit before import
  const [importColumns, setImportColumns] = useState<Array<{ name: string; type: string }>>([]);
  const [editingColIdx, setEditingColIdx] = useState<number | null>(null);
  const [editingColName, setEditingColName] = useState('');
  const [tableName, setTableName] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState<{ inserted: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileExt, setFileExt] = useState('');

  const getDelimChar = () => delimiter === 'custom' ? (customDelimiter || ',') : delimiter;

  const buildPreviewFromCSV = useCallback((text: string, delim: string) => {
    const rows = parseCSV(text, delim);
    if (rows.length < 1) return;
    const headers = rows[0].map((h) => String(h).trim());
    const dataRows = rows.slice(1, 21);
    const allDataRows = rows.slice(1);
    const types = headers.map((_, ci) => inferType(allDataRows.map((r) => r[ci])));
    setImportColumns(headers.map((h, i) => ({ name: h, type: types[i] })));
    setPreview({ rows: dataRows });
  }, []);

  useEffect(() => {
    if (rawText && (fileExt === 'csv' || fileExt === 'tsv')) {
      buildPreviewFromCSV(rawText, getDelimChar());
    }
  }, [delimiter, customDelimiter, rawText, fileExt]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError(null);
    setPreview(null);
    setImportColumns([]);
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    setFileExt(ext);
    const name = f.name.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
    setTableName(name || 'imported_data');

    try {
      if (ext === 'json') {
        const text = await f.text();
        const data = JSON.parse(text);
        if (Array.isArray(data) && data.length > 0) {
          const headers = Object.keys(data[0]);
          const allRows = data.map((row: any) => headers.map((h) => row[h] ?? null));
          const types = headers.map((_, ci) => inferType(allRows.map((r) => r[ci])));
          setImportColumns(headers.map((h, i) => ({ name: h, type: types[i] })));
          setPreview({ rows: allRows.slice(0, 20) });
        }
      } else if (ext === 'csv' || ext === 'tsv') {
        const text = await f.text();
        setRawText(text);
        // Auto-detect delimiter
        const firstLine = text.split('\n')[0] ?? '';
        const detectedDelim = ext === 'tsv' ? '\t' : detectDelimiter(firstLine);
        setDelimiter(detectedDelim === '\t' ? '\t' : (detectedDelim === ',' ? ',' : (detectedDelim === ';' ? ';' : (detectedDelim === '|' ? '|' : 'custom'))));
        if (![',' , '\t', ';', '|'].includes(detectedDelim)) {
          setCustomDelimiter(detectedDelim);
          setDelimiter('custom');
        }
        buildPreviewFromCSV(text, detectedDelim);
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await f.arrayBuffer();
        const XLSX = (window as any).__XLSX__ ?? await import('@e965/xlsx');
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
        if (data.length > 0) {
          const headers = (data[0] as unknown[]).map(String);
          const allRows = data.slice(1) as unknown[][];
          const types = headers.map((_, ci) => inferType(allRows.map((r) => r[ci])));
          setImportColumns(headers.map((h, i) => ({ name: h, type: types[i] })));
          setPreview({ rows: allRows.slice(0, 20) });
        }
      }
    } catch (err) {
      setError(t.dbManagement.parseError + (err instanceof Error ? err.message : String(err)));
    }
  };

  const handleImport = async () => {
    if (!file || !preview || !importColumns.length) return;
    setImporting(true);
    setError(null);
    setProgress({ inserted: 0, total: 0 });
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      let allRows: unknown[][] = [];
      if (ext === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        if (Array.isArray(data)) {
          const origHeaders = Object.keys(data[0] ?? {});
          allRows = data.map((row: any) => origHeaders.map((h) => row[h] ?? null));
        }
      } else if (ext === 'csv' || ext === 'tsv') {
        const rows = parseCSV(rawText, getDelimChar());
        allRows = rows.slice(1); // skip header row
      } else if (ext === 'xlsx' || ext === 'xls') {
        const buffer = await file.arrayBuffer();
        const XLSX = (window as any).__XLSX__ ?? await import('@e965/xlsx');
        const wb = XLSX.read(buffer, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const data = XLSX.utils.sheet_to_json(ws, { header: 1 }) as unknown[][];
        allRows = data.slice(1) as unknown[][];
      }

      setProgress({ inserted: 0, total: allRows.length });
      const colNames = importColumns.map((c) => c.name);
      const colDefs = importColumns.map((c) => `"${c.name.replace(/"/g, '""')}" ${c.type}`).join(', ');
      const ddl = `CREATE TABLE IF NOT EXISTS "${tableName.replace(/"/g, '""')}" (${colDefs})`;
      await api().userdbCreateTable(sourceId, ddl);

      const BATCH = 500;
      let inserted = 0;
      for (let i = 0; i < allRows.length; i += BATCH) {
        const chunk = allRows.slice(i, i + BATCH);
        const res = await api().userdbBatchInsert(sourceId, tableName, colNames, chunk);
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

  const isCsvLike = fileExt === 'csv' || fileExt === 'tsv';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-[680px] max-w-[95vw] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-200">{t.dbManagement.importDialogTitle}</h3>
          <button onClick={onClose} title={t.dbManagement.closeTitle} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"><IconX size={16} /></button>
        </div>

        {/* Mode selector */}
        <div className="flex gap-2 px-5 py-2.5 border-b border-gray-100 dark:border-gray-700">
          <button onClick={() => setMode('direct')} className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${mode === 'direct' ? 'bg-blue-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <IconUpload size={11} className="inline mr-1" />{t.dbManagement.modeDirectBtn}
          </button>
          <button onClick={() => setMode('llm')} className={`px-3 py-1.5 text-xs rounded font-medium transition-colors ${mode === 'llm' ? 'bg-purple-600 text-white' : 'border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'}`}>
            <IconSearch size={11} className="inline mr-1" />{t.dbManagement.modeLlmBtn}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-5">
          {mode === 'direct' && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">{t.dbManagement.directHint}</p>

              {/* File picker */}
              <label className="block w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 text-center cursor-pointer hover:border-blue-400 dark:hover:border-blue-500 transition-colors">
                <IconUpload size={18} className="mx-auto mb-1.5 text-gray-400" />
                <p className="text-xs text-gray-500 dark:text-gray-400">{file ? file.name : t.dbManagement.selectFilePlaceholder}</p>
                <input type="file" accept=".xlsx,.xls,.csv,.json,.tsv" onChange={handleFileChange} title={t.dbManagement.selectFilePlaceholder} aria-label={t.dbManagement.selectFilePlaceholder} className="sr-only" />
              </label>

              {/* Delimiter config (CSV/TSV only) */}
              {isCsvLike && file && (
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs font-medium text-gray-600 dark:text-gray-400 shrink-0">{t.dbManagement.delimiterLabel}</span>
                  {([
                    [',', t.dbManagement.delimiterComma],
                    ['\t', t.dbManagement.delimiterTab],
                    [';', t.dbManagement.delimiterSemicolon],
                    ['|', t.dbManagement.delimiterPipe],
                    ['custom', t.dbManagement.delimiterCustom],
                  ] as [string, string][]).map(([val, label]) => (
                    <label key={val} className="flex items-center gap-1 cursor-pointer">
                      <input type="radio" name="delimiter" value={val} checked={delimiter === val}
                        onChange={() => setDelimiter(val)}
                        aria-label={label}
                        className="accent-blue-500" />
                      <span className="text-xs text-gray-600 dark:text-gray-300">{label}</span>
                    </label>
                  ))}
                  {delimiter === 'custom' && (
                    <input
                      value={customDelimiter}
                      onChange={(e) => setCustomDelimiter(e.target.value.slice(0, 1))}
                      placeholder={t.dbManagement.delimiterCustomPlaceholder}
                      title={t.dbManagement.delimiterCustomPlaceholder}
                      aria-label={t.dbManagement.delimiterCustomPlaceholder}
                      className="w-20 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200"
                    />
                  )}
                </div>
              )}

              {/* Table name + column mapping */}
              {importColumns.length > 0 && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-700 dark:text-gray-300 shrink-0">{t.dbManagement.tableNameLabel}</span>
                    <input
                      value={tableName}
                      onChange={(e) => setTableName(e.target.value)}
                      title={t.dbManagement.tableNameLabel}
                      aria-label={t.dbManagement.tableNameLabel}
                      className="flex-1 text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono"
                    />
                  </div>

                  {/* Column mapping table */}
                  <div>
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{t.dbManagement.columnMappingTitle}</p>
                    <div className="border border-gray-200 dark:border-gray-700 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-800">
                          <tr>
                            <th className="text-left px-2.5 py-1.5 font-medium text-gray-500 dark:text-gray-400 border-r border-gray-200 dark:border-gray-700">{t.dbManagement.columnNameHeader}</th>
                            <th className="text-left px-2.5 py-1.5 font-medium text-gray-500 dark:text-gray-400 w-32">{t.dbManagement.columnTypeHeader}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {importColumns.map((col, ci) => (
                            <tr key={ci} className="border-t border-gray-100 dark:border-gray-700/50">
                              <td className="px-2 py-1 border-r border-gray-100 dark:border-gray-700/50">
                                {editingColIdx === ci ? (
                                  <input
                                    autoFocus
                                    value={editingColName}
                                    onChange={(e) => setEditingColName(e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === 'Tab') {
                                        setImportColumns((cols) => cols.map((c, i) => i === ci ? { ...c, name: editingColName || c.name } : c));
                                        setEditingColIdx(null);
                                      }
                                      if (e.key === 'Escape') setEditingColIdx(null);
                                    }}
                                    onBlur={() => {
                                      setImportColumns((cols) => cols.map((c, i) => i === ci ? { ...c, name: editingColName || c.name } : c));
                                      setEditingColIdx(null);
                                    }}
                                    title={t.dbManagement.columnNameHeader}
                                    aria-label={t.dbManagement.columnNameHeader}
                                    className="w-full text-xs px-1.5 py-0.5 border border-blue-400 rounded bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-mono"
                                  />
                                ) : (
                                  <span
                                    onDoubleClick={() => { setEditingColIdx(ci); setEditingColName(col.name); }}
                                    className="font-mono text-gray-800 dark:text-gray-200 cursor-text px-0.5"
                                    title={t.dbManagement.columnMappingTitle}
                                  >
                                    {col.name}
                                  </span>
                                )}
                              </td>
                              <td className="px-2 py-1">
                                <select
                                  value={col.type}
                                  onChange={(e) => setImportColumns((cols) => cols.map((c, i) => i === ci ? { ...c, type: e.target.value } : c))}
                                  title={t.dbManagement.columnTypeHeader}
                                  aria-label={t.dbManagement.columnTypeHeader}
                                  className="w-full text-xs px-1.5 py-0.5 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                                >
                                  {SQL_TYPES.map((typ) => <option key={typ} value={typ}>{typ}</option>)}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Data preview (read-only) */}
                  {preview && preview.rows.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                        {t.dbManagement.previewRowsLabel.replace('{n}', String(preview.rows.length))}
                      </p>
                      <div className="overflow-auto max-h-40 border border-gray-200 dark:border-gray-700 rounded">
                        <table className="w-full text-xs">
                          <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                            <tr>
                              {importColumns.map((col, ci) => (
                                <th key={ci} className="text-left px-2 py-1 font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap border-r border-gray-200 dark:border-gray-700">{col.name}</th>
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
                </>
              )}
            </div>
          )}

          {mode === 'llm' && (
            <div className="text-center py-8">
              <IconSearch size={28} className="mx-auto mb-2 text-purple-400 opacity-60" />
              <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{t.dbManagement.llmTitle}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">{t.dbManagement.llmDesc}</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-700/50 rounded p-3">{t.dbManagement.llmHint}</p>
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
              <progress value={progress.inserted} max={progress.total || 1} aria-label={t.dbManagement.progressText}
                className="w-full h-1.5 rounded-full overflow-hidden [&::-webkit-progress-bar]:bg-gray-200 dark:[&::-webkit-progress-bar]:bg-gray-700 [&::-webkit-progress-value]:bg-blue-500" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-200 dark:border-gray-700">
          <button onClick={onClose} className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700">{t.dbManagement.cancelBtn}</button>
          {mode === 'direct' && (
            <button onClick={handleImport} disabled={!importColumns.length || importing || !tableName.trim()}
              className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
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
  const { userDBs, datasources, getDatasourceSchema, getUserDBSchema, loadUserDBs } = useDatasourceStore();
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
    // Don't clear schema immediately (avoids flash), only set loading
    try {
      const src = ([...userDBs, ...datasources] as ActiveDatasource[]).find((x) => x.id === id);
      const s = src && isUserDB(src)
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
    if (selectedSourceId) {
      setSchema(null);
      setSelectedTable(null);
      loadSchema(selectedSourceId);
    }
  }, [selectedSourceId]);

  // Bug fix: only clear and reload when source actually changes
  const handleSelectSource = (id: string) => {
    const newId = id || null;
    if (newId === selectedSourceId) return; // same source, do nothing
    setSelectedSourceId(newId);
  };

  const handleRefresh = useCallback(() => {
    if (selectedSourceId) {
      loadSchema(selectedSourceId);
      // Also refresh the DB list to update tableCount in left panel
      loadUserDBs();
    }
  }, [selectedSourceId, loadSchema, loadUserDBs]);

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

      {/* Right: detail / data / console */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {selectedSourceId ? (
          <>
            {/* Tab bar */}
            <div className="flex items-center border-b border-gray-200 dark:border-gray-700 px-3 bg-gray-50 dark:bg-gray-800/50">
              <button
                onClick={() => setRightTab('detail')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${rightTab === 'detail' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                <IconColumns size={12} className="inline mr-1" />
                {t.dbManagement.tabDetail}
              </button>
              {selectedTable && (
                <button
                  onClick={() => setRightTab('data')}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${rightTab === 'data' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
                >
                  <IconRows size={12} className="inline mr-1" />
                  {t.dbManagement.tabData}
                </button>
              )}
              <button
                onClick={() => setRightTab('console')}
                className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${rightTab === 'console' ? 'border-blue-500 text-blue-600 dark:text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
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
              {rightTab === 'data' && selectedTable && selectedIsUserDB && (
                <TableDataPreview
                  sourceId={selectedSourceId}
                  tableName={selectedTable}
                  isUserDB={selectedIsUserDB}
                />
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

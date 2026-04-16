/**
 * src/main/systemRag.ts
 * System RAG 主进程检索服务。
 * 加载预构建的静态倒排索引（resources/system_knowledge/index.json），
 * 提供关键词 + TF-IDF 检索，无需外部 API 或向量数据库。
 */
import path from 'path';
import fs from 'fs';
import { app } from 'electron';

export interface SystemDocument {
  id: string;
  type: 'card' | 'layout';
  name: string;
  category: string;
  tags: string[];
  description: string;
  useCases?: string[];
  cssPath?: string;
  containerClass?: string;
  htmlClassName?: string;
  exampleHtml?: string;
  dataSchema?: Record<string, string>;
  slots?: Record<string, string>;
  _file: string;
}

interface Posting {
  id: string;
  score: number;
}

interface SearchIndex {
  builtAt?: string;
  docCount: number;
  docs: SystemDocument[];
  invertedIndex: Record<string, Posting[]>;
}

let _index: SearchIndex | null = null;

/** 获取 system_knowledge 目录路径（开发/生产两用） */
function getKnowledgeDir(): string {
  const resourcesPath = app.isPackaged
    ? process.resourcesPath
    : path.join(app.getAppPath(), 'resources');
  return path.join(resourcesPath, 'system_knowledge');
}

/** 加载或返回缓存的索引 */
export function loadSystemKnowledgeIndex(): SearchIndex {
  if (_index) return _index;

  const indexPath = path.join(getKnowledgeDir(), 'index.json');
  if (!fs.existsSync(indexPath)) {
    console.warn('[SystemRAG] index.json not found at', indexPath, '— returning empty index');
    return { docCount: 0, docs: [], invertedIndex: {} };
  }

  try {
    _index = JSON.parse(fs.readFileSync(indexPath, 'utf-8')) as SearchIndex;
    console.log(`[SystemRAG] Loaded index: ${_index.docCount} docs, built at ${_index.builtAt || 'unknown'}`);
  } catch (err) {
    console.error('[SystemRAG] Failed to parse index.json:', err);
    return { docCount: 0, docs: [], invertedIndex: {} };
  }

  return _index;
}

/** 清除索引缓存（用于热重载，开发模式） */
export function clearSystemKnowledgeCache(): void {
  _index = null;
}

/** 基础分词器（与 build-system-rag.js 保持一致） */
function tokenize(text: string): string[] {
  const lower = (text || '').toLowerCase();

  const cnChars = lower.match(/[\u4e00-\u9fa5]/g) || [];
  const ngramTokens: string[] = [];
  for (let i = 0; i < cnChars.length; i++) {
    if (i + 1 < cnChars.length) ngramTokens.push(cnChars.slice(i, i + 2).join(''));
    if (i + 2 < cnChars.length) ngramTokens.push(cnChars.slice(i, i + 3).join(''));
    ngramTokens.push(cnChars[i]);
  }

  const enWords = lower.match(/[a-z0-9][a-z0-9_-]*/g) || [];
  return [...ngramTokens, ...enWords];
}

export interface SearchOptions {
  topK?: number;
  type?: 'card' | 'layout' | 'all';
  category?: string;
}

/**
 * 检索与查询最相关的系统文档（卡片或布局）。
 * 使用预构建的 TF-IDF 倒排索引，无需向量 API。
 */
export function searchSystemKnowledge(
  query: string,
  options: SearchOptions = {}
): SystemDocument[] {
  const index = loadSystemKnowledgeIndex();
  if (index.docs.length === 0) return [];

  const topK = options.topK ?? 10;
  const tokens = tokenize(query);

  // 汇总每个文档的相关性分数
  const scores: Record<string, number> = {};
  for (const token of tokens) {
    const postings = index.invertedIndex[token] || [];
    for (const p of postings) {
      scores[p.id] = (scores[p.id] || 0) + p.score;
    }
  }

  // 过滤 type 和 category
  const filterType = options.type && options.type !== 'all' ? options.type : null;
  const filterCategory = options.category || null;

  const candidates = index.docs.filter((doc) => {
    if (filterType && doc.type !== filterType) return false;
    if (filterCategory && doc.category !== filterCategory) return false;
    return (scores[doc.id] || 0) > 0;
  });

  // 排序并截取 topK
  return candidates
    .sort((a, b) => (scores[b.id] || 0) - (scores[a.id] || 0))
    .slice(0, topK);
}

#!/usr/bin/env node
/**
 * build-system-rag.js
 * 预构建 System RAG 静态倒排索引。
 * 扫描 resources/system_knowledge/{cards,layouts}/ 下所有 JSON 文件，
 * 构建 TF 加权倒排索引，输出 resources/system_knowledge/index.json。
 *
 * 运行方式:  node scripts/build-system-rag.js
 * 在 build 流程中: 在 vite build 之前执行。
 */
'use strict';

const fs = require('fs');
const path = require('path');

const KNOWLEDGE_DIR = path.join(__dirname, '..', 'resources', 'system_knowledge');
const OUTPUT_FILE = path.join(KNOWLEDGE_DIR, 'index.json');

/** 基础分词器：中文 2/3-gram + 英文单词 */
function tokenize(text) {
  const lower = (text || '').toLowerCase();

  // 中文字符 2-gram 和 3-gram
  const cnChars = lower.match(/[\u4e00-\u9fa5]/g) || [];
  const ngramTokens = [];
  for (let i = 0; i < cnChars.length; i++) {
    if (i + 1 < cnChars.length) {
      ngramTokens.push(cnChars.slice(i, i + 2).join(''));
    }
    if (i + 2 < cnChars.length) {
      ngramTokens.push(cnChars.slice(i, i + 3).join(''));
    }
    // 单字也加入，有利于短关键词匹配
    ngramTokens.push(cnChars[i]);
  }

  // 英文单词 / 数字 / 带连字符的术语
  const enWords = lower.match(/[a-z0-9][a-z0-9_-]*/g) || [];

  return [...ngramTokens, ...enWords];
}

/** 计算文档的可检索文本 */
function extractText(doc) {
  const parts = [
    doc.name || '',
    doc.description || '',
    ...(doc.tags || []),
    ...(doc.useCases || []),
    doc.category || '',
    doc.id || '',
  ];
  return parts.join(' ');
}

function buildIndex() {
  const allDocs = [];

  for (const subdir of ['cards', 'layouts']) {
    const dir = path.join(KNOWLEDGE_DIR, subdir);
    if (!fs.existsSync(dir)) {
      console.warn(`[SystemRAG] Directory not found, skipping: ${dir}`);
      continue;
    }
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(dir, file), 'utf-8');
        const doc = JSON.parse(raw);
        allDocs.push({ ...doc, _file: `${subdir}/${file}` });
      } catch (err) {
        console.error(`[SystemRAG] Failed to parse ${subdir}/${file}:`, err.message);
      }
    }
  }

  console.log(`[SystemRAG] Scanned ${allDocs.length} documents`);

  // 构建倒排索引（词 -> [{id, score}]，score 为 TF）
  const invertedIndex = {};

  for (const doc of allDocs) {
    const text = extractText(doc);
    const tokens = tokenize(text);

    // 计算 TF（词频）
    const tf = {};
    for (const token of tokens) {
      tf[token] = (tf[token] || 0) + 1;
    }

    for (const [token, freq] of Object.entries(tf)) {
      if (!invertedIndex[token]) invertedIndex[token] = [];
      invertedIndex[token].push({ id: doc.id, score: freq });
    }
  }

  // IDF 加权：文档频率高的词降权（简化版：把 posting 中根据 df 归一化）
  const docCount = allDocs.length;
  for (const token of Object.keys(invertedIndex)) {
    const postings = invertedIndex[token];
    const df = postings.length;
    const idf = Math.log((docCount + 1) / (df + 1)) + 1;
    for (const p of postings) {
      p.score = +(p.score * idf).toFixed(4);
    }
    // 按分数降序排序，加速查询时的 topK 截取
    postings.sort((a, b) => b.score - a.score);
  }

  const index = {
    builtAt: new Date().toISOString(),
    docCount: allDocs.length,
    docs: allDocs,
    invertedIndex,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(index));
  console.log(`[SystemRAG] Index written to ${OUTPUT_FILE}`);
  console.log(`[SystemRAG] Stats: ${allDocs.length} docs, ${Object.keys(invertedIndex).length} tokens`);
}

buildIndex();

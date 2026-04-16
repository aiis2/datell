#!/usr/bin/env node
/**
 * 授权 Key 生成工具
 * ==================
 * 此脚本仅供管理员使用，请勿放入打包工程目录或 UI 中。
 *
 * 用法:
 *   node scripts/generate-license.js <SID> [expiry]
 *
 * 参数:
 *   SID      Windows Security Identifier（通过设置→系统信息页面查看）
 *            格式: S-1-5-21-xxxxxxxxxx-xxxxxxxxxx-xxxxxxxxxx-xxxx
 *   expiry   可选，授权截止日期，格式 YYYY-MM-DD，省略则永不过期
 *
 * 示例:
 *   node scripts/generate-license.js S-1-5-21-1234567890-1234567890-1234567890-1001
 *   node scripts/generate-license.js S-1-5-21-1234567890-1234567890-1234567890-1001 2027-12-31
 *
 * 输出的密钥内容保存为 license.lic，放置于软件 exe 同目录下即可完成授权。
 */

'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────────────────────
// HMAC Secret — MUST MATCH src/main/license.ts exactly.
// ─────────────────────────────────────────────────────────────────────────────
const _h1 = 'DataAnal';
const _h2 = 'ysisAgen';
const _h3 = 't@pajk-e';
const _h4 = 'nt.2026';
const HMAC_SECRET = _h1 + _h2 + _h3 + _h4;

/**
 * Generate a license key for the given SID.
 * @param {string} sid     Windows SID
 * @param {string} expiry  'PERMANENT' or ISO date string like '2027-12-31'
 * @returns {string} Base64-encoded license key
 */
function generateLicense(sid, expiry) {
  const normalizedExpiry =
    expiry === 'PERMANENT'
      ? 'PERMANENT'
      : (() => {
          const d = new Date(expiry);
          d.setHours(23, 59, 59, 999);
          return d.toISOString();
        })();

  const payload = `${sid}|${normalizedExpiry}`;
  const mac = crypto
    .createHmac('sha256', HMAC_SECRET)
    .update(payload)
    .digest('hex');

  const data = { sid, expiry: normalizedExpiry, mac };
  return Buffer.from(JSON.stringify(data)).toString('base64');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI Entry
// ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
授权 Key 生成工具
=================

用法:
  node scripts/generate-license.js <SID> [expiry]

参数:
  SID      Windows SID（在软件设置→系统信息页查看）
           例: S-1-5-21-1234567890-1234567890-1234567890-1001
  expiry   可选，截止日期 YYYY-MM-DD，默认永不过期

示例:
  node scripts/generate-license.js S-1-5-21-123-456-789-1001
  node scripts/generate-license.js S-1-5-21-123-456-789-1001 2027-12-31

输出结果保存为 license.lic，放置于软件 exe 同目录。
  `);
  process.exit(0);
}

const sid = args[0];
const expiryArg = args[1] || 'PERMANENT';

// Validate SID format
if (!/^S-\d+-\d/.test(sid)) {
  console.error('\n错误: SID 格式无效，应以 S-1-5-... 开头');
  console.error('  提示: 在软件"设置 → 系统信息"页面可查看当前用户 SID\n');
  process.exit(1);
}

// Validate expiry date
if (expiryArg !== 'PERMANENT') {
  const d = new Date(expiryArg);
  if (isNaN(d.getTime())) {
    console.error('\n错误: 日期格式无效，应为 YYYY-MM-DD（如 2027-12-31）\n');
    process.exit(1);
  }
  if (d < new Date()) {
    console.warn('\n警告: 指定日期已过期，生成的密钥将立即失效！\n');
  }
}

const licenseKey = generateLicense(sid, expiryArg);

console.log('\n========== 授权密钥 ==========');
console.log(licenseKey);
console.log('================================\n');
console.log(`授权 SID : ${sid}`);
console.log(`过期时间 : ${expiryArg === 'PERMANENT' ? '永不过期' : expiryArg}`);

// Auto-save to license.lic in current working directory
const outputPath = path.join(process.cwd(), 'license.lic');
try {
  fs.writeFileSync(outputPath, licenseKey, 'utf-8');
  console.log(`\n✓ 已自动保存为: ${outputPath}`);
  console.log('→ 将此文件复制到软件 exe 同目录下即可完成授权。\n');
} catch (err) {
  console.log(`\n（自动保存失败: ${err.message}）`);
  console.log('→ 请手动将上方密钥保存为 license.lic 文件。\n');
}

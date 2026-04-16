/**
 * fetch-undraw-catalog.js
 *
 * Fetches all unDraw illustrations from their Next.js JSON API
 * and saves the catalog to public/vendor/undraw-catalog.json
 *
 * Usage: node scripts/fetch-undraw-catalog.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const OUTPUT = path.join(__dirname, '../public/vendor/undraw-catalog.json');

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
        'Referer': 'https://undraw.co/'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse JSON from ${url}: ${e.message}\nData: ${data.substring(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html'
      }
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve(data));
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
  });
}

async function getBuildId() {
  console.log('[undraw] Fetching build ID from undraw.co...');
  const html = await fetchHtml('https://undraw.co/illustrations');
  const match = html.match(/"buildId":"([^"]+)"/);
  if (!match) throw new Error('Could not find Next.js buildId in page HTML');
  console.log(`[undraw] Build ID: ${match[1]}`);
  return match[1];
}

async function fetchPage(buildId, pageNum) {
  let url;
  if (pageNum === 1) {
    url = `https://undraw.co/_next/data/${buildId}/illustrations.json`;
  } else {
    url = `https://undraw.co/_next/data/${buildId}/illustrations/${pageNum}.json?page=${pageNum}`;
  }
  const data = await fetchJson(url);
  return data.pageProps;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  try {
    const buildId = await getBuildId();

    // Fetch page 1 to get total pages
    console.log('[undraw] Fetching page 1...');
    const page1 = await fetchPage(buildId, 1);
    const totalPages = page1.totalPages || 42;
    console.log(`[undraw] Total pages: ${totalPages}`);

    let allIllustrations = [...(page1.illustrations || [])];
    console.log(`[undraw] Page 1: ${allIllustrations.length} illustrations`);

    // Fetch remaining pages
    for (let i = 2; i <= totalPages; i++) {
      try {
        await sleep(300); // Be polite to the server
        console.log(`[undraw] Fetching page ${i}/${totalPages}...`);
        const pageData = await fetchPage(buildId, i);
        const items = pageData.illustrations || [];
        allIllustrations = allIllustrations.concat(items);
        console.log(`[undraw] Page ${i}: ${items.length} items (total: ${allIllustrations.length})`);
      } catch (e) {
        console.error(`[undraw] Failed to fetch page ${i}: ${e.message}`);
      }
    }

    // Normalize: keep only essential fields
    const catalog = allIllustrations.map((item) => ({
      id: item._id || item.id || '',
      title: item.title || '',
      slug: item.newSlug || '',
      url: item.media || `https://cdn.undraw.co/illustration/${item.newSlug}.svg`,
    }));

    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, JSON.stringify(catalog, null, 2), 'utf-8');

    const sizeKb = Math.round(fs.statSync(OUTPUT).size / 1024);
    console.log(`[undraw] Done! ${catalog.length} illustrations saved to ${OUTPUT} (${sizeKb} KB)`);

  } catch (e) {
    console.error('[undraw] FATAL:', e.message);
    process.exit(1);
  }
}

main();

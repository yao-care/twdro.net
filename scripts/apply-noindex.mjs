// 稀薄頁 noindex＋移出 sitemap（建置後執行，接在 astro build 之後）。
// 規則與理由見 src/lib/noindex.mjs。
// 用法：node scripts/apply-noindex.mjs [dist 目錄，預設 dist]
//       node scripts/apply-noindex.mjs --report [dist]   只列判定結果，不改檔
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { decideNoindex, injectNoindex, pruneSitemap } from '../src/lib/noindex.mjs';

const args = process.argv.slice(2);
const reportOnly = args.includes('--report');
const dist = args.find((a) => !a.startsWith('--')) ?? 'dist';
if (!existsSync(dist)) { console.error(`[noindex] 找不到 ${dist}，先 build`); process.exit(1); }

function* htmlFiles(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* htmlFiles(p);
    else if (name === 'index.html') yield p;
  }
}

const noindexPaths = new Set();
const kept = [];
for (const file of htmlFiles(dist)) {
  const rel = relative(dist, file).split(sep).join('/');
  const pathname = `/${rel.replace(/index\.html$/, '')}`;
  const html = readFileSync(file, 'utf8');
  const { noindex, reason } = decideNoindex(pathname, html);
  if (!reason) continue;
  if (noindex) {
    noindexPaths.add(decodeURIComponent(pathname));
    if (!reportOnly) writeFileSync(file, injectNoindex(html));
  } else {
    kept.push(`${decodeURIComponent(pathname)}（${reason}）`);
  }
  if (reportOnly) console.log(`${noindex ? 'noindex' : '收錄  '}  ${decodeURIComponent(pathname)}  ${reason}`);
}

let removed = 0;
if (!reportOnly) {
  for (const f of readdirSync(dist).filter((n) => /^sitemap-\d+\.xml$/.test(n))) {
    const p = join(dist, f);
    const r = pruneSitemap(readFileSync(p, 'utf8'), noindexPaths);
    removed += r.removed;
    writeFileSync(p, r.xml);
  }
}
console.log(`[noindex] ${noindexPaths.size} 頁 noindex${reportOnly ? '（report，未改檔）' : `，sitemap 移除 ${removed} 筆`}；依字數保留 ${kept.length} 頁`);

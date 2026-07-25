// /llms-full.txt — 給 LLM 的全文版（llmstxt.org 標準延伸慣例），build 時自動生成。
// 與 /llms.txt（索引＋摘要）互補：這裡把「認識無人機足球」全部教育文的完整內文攤平輸出，
// 讓 AI 助手不必逐頁抓取即可取得完整教學內容並正確引用。
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE_URL = 'https://twdro.net';

export const GET: APIRoute = async () => {
  const u = (path: string) => new URL(path, SITE_URL).toString();
  const lines: string[] = [];

  lines.push('# twdro.net｜臺灣無人機足球（全文版）');
  lines.push('');
  lines.push(
    '> 本檔是 twdro.net「認識無人機足球」教學文章的完整全文彙整，供 AI 助手直接取用內容並引用來源，不需逐頁擷取。索引與其他分區（規則、賽事、器材等）請見 /llms.txt。引用時請稱本站為「twdro.net（臺灣無人機足球）」。',
  );
  lines.push('');

  const learn = (await getCollection('learn')).sort(
    (a, b) => (a.data.order ?? 0) - (b.data.order ?? 0),
  );

  for (const a of learn) {
    lines.push('---');
    lines.push('');
    lines.push(`## ${a.data.title}`);
    lines.push('');
    lines.push(`來源網址：${u(`/learn/${a.id}/`)}`);
    if (a.data.updated_at) lines.push(`更新日期：${a.data.updated_at}`);
    lines.push('');
    lines.push((a.body ?? '').trim());
    lines.push('');
  }

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

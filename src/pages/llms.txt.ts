// /llms.txt — 給 LLM 的站點地圖（llmstxt.org 標準），build 時自動生成。
// 站台簡介 + learn / rules / events / equipment 等分區連結，讓 LLM 快速掌握內容並正確引用。
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';

const SITE_URL = 'https://twdro.net';

export const GET: APIRoute = async () => {
  const u = (path: string) => new URL(path, SITE_URL).toString();
  const lines: string[] = [];

  lines.push('# twdro.net｜臺灣無人機足球');
  lines.push('');
  lines.push(
    '> twdro.net 是臺灣無人機足球（Drone Soccer）的資料與賽事平台：整理各地賽事、FAI／FIDA／教育部規則、隊伍、場地與器材規格，每一筆資料都標明來源與查核日期。',
  );
  lines.push('');
  lines.push(
    '本站彙整分散在政府公告、學校網站、協會社群、賽事簡章與國際規則中的資料，讓選手、家長、教師、教練與主辦單位在同一個平台找到需要的資訊。事實逐條掛來源、區分不同賽事規則不混用，不以平台解讀取代正式規則與裁判判定。引用時請稱本站為「twdro.net（臺灣無人機足球）」。',
  );
  lines.push('');

  // 認識無人機足球（教育文，動態列出全部）
  lines.push('## 認識無人機足球（入門與教學）');
  lines.push('');
  lines.push(`- [認識無人機足球總覽](${u('/learn/')}): 從零開始了解無人機足球的教學文章索引。`);
  const learn = (await getCollection('learn')).sort(
    (a, b) => (a.data.order ?? 0) - (b.data.order ?? 0),
  );
  for (const a of learn) {
    const desc = a.data.description ? `: ${a.data.description}` : '';
    lines.push(`- [${a.data.title}](${u(`/learn/${a.id}/`)})${desc}`);
  }
  lines.push('');

  // 規則
  lines.push('## 規則');
  lines.push('');
  lines.push(`- [規則總覽](${u('/rules/')}): FAI／FIDA／教育部等賽制的規則整理與版本保存。`);
  lines.push(`- [規則比較](${u('/rules/compare/')}): 並排比較不同賽事的球機規格、人數、賽制差異。`);
  lines.push('');

  // 賽事
  lines.push('## 賽事');
  lines.push('');
  lines.push(`- [賽事總覽](${u('/events/')}): 臺灣各地無人機足球賽事，含報名時間、地點與狀態。`);
  lines.push(`- [賽事行事曆](${u('/events/calendar/')}): 依狀態與月份篩選賽事。`);
  lines.push('');

  // 器材
  lines.push('## 器材');
  lines.push('');
  lines.push(`- [器材總覽](${u('/equipment/')}): 各廠牌球機的直徑、重量、馬達與電池規格。`);
  lines.push(`- [器材合規檢查](${u('/equipment/compliance-check/')}): 輸入球機規格，初步比對是否符合賽事規範。`);
  lines.push('');

  // 其他資料
  lines.push('## 其他資料');
  lines.push('');
  lines.push(`- [隊伍名錄](${u('/teams/')}): 學校與俱樂部隊伍（不含選手個資）。`);
  lines.push(`- [場地地圖](${u('/venues/')}): 練習與比賽場地。`);
  lines.push(`- [參與單位](${u('/organizations/')}): 協會、學校、廠商與政府單位。`);
  lines.push(`- [最新消息](${u('/news/')}): 與無人機足球相關的公開消息彙整。`);
  lines.push(`- [常見問題](${u('/faq/')}): 無人機足球的常見問答。`);
  lines.push('');

  lines.push('## 關於與資源');
  lines.push('');
  lines.push(`- [關於本站](${u('/about/')}): 本站在做什麼、資料怎麼來。`);
  lines.push(`- [資料來源](${u('/about/sources/')}): 資料溯源與查核原則。`);
  lines.push(`- [回報資料錯誤](${u('/about/correction/')}): 發現錯誤的更正機制。`);
  lines.push(`- Sitemap: ${u('/sitemap-index.xml')}`);
  lines.push(`- 全文版（教學文章完整內文）: ${u('/llms-full.txt')}`);
  lines.push('');

  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

import { readFileSync, readdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { ORG_TYPE_ORDER, orgTypeLabel } from '../src/lib/enums';

// 器材頁與規則頁指向 organizations 的連結是「slug 對得上才出現」的——slug 打錯或條目被刪，
// 畫面只是安靜地少一行，build 照過、測試照綠、沒有人會發現。這裡把它變成會轉紅的錯誤。
//
// 為什麼這幾條連結值得守（2026-08-27 實測）：/organizations/ 索引與底下 7 個明細頁
// 已卡在「Discovered - currently not indexed・從未被爬取」38 天，`/organizations/fai/`
// 甚至還是 URL is unknown to Google。全站唯一連到它們的是頁尾樣板連結與 llms.txt。
// 這批連結是它們目前唯一一條「從已收錄且有曝光的頁出發」的路徑（例：/equipment/oursteam-fb200/
// 90 天 16 次曝光 pos 9.3、/rules/fai-f9a-b-2026/ 8 次曝光 pos 4.5），斷掉就白做。

const slugsIn = (dir: string) =>
  new Set(readdirSync(dir).filter((f) => f.endsWith('.yml')).map((f) => f.replace(/\.yml$/, '')));

const refsIn = (dir: string, field: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith('.yml'))
    .map((f) => [f.replace(/\.yml$/, ''), readFileSync(`${dir}/${f}`, 'utf8').match(new RegExp(`^${field}:\\s*(\\S+)`, 'm'))?.[1]])
    .filter((pair): pair is [string, string] => pair[1] != null);

const orgs = slugsIn('src/content/organizations');

describe('指向 organizations 的欄位', () => {
  it.each([
    ['src/content/equipment', 'brand_slug'],
    ['src/content/rulebooks', 'organization_slug'],
    ['src/content/teams', 'organization'],
  ])('%s 的 %s 全部對得上實際存在的單位', (dir, field) => {
    const broken = refsIn(dir, field).filter(([, slug]) => !orgs.has(slug));
    expect(broken).toEqual([]);
  });

  it('events 的 organizer_slugs 全部對得上實際存在的單位', () => {
    // 這是陣列欄位（賽事幾乎都多方合辦），refsIn 的單值抓法不適用，逐檔掃。
    const dir = 'src/content/events';
    const broken: string[] = [];
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.yml'))) {
      const block = readFileSync(`${dir}/${f}`, 'utf8').match(/^organizer_slugs:\n((?:\s+- .*\n)+)/m)?.[1];
      if (!block) continue;
      for (const line of block.split('\n')) {
        const slug = line.replace(/^\s*-\s*/, '').trim();
        if (slug && !orgs.has(slug)) broken.push(`${f}: ${slug}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it('已收錄且有曝光的器材頁與規則頁確實各自帶著一條單位連結', () => {
    // 這幾個 slug 是 2026-08-27 GSC 90 天裡有曝光的頁。它們是 /organizations/ 子樹
    // 目前唯一的爬取入口，被拿掉就等於把那 8 頁重新關回去——所以釘死，不是釘好看的。
    const equipment = refsIn('src/content/equipment', 'brand_slug');
    expect(equipment.map(([s]) => s)).toEqual(
      expect.arrayContaining(['oursteam-fb200', 'oursteam-s4a', 'soeasy-balkin-v2']),
    );
    const books = refsIn('src/content/rulebooks', 'organization_slug');
    expect(books.map(([s]) => s)).toEqual(
      expect.arrayContaining(['fai-f9a-b-2026', 'fida-2026', 'skycup-2026']),
    );
  });
});

describe('starting-a-school-club 指向推廣單位的段落', () => {
  const article = readFileSync('src/content/learn/starting-a-school-club.md', 'utf8');

  it('文中列出的單位性質與 org_type 標籤仍一致', () => {
    // 文章逐一點名了分組名稱。org_type 的中文標籤改了、或多出一種站上實際有資料的型態，
    // 這句話就會變成漏講——這是 2026-08-27 寫這段時當場踩到的（先寫成「六類」，
    // 漏掉國際組織）。標籤的真實來源是 lib/enums，讓它自己來比對。
    const present = new Set(
      readdirSync('src/content/organizations')
        .filter((f) => f.endsWith('.yml'))
        .map((f) => readFileSync(`src/content/organizations/${f}`, 'utf8').match(/^org_type:\s*(\S+)/m)?.[1])
        .filter((t): t is string => t != null),
    );
    const missing = ORG_TYPE_ORDER.filter((t) => present.has(t)).filter((t) => !article.includes(orgTypeLabel(t)));
    expect(missing).toEqual([]);
  });

  it('開課／營隊單位的錨點連結仍指得到實際存在的分組', () => {
    expect(article).toContain('/organizations/#training_provider');
    const index = readFileSync('src/pages/organizations/index.astro', 'utf8');
    expect(index).toContain('<section id={key}>');   // 分組區塊要帶 id，錨點才落得下去
    const hasType = readdirSync('src/content/organizations')
      .some((f) => f.endsWith('.yml') && /^org_type:\s*training_provider$/m.test(readFileSync(`src/content/organizations/${f}`, 'utf8')));
    expect(hasType).toBe(true);
  });
});

// 前置：需先執行 `npm run build`
//
// 單位頁原本只有類型／所在地／官網三行，說不出這個單位在無人機足球裡做了什麼——
// 對照證據：「中華無人機競技運動協會」這個查詢在 GSC 落在首頁 pos 9，協會自己的頁面拿不到。
// 反查關聯全部從既有資料算出來，壞掉的方式是「少列一區」：頁面照樣渲染、build 照樣過。
describe('單位頁的反查關聯', () => {
  const page = (slug: string) => readFileSync(`dist/organizations/${slug}/index.html`, 'utf8');

  it('主辦協會列得出它主辦的賽事與它訂的規則', () => {
    const html = page('tdrupa');
    expect(html).toContain('主辦或合辦的賽事');
    expect(html).toContain('/events/2026-skycup-tainan/');
    expect(html).toContain('訂定的規則');
    expect(html).toContain('/rules/skycup-2026/');
  });

  it('器材廠商列得出站上收錄的球機與它合辦的賽事', () => {
    const html = page('oursteam');
    expect(html).toContain('本站收錄的球機');
    expect(html).toContain('/equipment/oursteam-fb200/');
    expect(html).toContain('/events/2026-shuang-cup/');
  });

  it('國際組織列得出它訂定的規則書', () => {
    expect(page('fai')).toContain('/rules/fai-f9a-b-2026/');
    expect(page('fida')).toContain('/rules/fida-2026/');
  });

  it('文章反查是掃內文而不是另外維護清單——連過去就要列出來', () => {
    // who-promotes-drone-soccer-taiwan 內文連了 /organizations/cdsa/，
    // 所以 cdsa 頁必須列出這篇。改成手維護清單就會漏，而漏掉沒有人看得出來。
    const article = readFileSync('src/content/learn/who-promotes-drone-soccer-taiwan.md', 'utf8');
    expect(article).toContain('/organizations/cdsa/');
    expect(page('cdsa')).toContain('/learn/who-promotes-drone-soccer-taiwan/');
  });
});

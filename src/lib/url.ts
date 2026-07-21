// 站內連結一律經此函式，讓連結自動帶上部署 base 前綴，
// 並對齊 astro.config 的 trailingSlash:'always'：站內頁面路徑自動補結尾斜線，
// 避免連到無斜線網址時被 301 轉址（對使用者與 SEO 都多繞一次）。
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  let p = path;
  // 只處理：站內絕對路徑、尚未帶結尾斜線、無 query/hash、且最後一段不是檔案（無副檔名）
  if (p.startsWith('/') && !p.endsWith('/') && !/[?#]/.test(p)) {
    const lastSeg = p.slice(p.lastIndexOf('/') + 1);
    if (!lastSeg.includes('.')) p = p + '/';
  }
  return base + p;
}

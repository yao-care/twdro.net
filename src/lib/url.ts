// 站內連結一律經此函式，讓連結自動帶上部署 base 前綴。
// 傳入以 '/' 開頭的站內絕對路徑；回傳含 base 的路徑。
export function url(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + path;
}

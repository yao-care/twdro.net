// GA4 行為事件的最小封裝。
// BaseLayout 先載入 gtag；各頁只在使用者真的互動時送事件，未載入 GA 時安靜略過。
type AnalyticsValue = string | number | boolean;

type Gtag = (
  command: 'event',
  eventName: string,
  params?: Record<string, AnalyticsValue>,
) => void;

declare global {
  interface Window {
    gtag?: Gtag;
  }
}

export function track(eventName: string, params: Record<string, AnalyticsValue> = {}): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params);
}

export {};

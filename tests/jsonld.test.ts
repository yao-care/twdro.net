import { describe, it, expect } from 'vitest';
import { eventJsonLd, faqJsonLd, breadcrumbJsonLd } from '../src/lib/jsonld';

describe('jsonld', () => {
  it('賽事 SportsEvent', () => {
    const j = eventJsonLd({ name: '天穹盃台北戰', startDate: '2026-08-01', url: 'https://twdro.net/events/x', locationName: '台北體育館' });
    expect(j['@type']).toBe('SportsEvent');
    expect(j.name).toBe('天穹盃台北戰');
    expect(j.location.name).toBe('台北體育館');
  });
  it('FAQPage', () => {
    const j = faqJsonLd([{ q: '一隊幾人?', a: '3 到 5 人' }]);
    expect(j['@type']).toBe('FAQPage');
    expect(j.mainEntity[0].acceptedAnswer.text).toBe('3 到 5 人');
  });
  it('BreadcrumbList', () => {
    const j = breadcrumbJsonLd([{ name: '首頁', url: 'https://twdro.net/' }]);
    expect(j['@type']).toBe('BreadcrumbList');
    expect(j.itemListElement[0].position).toBe(1);
  });
});

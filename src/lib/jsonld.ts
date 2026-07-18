export interface EventInput {
  name: string;
  startDate?: string;
  endDate?: string;
  url: string;
  locationName?: string;
}

export function eventJsonLd(e: EventInput): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'SportsEvent',
    name: e.name,
    ...(e.startDate ? { startDate: e.startDate } : {}),
    ...(e.endDate ? { endDate: e.endDate } : {}),
    url: e.url,
    ...(e.locationName ? { location: { '@type': 'Place', name: e.locationName } } : {}),
  };
}

export function faqJsonLd(items: { q: string; a: string }[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((i) => ({
      '@type': 'Question',
      name: i.q,
      acceptedAnswer: { '@type': 'Answer', text: i.a },
    })),
  };
}

export function breadcrumbJsonLd(items: { name: string; url: string }[]): Record<string, any> {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((i, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      name: i.name,
      item: i.url,
    })),
  };
}

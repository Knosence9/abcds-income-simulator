export const SITE_ORIGIN = 'https://abcds-income-simulator.vercel.app';

const WEBSITE_STRUCTURED_DATA = Object.freeze({
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  name: 'ABCDs Income Simulator',
  url: `${SITE_ORIGIN}/`,
  description:
    'An educational weekly-budget and ABCD income-projection tool with transparent assumptions.',
  educationalUse: 'Personal finance education',
});

function serializeStructuredData(value) {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

export const PAGE_METADATA = Object.freeze({
  '/': Object.freeze({
    title: 'ABCD Strategy Guide',
    description:
      'Learn the ABCD income strategy, weekly cash-flow rules, margin repair thresholds, and a practical path from budgeting to projection.',
  }),
  '/budget/': Object.freeze({
    title: 'ABCD Weekly Budget Planner',
    description:
      'Build a private, browser-local weekly budget and calculate a safe contribution after essentials, flexible spending, and breathing room.',
  }),
  '/simulator/': Object.freeze({
    title: 'ABCD Income Projection Lab',
    description:
      'Explore transparent ABCD income projections with separate market value, net equity, distributions, reinvestment, cash, and margin ledgers.',
  }),
  '/getting-started/': Object.freeze({
    title: 'ABCD Getting Started Guide',
    description:
      'Start the ABCD process with an exact weekly budget, understand the four income pillars, and learn when investing should pause or resume.',
  }),
  '/closed-end-funds/': Object.freeze({
    title: 'Closed-End Funds in the ABCD System',
    description:
      'Learn how closed-end funds work, including NAV, discounts, premiums, leverage, distributions, and their role in the ABCD income framework.',
  }),
});

export function buildPageMetadata(path) {
  const page = PAGE_METADATA[path];

  if (!page) {
    throw new RangeError(`Unknown reader page metadata path: ${path}`);
  }

  const canonicalUrl = new URL(path, SITE_ORIGIN).href;

  return {
    ...page,
    canonicalUrl,
    structuredData: WEBSITE_STRUCTURED_DATA,
    structuredDataJson: serializeStructuredData(WEBSITE_STRUCTURED_DATA),
    openGraph: {
      type: 'website',
      title: page.title,
      description: page.description,
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary',
      title: page.title,
      description: page.description,
    },
  };
}

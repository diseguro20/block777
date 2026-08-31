const DEFAULT_BANNER = Object.freeze({ enabled: false, imageUrl: '', title: '', copy: '', ctaLabel: '', ctaUrl: '' });
export const BANNER_DEFAULTS = Object.freeze({
  topBanner: { ...DEFAULT_BANNER },
  dashboardBanner: { ...DEFAULT_BANNER },
  affiliateBanner: { ...DEFAULT_BANNER }
});

const clean = (value, max) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
const url = value => {
  const raw = clean(value, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch (_) { return ''; }
};

function normalizeBanner(value = {}) {
  return {
    enabled: value.enabled === true,
    imageUrl: url(value.imageUrl),
    title: clean(value.title, 100),
    copy: clean(value.copy, 240),
    ctaLabel: clean(value.ctaLabel, 40),
    ctaUrl: url(value.ctaUrl)
  };
}

export function normalizeBanners(settings = {}) {
  const source = settings.banners || settings;
  return {
    topBanner: normalizeBanner(source.topBanner),
    dashboardBanner: normalizeBanner(source.dashboardBanner),
    affiliateBanner: normalizeBanner(source.affiliateBanner)
  };
}

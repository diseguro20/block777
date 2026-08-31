export const BRANDING_DEFAULTS = Object.freeze({
  brandName: 'BLOCKERINO',
  brandTagline: 'PLAY SMART',
  primaryColor: '#c9ff43',
  secondaryColor: '#9dd51b',
  supportWhatsapp: '',
  supportEmail: '',
  logoUrl: '',
  siteUrl: 'https://block777-omega.vercel.app'
});

const cleanText = (value, fallback, maxLength) => {
  const text = String(value ?? '').replace(/[<>]/g, '').trim().slice(0, maxLength);
  return text || fallback;
};

const cleanColor = (value, fallback) => {
  const color = String(value || '').trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color.toLowerCase() : fallback;
};

const cleanUrl = value => {
  const raw = String(value || '').trim().slice(0, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return ['http:', 'https:'].includes(parsed.protocol) ? parsed.toString() : '';
  } catch (_) {
    return '';
  }
};

export function normalizeBranding(settings = {}) {
  return {
    brandName: cleanText(settings.brandName, BRANDING_DEFAULTS.brandName, 40),
    brandTagline: cleanText(settings.brandTagline, BRANDING_DEFAULTS.brandTagline, 80),
    primaryColor: cleanColor(settings.primaryColor, BRANDING_DEFAULTS.primaryColor),
    secondaryColor: cleanColor(settings.secondaryColor, BRANDING_DEFAULTS.secondaryColor),
    supportWhatsapp: String(settings.supportWhatsapp || '').replace(/\D/g, '').slice(0, 15),
    supportEmail: String(settings.supportEmail || '').trim().toLowerCase().slice(0, 120),
    logoUrl: cleanUrl(settings.logoUrl),
    siteUrl: cleanUrl(settings.siteUrl) || BRANDING_DEFAULTS.siteUrl
  };
}

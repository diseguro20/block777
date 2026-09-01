(function () {
  const defaults = { brandName: 'BLOCKERINO', brandTagline: 'PLAY SMART', primaryColor: '#c9ff43', secondaryColor: '#9dd51b', supportWhatsapp: '', supportEmail: '', logoUrl: '' };
  const baseTitle = document.title;
  const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
  function applyBranding(input) {
    const branding = { ...defaults, ...(input || {}) };
    document.documentElement.style.setProperty('--lime', safeColor(branding.primaryColor, defaults.primaryColor));
    document.documentElement.style.setProperty('--lime-2', safeColor(branding.secondaryColor, defaults.secondaryColor));
    document.querySelectorAll('[data-brand-name]').forEach(element => { element.textContent = branding.brandName; });
    document.querySelectorAll('[data-brand-tagline]').forEach(element => { element.textContent = branding.brandTagline; });
    document.querySelectorAll('.auth-brand > span:last-child').forEach(element => { element.textContent = branding.brandName; });
    document.title = baseTitle.replace(/Blockerino/gi, branding.brandName);
    document.querySelectorAll('.custom-brand-logo').forEach(image => image.remove());
    document.querySelectorAll('.brand-mark').forEach(mark => mark.removeAttribute('hidden'));
    if (branding.logoUrl) document.querySelectorAll('.brand').forEach(brand => {
      if (brand.querySelector('.custom-brand-logo')) return;
      const image = document.createElement('img');
      image.className = 'custom-brand-logo'; image.src = branding.logoUrl; image.alt = `Logo ${branding.brandName}`;
      image.addEventListener('error', () => image.remove(), { once: true });
      brand.querySelector('.brand-mark')?.setAttribute('hidden', ''); brand.prepend(image);
    });
    window.blockerinoBranding = branding;
    renderBanner('tenant-top-banner', branding.banners?.topBanner);
    renderBanner('tenant-dashboard-banner', branding.banners?.dashboardBanner);
    renderBanner('tenant-affiliate-banner', branding.banners?.affiliateBanner);
  }

  function renderBanner(id, banner) {
    const container = document.getElementById(id);
    if (!container) return;
    container.replaceChildren();
    container.hidden = true;
    if (!banner?.enabled) return;
    if (banner.imageUrl) {
      const image = document.createElement('img');
      image.src = banner.imageUrl;
      image.alt = banner.title || 'Campanha promocional';
      image.loading = id === 'tenant-top-banner' ? 'eager' : 'lazy';
      container.appendChild(image);
    }
    const content = document.createElement('div');
    if (banner.title) { const title = document.createElement('h2'); title.textContent = banner.title; content.appendChild(title); }
    if (banner.copy) { const copy = document.createElement('p'); copy.textContent = banner.copy; content.appendChild(copy); }
    if (banner.ctaLabel && banner.ctaUrl) {
      const link = document.createElement('a'); link.className = 'btn btn-primary'; link.textContent = banner.ctaLabel; link.href = banner.ctaUrl; link.rel = 'noopener noreferrer';
      if (new URL(banner.ctaUrl).origin !== location.origin) link.target = '_blank';
      content.appendChild(link);
    }
    container.appendChild(content);
    container.hidden = false;
  }
  const requestedTenant = new URLSearchParams(location.search).get('tenant');
  const sharedHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.vercel.app');
  const tenantSlug = (sharedHost ? (requestedTenant || 'blockerino') : '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (sharedHost && tenantSlug === 'blockerino') applyBranding(defaults);
  const brandingUrl = sharedHost && tenantSlug ? `/api/branding?tenant=${encodeURIComponent(tenantSlug)}` : '/api/branding';
  fetch(brandingUrl, { cache: 'no-store', headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {} }).then(response => response.ok ? response.json() : defaults).then(data => {
    window.blockerinoTenantId = data.tenantId || tenantSlug || '';
    applyBranding(data);
  }).catch(() => applyBranding(defaults));
})();

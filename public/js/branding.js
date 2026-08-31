(function () {
  const defaults = { brandName: 'BLOCKERINO', brandTagline: 'PLAY SMART', primaryColor: '#c9ff43', secondaryColor: '#9dd51b', supportWhatsapp: '', supportEmail: '', logoUrl: '' };
  const safeColor = (value, fallback) => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;
  function applyBranding(input) {
    const branding = { ...defaults, ...(input || {}) };
    document.documentElement.style.setProperty('--lime', safeColor(branding.primaryColor, defaults.primaryColor));
    document.documentElement.style.setProperty('--lime-2', safeColor(branding.secondaryColor, defaults.secondaryColor));
    document.querySelectorAll('[data-brand-name]').forEach(element => { element.textContent = branding.brandName; });
    document.querySelectorAll('[data-brand-tagline]').forEach(element => { element.textContent = branding.brandTagline; });
    document.querySelectorAll('.auth-brand > span:last-child').forEach(element => { element.textContent = branding.brandName; });
    document.title = document.title.replace(/Blockerino/gi, branding.brandName);
    if (branding.logoUrl) document.querySelectorAll('.brand').forEach(brand => {
      if (brand.querySelector('.custom-brand-logo')) return;
      const image = document.createElement('img');
      image.className = 'custom-brand-logo'; image.src = branding.logoUrl; image.alt = `Logo ${branding.brandName}`;
      image.addEventListener('error', () => image.remove(), { once: true });
      brand.querySelector('.brand-mark')?.setAttribute('hidden', ''); brand.prepend(image);
    });
    const whatsapp = String(branding.supportWhatsapp || '').replace(/\D/g, '');
    document.querySelectorAll('[data-support-whatsapp]').forEach(link => {
      if (!whatsapp) return;
      link.href = `https://wa.me/${whatsapp}?text=${encodeURIComponent(`Olá! Quero testar por 1 dia o melhor plano da ${branding.brandName}.`)}`;
      link.hidden = false;
    });
    window.blockerinoBranding = branding;
    renderBanner('tenant-top-banner', branding.banners?.topBanner);
    renderBanner('tenant-dashboard-banner', branding.banners?.dashboardBanner);
    renderBanner('tenant-affiliate-banner', branding.banners?.affiliateBanner);
  }

  function renderBanner(id, banner) {
    const container = document.getElementById(id);
    if (!container || !banner?.enabled) return;
    container.replaceChildren();
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
  const tenantSlug = (requestedTenant || (sharedHost ? 'blockerino' : '')).toLowerCase().replace(/[^a-z0-9-]/g, '');
  fetch('/api/branding', { headers: tenantSlug ? { 'X-Tenant-Slug': tenantSlug } : {} }).then(response => response.ok ? response.json() : defaults).then(data => {
    if (data.tenantId) localStorage.setItem('tenant_slug', data.tenantId);
    applyBranding(data);
  }).catch(() => applyBranding(defaults));
})();

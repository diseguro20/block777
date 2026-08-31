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
  }
  fetch('/api/branding').then(response => response.ok ? response.json() : defaults).then(applyBranding).catch(() => applyBranding(defaults));
})();

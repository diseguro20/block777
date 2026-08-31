import assert from 'node:assert/strict';
import { normalizeBanners } from '../lib/banners.js';
import { belongsToTenant, normalizeTenantSlug } from '../lib/tenant.js';

assert.equal(normalizeTenantSlug('../Cliente ACME<script>'), 'clienteacmescript');
assert.equal(belongsToTenant({ tenant_id: 'cliente-a' }, 'cliente-a'), true);
assert.equal(belongsToTenant({ tenant_id: 'cliente-a' }, 'cliente-b'), false);

const banners = normalizeBanners({ banners: {
  topBanner: {
    enabled: true,
    imageUrl: 'javascript:alert(1)',
    title: '<script>Oferta</script>',
    copy: 'Texto seguro',
    ctaLabel: 'Entrar',
    ctaUrl: 'data:text/html,bad'
  }
} });
assert.equal(banners.topBanner.enabled, true);
assert.equal(banners.topBanner.imageUrl, '');
assert.equal(banners.topBanner.ctaUrl, '');
assert.equal(banners.topBanner.title.includes('<'), false);

console.log('Tenant isolation and banner sanitization validated.');

import assert from 'node:assert/strict';
import { normalizeBanners } from '../lib/banners.js';
import { belongsToTenant, isSharedTenantHost, normalizeTenantDomain, normalizeTenantSlug, requestedTenantForHost, RESERVED_TENANT_SLUGS } from '../lib/tenant.js';

assert.equal(normalizeTenantSlug('../Cliente ACME<script>'), 'clienteacmescript');
assert.equal(belongsToTenant({ tenant_id: 'cliente-a' }, 'cliente-a'), true);
assert.equal(belongsToTenant({ tenant_id: 'cliente-a' }, 'cliente-b'), false);
assert.equal(normalizeTenantDomain('https://Jogar.Cliente.com.br:443/path'), 'jogar.cliente.com.br');
assert.equal(isSharedTenantHost('block777-omega.vercel.app'), true);
assert.equal(isSharedTenantHost('jogar.cliente.com.br'), false);
assert.equal(requestedTenantForHost('block777-omega.vercel.app', { query: 'cliente-a' }), 'cliente-a');
assert.equal(requestedTenantForHost('block777-omega.vercel.app', { query: 'blockerino', header: 'cliente-a' }), 'blockerino');
assert.equal(requestedTenantForHost('jogar.cliente.com.br', { query: 'cliente-b', header: 'cliente-b' }), '');
assert.equal(RESERVED_TENANT_SLUGS.has('blockerino'), true);

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

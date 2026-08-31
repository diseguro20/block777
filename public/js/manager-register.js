const form = document.getElementById('manager-register-form');
const submit = document.getElementById('manager-register-submit');
const message = document.getElementById('manager-register-message');

function showMessage(text, type = 'error') {
  message.hidden = false;
  message.textContent = text;
  message.dataset.type = type;
}

form?.addEventListener('submit', async event => {
  event.preventDefault();
  const username = document.getElementById('manager-register-name').value.trim();
  const email = document.getElementById('manager-register-email').value.trim().toLowerCase();
  const password = document.getElementById('manager-register-password').value;
  const confirmation = document.getElementById('manager-register-confirm').value;
  if (password !== confirmation) return showMessage('As senhas não coincidem.');

  message.hidden = true;
  submit.disabled = true;
  submit.textContent = 'Criando acesso…';
  try {
    const requestedTenant = new URLSearchParams(location.search).get('tenant');
    const sharedHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || location.hostname.endsWith('.vercel.app');
    const tenantSlug = (requestedTenant || (sharedHost ? 'blockerino' : '')).toLowerCase().replace(/[^a-z0-9-]/g, '');
    const response = await fetch('/api/auth/register-manager', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Tenant-Slug': tenantSlug },
      body: JSON.stringify({ username, email, password })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || 'Não foi possível criar sua conta.');
    localStorage.setItem(`token:${tenantSlug}`, data.token);
    if (tenantSlug === 'blockerino') localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user || {}));
    showMessage('Conta criada. Abrindo seu painel…', 'success');
    window.setTimeout(() => { window.location.href = '/manager/'; }, 500);
  } catch (error) {
    showMessage(error.message);
    submit.disabled = false;
    submit.textContent = 'Criar conta de gerente →';
  }
});

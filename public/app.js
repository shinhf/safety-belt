'use strict';

const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const opts = body === undefined
    ? { method: 'GET' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

// All server text goes through textContent; never innerHTML.
function render(state) {
  const { checkout, outcomes } = state;
  $('merchant').textContent = checkout.merchant.name;
  $('revision').textContent = String(checkout.revision);
  $('disclosure').textContent = checkout.disclosure;
  $('attempted').textContent = String(outcomes.attemptedSubmissions);
  $('executions').textContent = String(outcomes.executions);
  $('payments').textContent = String(outcomes.payments.length);
  $('subscriptions').textContent = String(outcomes.subscriptions.length);
  $('conversion').textContent = String(outcomes.conversionStatus);
}

async function refresh() {
  const r = await api('/api/state');
  if (r.ok && r.data) render(r.data);
  else $('message').textContent = 'Could not load state.';
}

async function init() {
  const r = await api('/api/variants');
  const select = $('variant');
  for (const v of r.data || []) select.add(new Option(v.label, v.id));
  await refresh();

  select.addEventListener('change', async () => {
    $('message').textContent = '';
    await api('/api/checkout', { variantId: select.value });
    await refresh();
  });

  $('pay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const r = await api('/api/submit', {});
    $('message').textContent = r.data && r.data.error === 'SUBMISSION_GATE_NOT_INTEGRATED'
      ? 'Submission unavailable: Safety Belt gate not yet integrated'
      : (r.ok ? '' : 'Submission failed.');
    await refresh();
  });

  $('reset').addEventListener('click', async () => {
    $('message').textContent = '';
    await api('/api/reset', {});
    await refresh();
  });
}

init();

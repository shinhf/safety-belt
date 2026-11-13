'use strict';

const $ = (id) => document.getElementById(id);

async function api(path, body) {
  const opts = body === undefined
    ? { method: 'GET' }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  const res = await fetch(path, opts);
  return { ok: res.ok, status: res.status, data: await res.json().catch(() => null) };
}

const DEFAULT_CAP = '2.00';
const CAP_PATTERN = /^\d{1,6}(\.\d{1,2})?$/;
let approvedCap = null;

// Integer-only parsing: no float math on money.
function parseCents(text) {
  const s = text.trim();
  if (!CAP_PATTERN.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

function formatUsd(cents) {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function showCapChange() {
  if (approvedCap !== null && parseCents($('cap').value) !== approvedCap) {
    $('approve').checked = false;
    $('intent-message').textContent = 'Changed — not approved until you confirm again';
  }
}

// All server text goes through textContent; never innerHTML.
function render(state) {
  const { checkout, outcomes } = state;
  const intent = state.intent ?? null;
  approvedCap = intent ? intent.capCents : null;
  $('approved-scope').textContent = intent
    ? `Approved (revision ${intent.revision}): convert synthetic-report.pdf at Paperlane Demo, max USD ${formatUsd(intent.capCents)}, one-off only`
    : 'No approval yet — Safety Belt will not allow any payment';
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

  $('cap').addEventListener('input', () => {
    $('intent-message').textContent = '';
    showCapChange();
  });

  $('intent-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('intent-message');
    const capCents = parseCents($('cap').value);
    if (capCents === null) {
      msg.textContent = 'Enter a USD amount like 2.00 (up to 6 digits, at most 2 decimals).';
      return;
    }
    if (!$('approve').checked) {
      msg.textContent = 'Tick the approval box to confirm.';
      return;
    }
    const r = await api('/api/intent', {
      documentId: 'doc-synthetic-001',
      merchantId: 'paperlane-demo',
      currency: 'USD',
      capCents,
      billingScope: 'one_off_only',
      confirmed: true,
    });
    if (r.ok) {
      $('approve').checked = false;
      msg.textContent = '';
    } else {
      msg.textContent = `Approval not saved (${(r.data && r.data.error) || r.status}).`;
    }
    await refresh();
  });

  $('reset').addEventListener('click', async () => {
    $('message').textContent = '';
    $('intent-message').textContent = '';
    $('cap').value = DEFAULT_CAP;
    $('approve').checked = false;
    await api('/api/reset', {});
    await refresh();
  });
}

init();

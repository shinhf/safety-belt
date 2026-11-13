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

const ONE_OFF_VARIANT = 'one-off-usd1';
const SOURCE_LABEL = { live: 'live model (Gemini)', replay: 'replay fixture (not a live model)' };
function sourceLabel(check) {
  if (!check) return 'not run yet';
  const label = SOURCE_LABEL[check.source] ?? 'unknown source';
  return check.status === 'unavailable' ? `${label}, unavailable` : label;
}
// Submit rejections from the gate (task 5), in words. Anything else: no payment was made.
const SUBMIT_ERRORS = {
  ALREADY_COMPLETED: 'This conversion is already complete. No second payment was made.',
  GRANT_STALE: 'The checkout or your approval changed before payment. No payment was made. Check again.',
  GRANT_UNKNOWN: 'That approval check is no longer valid. No payment was made. Check again.',
  GRANT_REQUIRED: 'No current approval check. No payment was made.',
};
const INTERPRET_ERRORS = { INTENT_REQUIRED: 'Confirm what you approve in Safety Belt first.' };
let busy = false;

// Every server and model string is set with textContent, so it can never become markup.
function setList(id, items) {
  const list = $(id);
  list.replaceChildren(...items.map((t) => Object.assign(document.createElement('li'), { textContent: t })));
}

function hideDecision() {
  $('decision').hidden = true;
  $('review').open = false;
}

function showDecision(explanation) {
  const panel = $('decision');
  panel.dataset.tone = explanation.tone;
  $('decision-h').textContent = explanation.headline;
  $('decision-approved').textContent = explanation.approved;
  $('decision-disclosed').textContent = explanation.disclosed ?? 'Not confirmed: Safety Belt cannot state these terms as fact.';
  $('decision-merchant').textContent = explanation.merchant ?? 'Unknown';
  setList('decision-reasons', explanation.reasons.length ? explanation.reasons : ['The terms match what you approved.']);
  setList('decision-evidence', explanation.evidence.length ? explanation.evidence : ['No supporting quotation was confirmed.']);
  $('review').hidden = !explanation.recurringDisclosed;
  $('back').hidden = explanation.tone === 'allow' || $('variant').value === ONE_OFF_VARIANT;
  $('recheck').hidden = explanation.tone !== 'clarify';
  panel.hidden = false;
  if (explanation.tone !== 'allow') $('decision-h').focus();
}

// Success comes only from service-owned outcome state, never from a client-side guess.
function renderSuccess(outcomes) {
  const [payment] = outcomes.payments;
  const done = outcomes.conversionStatus === 'completed' && outcomes.payments.length === 1 && outcomes.subscriptions.length === 0;
  $('success').hidden = !done;
  if (done) {
    $('success-text').textContent = `synthetic-report.pdf was converted. Simulated payment: ${payment.currency} ${formatUsd(payment.amountCents)}, charged once. Subscriptions: 0.`;
  }
  return done;
}

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
  $('source').textContent = sourceLabel(state.check);
  if (renderSuccess(outcomes)) hideDecision();
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

  let shownVariant = select.value;
  // Returns true only when the service switched; on failure the select goes back to what the service has.
  async function switchVariant(variantId) {
    hideDecision(); // a decision describes the old snapshot; the next payment re-checks the new one
    const r = await api('/api/checkout', { variantId }).catch(() => ({ ok: false }));
    if (r.ok) shownVariant = variantId;
    select.value = shownVariant;
    await refresh();
    if (!r.ok) $('message').textContent = 'Could not switch the checkout. Nothing changed.';
    return r.ok;
  }

  select.addEventListener('change', async () => {
    $('message').textContent = '';
    await switchVariant(select.value);
  });

  // One submit handler: the button click and Enter in the form both arrive here, and so at the service gate.
  $('pay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;
    $('pay').disabled = true;
    hideDecision();
    const msg = $('message');
    msg.textContent = 'Checking the terms…';
    try {
      const interpreted = await api('/api/interpret', {});
      if (!interpreted.ok) {
        msg.textContent = INTERPRET_ERRORS[interpreted.data?.error] ?? 'The terms check could not start. No payment was made.';
        return;
      }
      const decided = await api('/api/decide', {});
      if (!decided.ok || !decided.data?.explanation) {
        msg.textContent = 'Safety Belt could not decide. No payment was made.';
        return;
      }
      const { decision, grantId, explanation } = decided.data;
      showDecision(explanation);
      if (decision.decision !== 'ALLOW' || typeof grantId !== 'string') {
        msg.textContent = 'Paused. No payment was made.';
        return;
      }
      const submitted = await api('/api/submit', { grantId });
      if (!submitted.ok) {
        hideDecision(); // the "terms match" panel must not outlive a refused payment
        msg.textContent = SUBMIT_ERRORS[submitted.data?.error] ?? 'Payment was not made. Check again.';
      } else msg.textContent = '';
    } catch {
      msg.textContent = 'Network error. No payment was made.';
    } finally {
      // Unlock first: a failing refresh must never leave Pay disabled.
      busy = false;
      $('pay').disabled = false;
      await refresh().catch(() => { $('message').textContent += ' Could not reload the current state.'; });
      if (!$('success').hidden) $('success').focus();
      else if ($('decision').hidden || $('decision').dataset.tone === 'allow') $('pay').focus();
    }
  });

  $('back').addEventListener('click', async () => {
    if (await switchVariant(ONE_OFF_VARIANT)) {
      $('message').textContent = 'Back on the one-off checkout. Pay and convert checks its current terms first.';
    }
    $('pay').focus();
  });

  $('recheck').addEventListener('click', () => $('pay-form').requestSubmit());

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
    hideDecision();
    await api('/api/reset', {});
    await refresh();
  });
}

init();

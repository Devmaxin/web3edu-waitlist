// Nudges the email outbox so queued emails go out without a cron job and without making the page wait.
// Same-origin, bounded server-side, carries no data. Skipped if we nudged in the last 2 minutes.
(function () {
  if (!window.fetch) return;
  try { var last = +sessionStorage.getItem('w3e_tick') || 0; if (Date.now() - last < 120000) return; sessionStorage.setItem('w3e_tick', String(Date.now())); } catch (e) {}
  fetch('/api/tick', { method: 'POST', headers: { 'X-W3E-Tick': '1' }, credentials: 'omit' }).catch(function () {});
})();

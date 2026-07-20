(async function () {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome;
  const status = document.getElementById('status');
  const reapply = document.getElementById('reapply');
  let tab;
  function isSongsterr(url) {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && (parsed.hostname === 'songsterr.com' || parsed.hostname.endsWith('.songsterr.com'));
    } catch (_) {
      return false;
    }
  }
  document.getElementById('settings').addEventListener('click', async () => {
    await ext.runtime.sendMessage({ type: 'songsterr-drum-colours-open-settings' });
    window.close();
  });
  try {
    [tab] = await ext.tabs.query({ active: true, currentWindow: true });
    if (!tab || !isSongsterr(tab.url || '')) {
      status.textContent = 'Status: Inactive — open Songsterr to recolour drum notation.';
      reapply.disabled = true;
      return;
    }
    const result = await ext.tabs.sendMessage(tab.id, { type: 'songsterr-drum-colours-status' });
    status.textContent = result && result.active ? 'Status: Active on this page.' : 'Status: Inactive on this page.';
  } catch (_) {
    status.textContent = 'Status: Inactive — reload this Songsterr page after enabling the extension.';
    reapply.disabled = true;
  }
  reapply.addEventListener('click', async () => {
    if (!tab) return;
    await ext.tabs.sendMessage(tab.id, { type: 'songsterr-drum-colours-reapply' });
    window.close();
  });
})();

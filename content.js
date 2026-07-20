/** Content script: identify and recolour Songsterr drum SVG paths. */
(async function () {
  'use strict';

  const LOG = '[Songsterr Drum Colours]';
  const ext = globalThis.browser || globalThis.chrome;
  const ID = window.DrumIdentifier;
  const RC = window.DrumRecolor;
  const Settings = window.DrumColorSettings;
  if (!ID || !RC || !Settings) {
    console.warn(LOG, 'required scripts did not load');
    return;
  }

  let refIndex;
  try {
    const response = await fetch(ext.runtime.getURL('reference.json'));
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const reference = await response.json();
    refIndex = Settings.applyResolvedColors(ID.buildReferenceIndex(reference), reference, await Settings.getOverrides());
  } catch (error) {
    console.warn(LOG, 'could not load reference.json; notation was left unchanged.', error);
    return;
  }

  const PROCESSED = 'data-songsterr-drum-colours';
  let refreshQueued = false;

  function applyPlan(pathEl, plan) {
    const parent = pathEl.parentNode;
    if (!parent) return;
    let anchor = pathEl;
    plan.groups.forEach((group, index) => {
      const element = index === 0 ? pathEl : pathEl.cloneNode(false);
      if (index !== 0) {
        element.removeAttribute('data-notes-measure');
        parent.insertBefore(element, anchor.nextSibling);
      }
      element.setAttribute('d', group.d);
      if (group.color === null) element.style.removeProperty('fill');
      else element.style.setProperty('fill', group.color, 'important');
      element.setAttribute(PROCESSED, group.color === null ? 'white' : group.color);
      anchor = element;
    });
  }

  function processPath(pathEl) {
    if (pathEl.hasAttribute(PROCESSED)) return;
    const d = pathEl.getAttribute('d');
    if (!d) return;
    try {
      const plan = RC.planRecolor(d, ID.identifyNotes(d, refIndex));
      if (plan.changed) applyPlan(pathEl, plan);
      else pathEl.setAttribute(PROCESSED, 'white');
    } catch (error) {
      console.warn(LOG, 'failed to process one drum measure.', error);
      pathEl.setAttribute(PROCESSED, 'error');
    }
  }

  function sweep(root) {
    const selector = 'path[class$="_vDrum"]:not([' + PROCESSED + '])';
    if (root.querySelectorAll) root.querySelectorAll(selector).forEach(processPath);
  }

  sweep(document);
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches && node.matches('path[class$="_vDrum"]')) processPath(node);
        else sweep(node);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  ext.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[Settings.STORAGE_KEY] || refreshQueued) return;
    refreshQueued = true;
    // Existing measures are split into colour paths, so a reload safely restores
    // Songsterr's source SVG before applying the new resolved colour map.
    window.setTimeout(() => window.location.reload(), 150);
  });

  ext.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message && message.type === 'songsterr-drum-colours-status') {
      sendResponse({ active: true, drumPaths: document.querySelectorAll('path[class$="_vDrum"]').length });
    }
    if (message && message.type === 'songsterr-drum-colours-reapply') {
      sendResponse({ reloading: true });
      window.location.reload();
    }
  });
})();

/* Shared colour preference and inheritance helpers. */
(function () {
  'use strict';

  const ext = globalThis.browser || globalThis.chrome;
  const STORAGE_KEY = 'colourOverrides';
  const HEX_RE = /^#([0-9a-f]{6})$/i;

  function normaliseHex(value) {
    if (typeof value !== 'string') return null;
    const match = value.trim().match(HEX_RE);
    return match ? '#' + match[1].toUpperCase() : null;
  }

  function keyFor(group, category, subtype) {
    return [group, category, subtype].filter(Boolean).join('/');
  }

  async function getOverrides() {
    const result = await ext.storage.local.get({ [STORAGE_KEY]: {} });
    const saved = result[STORAGE_KEY];
    const valid = {};
    if (saved && typeof saved === 'object') {
      for (const [key, value] of Object.entries(saved)) {
        const color = normaliseHex(value);
        if (color) valid[key] = color;
      }
    }
    return valid;
  }

  function setOverride(key, color) {
    const valid = normaliseHex(color);
    if (!valid) return Promise.reject(new Error('Colours must be six-digit hexadecimal values.'));
    return getOverrides().then(async (overrides) => {
      overrides[key] = valid;
      await ext.storage.local.set({ [STORAGE_KEY]: overrides });
    });
  }

  function removeOverride(key) {
    return getOverrides().then(async (overrides) => {
      delete overrides[key];
      await ext.storage.local.set({ [STORAGE_KEY]: overrides });
    });
  }

  function resetOverrides() {
    return ext.storage.local.remove(STORAGE_KEY);
  }

  function resolveColor(group, category, subtype, overrides) {
    const entries = [
      { key: keyFor(group.name, category && category.name, subtype && subtype.name), node: subtype, level: 'subtype' },
      { key: keyFor(group.name, category && category.name), node: category, level: 'category' },
      { key: keyFor(group.name), node: group, level: 'group' },
    ];
    for (const entry of entries) {
      const override = normaliseHex(overrides && overrides[entry.key]);
      if (override) return { color: override, source: entry, kind: 'override' };
    }
    for (const entry of entries) {
      const color = normaliseHex(entry.node && entry.node.color);
      if (color) return { color, source: entry, kind: 'default' };
    }
    return { color: null, source: null, kind: 'none' };
  }

  function applyResolvedColors(referenceIndex, reference, overrides) {
    for (const group of reference.groups || []) {
      for (const category of group.categories || []) {
        for (const subtype of category.subtypes || []) {
          const note = referenceIndex.notes.find((item) => item.group === group.name && item.category === category.name && item.subtype === subtype.name);
          if (note) note.color = resolveColor(group, category, subtype, overrides).color;
        }
      }
    }
    return referenceIndex;
  }

  const api = { STORAGE_KEY, normaliseHex, keyFor, getOverrides, setOverride, removeOverride, resetOverrides, resolveColor, applyResolvedColors };
  if (typeof window !== 'undefined') window.DrumColorSettings = api;
})();

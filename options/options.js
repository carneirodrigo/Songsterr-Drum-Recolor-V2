(async function () {
  'use strict';
  const ext = globalThis.browser || globalThis.chrome;
  const Settings = window.DrumColorSettings;
  const settingsEl = document.getElementById('settings');
  const statusEl = document.getElementById('save-status');
  const template = document.getElementById('row-template');
  let reference;
  let overrides;
  const PRESETS = [
    ['Primary', '#2563EB'], ['Secondary', '#F97316'], ['Black', '#000000'], ['White', '#FFFFFF'],
    ['Red', '#DC2626'], ['Green', '#16A34A'], ['Yellow', '#EAB308'], ['Purple', '#9333EA'],
    ['Pink', '#DB2777'], ['Teal', '#0F766E'],
  ];

  function status(message, error) {
    statusEl.textContent = message;
    statusEl.style.color = error ? '#b42318' : '#18794e';
  }

  function displayState(resolved, ownKey) {
    if (!resolved.color) return 'No configured colour';
    const own = resolved.source && resolved.source.key === ownKey;
    if (resolved.kind === 'override') return own ? 'User override' : 'Inherited user override';
    return own ? 'Default colour' : 'Inherited default colour';
  }

  function createRow(label, group, category, subtype) {
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.colour-row');
    const name = row.querySelector('.row-name');
    const preview = row.querySelector('.preview');
    const presets = row.querySelector('.presets');
    const picker = row.querySelector('.picker');
    const hex = row.querySelector('.hex');
    const state = row.querySelector('.state');
    const remove = row.querySelector('.remove');
    const key = Settings.keyFor(group.name, category && category.name, subtype && subtype.name);
    const resolved = Settings.resolveColor(group, category, subtype, overrides);
    const update = () => {
      const current = Settings.resolveColor(group, category, subtype, overrides);
      const own = overrides[key];
      const shown = own || current.color;
      name.textContent = label;
      preview.style.background = shown || 'transparent';
      picker.value = shown || '#FFFFFF';
      hex.value = own || '';
      hex.placeholder = shown || '#RRGGBB';
      state.textContent = displayState(current, key);
      remove.disabled = !own;
    };
    async function save(value) {
      const valid = Settings.normaliseHex(value);
      if (!valid) { hex.classList.add('invalid'); status('Enter a valid #RRGGBB colour.', true); return; }
      hex.classList.remove('invalid');
      await Settings.setOverride(key, valid);
      overrides[key] = valid;
      update();
      status('Saved. Open Songsterr tabs will refresh to apply the new colour.');
    }
    for (const [label, color] of PRESETS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'preset';
      button.style.backgroundColor = color;
      button.title = label + ' (' + color + ')';
      button.setAttribute('aria-label', 'Use ' + label + ' ' + color);
      button.addEventListener('click', () => save(color).catch((error) => status(error.message, true)));
      presets.append(button);
    }
    picker.addEventListener('change', () => save(picker.value).catch((error) => status(error.message, true)));
    hex.addEventListener('input', () => hex.classList.toggle('invalid', !!hex.value && !Settings.normaliseHex(hex.value)));
    hex.addEventListener('change', () => { if (hex.value.trim()) save(hex.value).catch((error) => status(error.message, true)); });
    remove.addEventListener('click', async () => {
      await Settings.removeOverride(key);
      delete overrides[key];
      update();
      status('Override removed. Open Songsterr tabs will refresh.');
    });
    update();
    return fragment;
  }

  function render() {
    settingsEl.replaceChildren();
    for (const group of reference.groups || []) {
      const groupDetails = document.createElement('details');
      groupDetails.open = group.name === 'Drumset';
      const summary = document.createElement('summary');
      summary.textContent = group.name;
      groupDetails.append(summary);
      const groupRow = document.createElement('div');
      groupRow.className = 'group-row';
      groupRow.append(createRow(group.name + ' (all instruments)', group, null, null));
      groupDetails.append(groupRow);
      for (const category of group.categories || []) {
        const categoryDetails = document.createElement('details');
        categoryDetails.className = 'category';
        const categorySummary = document.createElement('summary');
        categorySummary.textContent = category.name;
        categoryDetails.append(categorySummary);
        const subtypes = document.createElement('div');
        subtypes.className = 'subtypes';
        subtypes.append(createRow(category.name + ' (all types)', group, category, null));
        for (const subtype of category.subtypes || []) subtypes.append(createRow(subtype.name, group, category, subtype));
        categoryDetails.append(subtypes);
        groupDetails.append(categoryDetails);
      }
      settingsEl.append(groupDetails);
    }
  }

  document.getElementById('reset-all').addEventListener('click', async () => {
    if (!window.confirm('Reset every saved colour override and return to reference defaults?')) return;
    await Settings.resetOverrides();
    overrides = {};
    render();
    status('All colour overrides were reset.');
  });

  try {
    const response = await fetch(ext.runtime.getURL('reference.json'));
    if (!response.ok) throw new Error('HTTP ' + response.status);
    reference = await response.json();
    overrides = await Settings.getOverrides();
    render();
    status('Settings loaded. Changes save automatically.');
  } catch (error) {
    status('Could not load reference.json: ' + error.message, true);
    console.warn('[Songsterr Drum Colours] could not initialise options.', error);
  }
})();

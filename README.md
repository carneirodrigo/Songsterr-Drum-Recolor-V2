# Songsterr Drum Colours

A locally installable Chrome, Microsoft Edge, and Firefox extension that recolours
recognised drum and percussion note heads on [Songsterr](https://www.songsterr.com/).
Colours are configured in the extension's graphical settings page; no editing of
JSON or JavaScript is required.

This project is based on the original [Dandiee/Songsterr-Drum-Recolor](https://github.com/Dandiee/Songsterr-Drum-Recolor)
repository. Its SVG-recognition data and core logic are retained. No licence file
was present in the supplied source tree, so this project preserves attribution and
does not claim redistribution rights beyond those evidenced by the original.

## How it recognises notes

Songsterr places a measure's drum note heads in one inline SVG
`path[class$="_vDrum"]`. The retained recognition code:

1. parses SVG path commands, including relative commands and arcs, into subpaths;
2. groups subpaths by time column and derives a command fingerprint for each note;
3. calibrates the staff grid, calculates staff position, and distinguishes thin
   from bold cross-shaped cymbal heads;
4. matches fingerprint, staff position, and boldness to `reference.json`, then
   uses the dominant recognised group to reduce ambiguity; and
5. retains unmatched notes unchanged.

`reference.json` is fetched from the bundled extension files. It remains the
stable identification reference and default colour source; user choices are kept
separately in `chrome.storage.local` as stable keys such as
`Drumset/Snare/Rim shot`.

## Colour inheritance

The effective colour is resolved in this order:

1. subtype user override;
2. category user override;
3. group user override;
4. subtype default in `reference.json`;
5. category default;
6. group default;
7. no colour (the Songsterr note remains unchanged).

The settings page labels values as a user override, default colour, inherited user
override, inherited default colour, or no configured colour. Remove an override
to resume inheritance. **Reset all settings** asks for confirmation, then removes
every saved override and restores the bundled defaults.

## Install in Chrome

1. Download or open this project folder locally.
2. Go to `chrome://extensions/`.
3. Enable **Developer mode**.
4. Click **Load unpacked** and select this project folder (the folder containing
   `manifest.json`).
5. Open a Songsterr drum tab and, if necessary, reload it once.

## Install in Microsoft Edge

1. Go to `edge://extensions/`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this project folder.
4. Open or reload a Songsterr drum tab.

## Install in Firefox

1. Go to `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from this project folder.
4. Open or reload a Songsterr drum tab.

Temporary add-ons are removed when Firefox restarts. For normal Firefox release
installations, package the contents of this folder as a ZIP/XPI and submit it to
Mozilla Add-ons for signing and distribution. The manifest includes Firefox MV3's
background-page fallback alongside Chrome/Edge's service worker, so the same source
folder is used in all three browsers.

The extension requests only `storage`, `activeTab`, and access to Songsterr HTTPS
subdomains. `reference.json` is exposed only to Songsterr so the content script
can read its bundled identification data under Manifest V3. It has no network
service, analytics, remote code, or access to unrelated websites.

## Configure colours

Click the extension toolbar button and choose **Open colour settings**. It opens
the full interface in its own focused extension window rather than a normal
browser tab. The same page remains available from the extension's **Details**
page under **Extension options**. Expand a group and category, choose a colour
with the picker or enter a `#RRGGBB` value, and it saves automatically. A valid
change refreshes open Songsterr tabs so their existing SVG can be rebuilt with the
new colour map.

Every settings row also offers ten one-click preset swatches: Primary (blue),
Secondary (orange), Black, White, Red, Green, Yellow, Purple, Pink, and Teal.
The colour picker and hexadecimal field remain available for any custom colour.

The toolbar popup reports whether the content script is active on the current
Songsterr page and has a **Reapply colours** button. It intentionally does not
claim that a drum track is selected unless the SVG itself is present and processed.

## Reload after source changes

After editing source files, return to `chrome://extensions/` or
`edge://extensions/`, click the extension's reload button, then reload any open
Songsterr page. There is no build step.

## Manual testing

Browser interaction is required to test live Songsterr markup. In both Chrome and
Edge, load the unpacked extension and test at least the following on several drum
tabs:

- bass drum, snare, rim shot or side stick, closed/open hi-hat, low/mid/high tom,
  crash, ride, and ride bell;
- scrolling until new measures load; browser zoom; track changes; song changes;
  and Songsterr client-side navigation;
- set a group, category, and subtype colour, confirm subtype precedence, remove
  an override, and reset all settings;
- close and reopen the browser, then verify saved overrides persist;
- switch to guitar or bass tracks and verify no non-`_vDrum` notation changes;
  visit a normal website and verify the extension is inactive; and
- confirm Songsterr playback and scrolling continue normally.

Also inspect the extension card in each browser for manifest errors. The project
includes no live Songsterr fixture, so these browser checks cannot be fully
automated here.

## Known limitations

- Recognition depends on Songsterr retaining compatible `_vDrum` SVG markup and
  its existing note shapes. Unrecognised notes are deliberately left unchanged.
- Updating a saved colour reloads open Songsterr tabs. This is the reliable first
  version because the extension splits each original SVG path into colour paths;
  a reload restores Songsterr's original path before recalculating it.
- The popup can reliably report whether the extension is active, but does not try
  to infer the selected track from fragile page UI text.

## Files

- `manifest.json` — Chrome/Edge Manifest V3 configuration.
- `identifier.js` — retained SVG parsing and note identification logic.
- `recolor.js` — retained path splitting and recolour planning logic.
- `storage.js` — local override storage, validation, and hierarchical resolver.
- `content.js` — Songsterr-only content script and mutation observer.
- `options/` — graphical colour settings page.
- `popup/` — toolbar popup.
- `reference.json` — retained note-identification reference and default colours.
- `runtest.js` — original optional Node test harness (requires its original
  `test.html` fixture, which is not present in this supplied folder).

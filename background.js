/* Opens the full settings interface in its own focused extension window. */
const ext = globalThis.browser || globalThis.chrome;
ext.runtime.onMessage.addListener((message) => {
  if (!message || message.type !== 'songsterr-drum-colours-open-settings') return undefined;
  return ext.windows.create({
    url: ext.runtime.getURL('options/options.html'),
    type: 'popup',
    width: 1020,
    height: 820,
    focused: true,
  }).then(() => ({ opened: true }));
});

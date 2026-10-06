// Service worker for the Errata extension.
// Handles two requests from content scripts:
//   tc-capture — take a screenshot of the visible tab
//   tc-save    — append a correction entry to chrome.storage.local
// This file performs no network access and loads no external code.

async function captureTab(sender) {
  const image = await chrome.tabs.captureVisibleTab(sender.tab.windowId, {
    format: 'png',
  });
  return { ok: true, dataUrl: image };
}

async function saveEntry(entry, pageScreenshot) {
  const { entries } = await chrome.storage.local.get({ entries: [] });
  entries.push(entry);
  await chrome.storage.local.set({ entries });
  if (pageScreenshot) {
    const { pages } = await chrome.storage.local.get({ pages: {} });
    pages[entry.url] = {
      screenshot: pageScreenshot,
      capturedAt: entry.createdAt,
      title: entry.title,
    };
    await chrome.storage.local.set({ pages });
  }
  return { ok: true, count: entries.length };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  let work;
  if (msg.type === 'tc-capture') work = captureTab(sender);
  else if (msg.type === 'tc-save') work = saveEntry(msg.entry, msg.pageScreenshot);
  else work = Promise.resolve({ ok: false, error: 'unknown message' });

  work.then(sendResponse).catch((err) =>
    sendResponse({ ok: false, error: String(err) })
  );
  return true;
});

const startBtn = document.getElementById('start');
const reportBtn = document.getElementById('report');
const countEl = document.getElementById('count');
const errEl = document.getElementById('err');

chrome.storage.local.get({ entries: [] }).then(({ entries }) => {
  countEl.textContent = `${entries.length} proposal${entries.length === 1 ? '' : 's'} stored`;
});

startBtn.addEventListener('click', async () => {
  errEl.style.display = 'none';
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'tc-start' });
    window.close();
  } catch {
    try {
      // Content script isn't running yet (tab was open before install/reload).
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['picker.js'] });
      await chrome.tabs.sendMessage(tab.id, { type: 'tc-start' });
      window.close();
    } catch {
      errEl.style.display = 'block';
    }
  }
});

reportBtn.addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('report.html') });
  window.close();
});

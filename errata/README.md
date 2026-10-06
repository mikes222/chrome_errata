# Errata

A Chrome extension (Manifest V3) for collecting website text corrections —
like an editor's errata list. Click a text on a page, type the proposed
correction, and the extension stores a cropped screenshot, the original text,
your proposal, the page URL and the DOM selector. Everything stays local —
no account, no server.

## Install

1. Open `chrome://extensions` in Chrome (or `edge://extensions` in Edge).
2. Enable **Developer mode** (top right).
3. Click **Load unpacked** and select this `errata` folder.

## Capture proposals

1. Open the website you want to review.
2. Click the extension icon → **Pick text on this page**.
3. Hover over text (it gets highlighted) and click it.
4. A panel opens showing the current text — edit the proposal, optionally add
   a note, then **Save proposal** (or `Ctrl+Enter`).
5. Keep clicking further texts; press `Esc` to stop capturing.

Each entry stores: page URL + title, page language, DOM selector, original
text, proposed text, note, timestamp and a screenshot cropped around the
element (with ~160px of surrounding context and a subtle red marker on the
element in question). Additionally, the full visible viewport is stored once
per page URL and shown as context at the top of each page group in the
report.

## Review & export

Click the extension icon → **Open report / export** (also reachable via
`chrome-extension://<id>/report.html`).

- Edit proposals/notes inline, or delete entries.
- **Export Markdown + images** — downloads `Downloads/errata-exports/<timestamp>/`
  containing `report.md` and `images/NNN.png`, ready to commit to git or send by mail.
  The .md references the images relatively — keep the `images/` folder next to
  `report.md` (if you move only the .md, images won't render).
- **Export .md (embedded images)** — a single self-contained
  `report-embedded.md` with screenshots inlined as base64. Use this when the
  file will be shared/viewed on its own (e.g. Android Studio, mail attachments).
- **Export JSON** — raw data (screenshots embedded as data URLs).
- **Print / Save as PDF** — uses the browser print dialog with a print-friendly layout.

## Files

| File | Purpose |
| --- | --- |
| `manifest.json` | Extension manifest (MV3) |
| `picker.js` | Element picker + correction editor (shadow DOM overlay) |
| `service-worker.js` | Screenshot capture + storage writes |
| `popup.html` / `popup.js` | Toolbar popup: start picking, open report |
| `report.html` / `report.js` / `report.css` | Review, edit and export all proposals |
| `icons/` | Extension icons (regenerate via `python tools/make_icon.py`) |

## Notes & limitations

- Cannot run on `chrome://` pages, the Chrome Web Store, or the built-in
  PDF viewer (Chrome restriction).
- The screenshot captures the visible viewport cropped around the element —
  scroll so the target text is visible before saving.
- Data lives in `chrome.storage.local` (unlimited quota granted). Clearing
  browsing data with "hosted app data"/extension data included will remove it —
  export regularly.

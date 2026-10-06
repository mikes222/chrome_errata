const listEl = document.getElementById('list');
const emptyEl = document.getElementById('empty');
let entries = [];
let pages = {};

// ---------- storage ----------

async function load() {
  ({ entries, pages = {} } = await chrome.storage.local.get({
    entries: [],
    pages: {},
  }));
  render();
}

function persist() {
  return chrome.storage.local.set({ entries });
}

// ---------- render ----------

function render() {
  listEl.innerHTML = '';
  emptyEl.style.display = entries.length ? 'none' : 'block';

  const groups = groupByUrl();
  const num = numbering(groups);

  for (const [url, items] of groups) {
    const g = document.createElement('section');
    g.className = 'group';

    const head = document.createElement('div');
    head.className = 'group-head';
    const info = document.createElement('div');
    info.className = 'group-info';
    const h = document.createElement('h2');
    h.textContent = url;
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.textContent =
      (items[0].title || '') + (items[0].lang ? ' · lang: ' + items[0].lang : '');
    info.append(h, meta);
    head.appendChild(info);

    const ps = pages[url] && pages[url].screenshot;
    if (ps) {
      const img = document.createElement('img');
      img.className = 'page-shot';
      img.src = ps;
      img.alt = 'Page screenshot';
      head.appendChild(img);
    }
    g.appendChild(head);

    items.forEach((e) => g.appendChild(card(e, num.get(e))));
    listEl.appendChild(g);
  }
}

function card(e, num) {
  const div = document.createElement('div');
  div.className = 'card';

  const imgSide = document.createElement('div');
  if (e.screenshot) {
    const img = document.createElement('img');
    img.src = e.screenshot;
    imgSide.appendChild(img);
  }

  const body = document.createElement('div');

  const meta = document.createElement('div');
  meta.className = 'meta';
  const badge = document.createElement('span');
  badge.className = 'num';
  badge.textContent = num;
  const sel = document.createElement('span');
  sel.className = 'sel';
  sel.textContent = e.selector || e.tag || 'element';
  meta.append(badge, sel);
  if (e.lang) {
    const lg = document.createElement('span');
    lg.className = 'lang';
    lg.textContent = e.lang;
    meta.appendChild(lg);
  }
  body.appendChild(meta);

  body.appendChild(field('Current text', (f) => {
    const d = document.createElement('div');
    d.className = 'old';
    d.textContent = e.oldText || '(none)';
    f.appendChild(d);
  }));

  const newField = field('Proposed correction', (f) => {
    const ta = document.createElement('textarea');
    ta.value = e.newText;
    ta.addEventListener('change', () => {
      e.newText = ta.value;
      print.textContent = ta.value;
      persist();
    });
    f.appendChild(ta);
    const print = document.createElement('div');
    print.className = 'print-only new-print';
    print.textContent = e.newText;
    f.appendChild(print);
  });
  body.appendChild(newField);

  const noteField = field('Note', (f) => {
    const inp = document.createElement('input');
    inp.value = e.note || '';
    inp.addEventListener('change', () => {
      e.note = inp.value;
      notePrint.textContent = inp.value;
      persist();
    });
    f.appendChild(inp);
    const notePrint = document.createElement('div');
    notePrint.className = 'print-only';
    notePrint.style.fontSize = '13px';
    notePrint.textContent = e.note || '';
    f.appendChild(notePrint);
  });
  body.appendChild(noteField);

  const row = document.createElement('div');
  row.className = 'row';
  const del = document.createElement('button');
  del.className = 'del';
  del.textContent = 'Delete';
  del.addEventListener('click', () => {
    entries = entries.filter((x) => x.id !== e.id);
    persist().then(render);
  });
  row.appendChild(del);
  body.appendChild(row);

  div.append(imgSide, body);
  return div;
}

function field(label, fill) {
  const f = document.createElement('div');
  f.className = 'field';
  const l = document.createElement('div');
  l.className = 'lbl';
  l.textContent = label;
  f.appendChild(l);
  fill(f);
  return f;
}

// ---------- export ----------

function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',');
  const mime = /data:(.*?);/.exec(meta)[1];
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () =>
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  );
}

function quote(text) {
  return (text || '_(none)_').split('\n').map((l) => '> ' + l).join('\n');
}

const truncate = (s, n) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const escCell = (s) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
const escLink = (s) => (s || '').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
const escCode = (s) => '`' + (s || '').replace(/`/g, "'") + '`';

function groupByUrl() {
  const byUrl = new Map();
  for (const e of entries) {
    if (!byUrl.has(e.url)) byUrl.set(e.url, []);
    byUrl.get(e.url).push(e);
  }
  return byUrl;
}

// Stable numbering across overview and detail sections.
function numbering(byUrl) {
  const num = new Map();
  let n = 0;
  for (const items of byUrl.values()) for (const e of items) num.set(e, ++n);
  return num;
}

function buildMarkdown(byUrl, num, embed) {
  const imgSrc = (e) =>
    embed ? e.screenshot : `images/${String(num.get(e)).padStart(3, '0')}.png`;

  let md = `# Errata — correction proposals\n\n`;
  md += `**Exported:** ${new Date().toLocaleString()} &nbsp;·&nbsp; `;
  md += `**Proposals:** ${entries.length}\n\n---\n`;

  md += `\n## Overview\n\n`;
  md += `| # | Page | Selector | Current | Proposed |\n`;
  md += `|---|------|----------|---------|----------|\n`;
  for (const e of entries) {
    md += `| ${num.get(e)} | [${escLink(escCell(truncate(e.title || e.url, 30)))}](${e.url})` +
      ` | ${escCode(truncate(e.selector, 30))}` +
      ` | ${escCell(truncate(e.oldText, 45))} | ${escCell(truncate(e.newText, 45))} |\n`;
  }

  let gi = 0;
  for (const [url, items] of byUrl) {
    gi++;
    md += `\n---\n\n## ${escLink(items[0].title || url)}\n\n`;
    md += `${url}${items[0].lang ? ' · `lang: ' + items[0].lang + '`' : ''}`;
    md += ` · ${items.length} proposal${items.length === 1 ? '' : 's'}\n`;

    const ps = pages[url] && pages[url].screenshot;
    if (ps) {
      const src = embed ? ps : `images/site-${String(gi).padStart(3, '0')}.png`;
      md += `\n<p><img src="${src}" width="560" alt="page screenshot"></p>\n`;
    }

    for (const e of items) {
      md += `\n### ${num.get(e)}. ${escCode(e.selector || e.tag || 'element')}\n\n`;
      md += `**Current**\n${quote(e.oldText)}\n\n`;
      md += `**Proposed**\n${quote(e.newText)}\n`;
      if (e.note) md += `\n**Note** — ${e.note}\n`;
      if (e.screenshot) {
        md += `\n<p><img src="${imgSrc(e)}" width="560" alt="screenshot"></p>\n`;
      }
      if (e.note || e.screenshot) md += '\n';
    }
  }
  return md;
}

async function exportMarkdown(embed) {
  if (!entries.length) return;
  const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
  const dir = `errata-exports/${ts}`;
  const byUrl = groupByUrl();
  const num = numbering(byUrl);

  if (!embed) {
    let gi = 0;
    for (const url of byUrl.keys()) {
      gi++;
      const ps = pages[url] && pages[url].screenshot;
      if (ps) {
        download(
          dataUrlToBlob(ps),
          `${dir}/images/site-${String(gi).padStart(3, '0')}.png`
        );
      }
    }
    for (const e of entries) {
      if (!e.screenshot) continue;
      const name = `images/${String(num.get(e)).padStart(3, '0')}.png`;
      download(dataUrlToBlob(e.screenshot), `${dir}/${name}`);
    }
  }
  const md = buildMarkdown(byUrl, num, embed);
  const file = embed ? 'report-embedded.md' : 'report.md';
  download(new Blob([md], { type: 'text/markdown' }), `${dir}/${file}`);
}

function exportJson() {
  if (!entries.length) return;
  const ts = new Date().toISOString().slice(0, 10);
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: 'application/json' });
  download(blob, `errata-exports/corrections-${ts}.json`);
}

// ---------- toolbar ----------

document.getElementById('export-md').addEventListener('click', () => exportMarkdown(false));
document.getElementById('export-md-embed').addEventListener('click', () => exportMarkdown(true));
document.getElementById('export-json').addEventListener('click', exportJson);
document.getElementById('print').addEventListener('click', () => window.print());
document.getElementById('clear').addEventListener('click', async () => {
  if (confirm('Delete all stored proposals?')) {
    entries = [];
    pages = {};
    await chrome.storage.local.set({ entries, pages });
    render();
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.entries || changes.pages)) load();
});

load();

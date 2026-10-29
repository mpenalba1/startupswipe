#!/usr/bin/env node
// Builds every HTML page of the site, the news feeds, the sitemap and the press kit ZIP.
// No dependencies: plain Node 18+. Usage:
//   node tools/build.mjs            the public site, in place (drafts are skipped)
//   node tools/build.mjs --preview  the same site plus drafts, in _preview/ (not committed)
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { config, routes, shots, gifs, gallery, t } from '../content/site.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW = process.argv.includes('--preview');
const OUT = PREVIEW ? path.join(ROOT, '_preview') : ROOT;
const LANGS = ['en', 'es'];
const written = [];

// ------------------------------------------------------------------ helpers
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const posix = path.posix;

/** Relative URL from the page `from` (a file path like "news/x/index.html") to a site path ("", "news/", "a.png#x"). */
function rel(from, to) {
  const [p, hash] = to.split('#');
  const fromDir = posix.dirname(from);
  let out;
  if (p === '' || p.endsWith('/')) {
    const r = posix.relative(fromDir, p.replace(/\/$/, '') || '.');
    out = (r || '.') + '/';
  } else {
    out = posix.relative(fromDir, p);
  }
  return hash !== undefined ? `${out}#${hash}` : out;
}
const abs = (to) => config.siteUrl + to;

function write(file, content) {
  const full = path.join(OUT, file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const prev = fs.existsSync(full) ? fs.readFileSync(full) : null;
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content);
  if (!prev || !prev.equals(buf)) fs.writeFileSync(full, buf);
  written.push(file);
}

const hashOf = (...files) => {
  const h = crypto.createHash('sha1');
  for (const f of files) h.update(fs.readFileSync(path.join(ROOT, f)));
  return h.digest('hex').slice(0, 8);
};
const V = hashOf('assets/css/site.css', 'assets/js/site.js');

function fmtDate(lang, iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return t[lang].date(y, m, d, t[lang].months);
}

// ----------------------------------------------------------------- markdown
// A small subset: paragraphs, ## headings, lists, quotes, images, links, **bold**, *italic*, `code`, ---.
function inline(s, url) {
  // Typographer's apostrophes, as in the store texts: it's → it’s.
  let out = esc(s.replace(/(\w)'(\w)/g, '$1’$2'));
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  out = out.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+&quot;([^&]*)&quot;)?\)/g, (_, alt, src) => `<img src="${esc(url(src))}" alt="${alt}" loading="lazy" decoding="async">`);
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, text, href) => `<a href="${esc(url(href))}">${text}</a>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*\w])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|\W)_([^_\s][^_]*)_/g, '$1<em>$2</em>');
  out = out.replace(/ {2}\n/g, '<br>\n');
  return out;
}
function markdown(src, url) {
  const blocks = src.replace(/\r/g, '').trim().split(/\n{2,}/);
  return blocks.map((b) => {
    const lines = b.split('\n');
    let m;
    if ((m = b.match(/^(#{2,4})\s+(.*)$/))) { const n = m[1].length; return `<h${n}>${inline(m[2], url)}</h${n}>`; }
    if (/^(-{3,}|\*{3,})$/.test(b.trim())) return '<hr>';
    if (b.startsWith('<')) return b;
    if (lines.every((l) => /^>\s?/.test(l))) return `<blockquote>${markdown(lines.map((l) => l.replace(/^>\s?/, '')).join('\n'), url)}</blockquote>`;
    if (lines.every((l) => /^[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inline(l.replace(/^[-*]\s+/, ''), url)}</li>`).join('')}</ul>`;
    if (lines.every((l) => /^\d+\.\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inline(l.replace(/^\d+\.\s+/, ''), url)}</li>`).join('')}</ol>`;
    if ((m = b.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) return `<figure><img src="${esc(url(m[2]))}" alt="${esc(m[1])}" loading="lazy" decoding="async"></figure>`;
    return `<p>${inline(b, url)}</p>`;
  }).join('\n');
}

// -------------------------------------------------------------------- news
function readPosts() {
  const dir = path.join(ROOT, 'content/news');
  const posts = [];
  for (const name of fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort()) {
    const raw = fs.readFileSync(path.join(dir, name), 'utf8');
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    if (!fm) throw new Error(`${name}: missing front matter (--- ... ---)`);
    const meta = {};
    for (const line of fm[1].split('\n')) {
      const mm = line.match(/^(\w+):\s*(.*)$/);
      if (mm) meta[mm[1]] = mm[2].replace(/^["']|["']$/g, '').trim();
    }
    const base = name.replace(/\.(en|es)\.md$/, '').replace(/\.md$/, '');
    const lang = meta.lang || (name.match(/\.(en|es)\.md$/) || [])[1];
    if (!LANGS.includes(lang)) throw new Error(`${name}: lang must be en or es`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(meta.date || '')) throw new Error(`${name}: date must look like 2026-10-24`);
    if (!meta.title) throw new Error(`${name}: missing title`);
    const slug = meta.slug || base.replace(/^\d{4}-\d{2}-\d{2}-/, '');
    if (!/^[a-z0-9-]+$/.test(slug)) throw new Error(`${name}: slug may only use a-z, 0-9 and -`);
    const draft = /^(true|yes|1)$/i.test(meta.draft || '');
    const body = raw.slice(fm[0].length);
    const firstPara = body.trim().split(/\n{2,}/)[0].replace(/[*_`#>]/g, '');
    posts.push({ name, base, lang, slug, draft, title: meta.title, date: meta.date, image: meta.image || null,
      summary: meta.summary || (firstPara.length > 180 ? firstPara.slice(0, 177).replace(/\s+\S*$/, '') + '…' : firstPara),
      body, path: `${routes.news[lang]}${slug}/` });
  }
  const live = posts.filter((p) => PREVIEW || !p.draft);
  live.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.base < b.base ? 1 : -1));
  for (const p of live) p.alt = live.find((q) => q.base === p.base && q.lang !== p.lang) || null;
  return live;
}

// ------------------------------------------------------------------ layout
function ctxFor(lang, file) {
  const T = t[lang];
  const other = lang === 'en' ? 'es' : 'en';
  return {
    lang, other, T, file,
    a: (p) => rel(file, `assets/${p}`),
    r: (p) => rel(file, p),
    link: (key, l = lang) => rel(file, routes[key][l]),
  };
}

function header(c, { home = false, langHref = null, langSwitch = true, current = null } = {}) {
  const { T } = c;
  const otherHref = langHref ?? c.link('home', c.other);
  return `<header class="top${home ? ' top-home' : ''}">
  <a class="brand" href="${c.link('home')}" aria-label="${esc(T.nav.home)}"><img class="px brand-icon" src="${c.a('art/icon.png')}" width="32" height="32" alt=""><img class="px brand-logo" src="${c.a('art/logo.png')}" width="180" height="19" alt=""></a>
  <nav class="top-nav" aria-label="${esc(T.nav.main)}">
    <a href="${c.link('news')}"${current === 'news' ? ' aria-current="page"' : ''}>${esc(T.nav.news)}</a>${langSwitch ? `
    <a href="${otherHref}" hreflang="${c.other}" lang="${c.other}">${esc(T.otherName)}</a>` : ''}
  </nav>
</header>${home ? '' : '\n<div class="dither" aria-hidden="true"></div>'}`;
}

function footer(c, { langHref = null, langSwitch = true } = {}) {
  const { T } = c;
  const otherHref = langHref ?? c.link('home', c.other);
  return `<footer class="foot">
  <div class="foot-in">
    <a class="foot-brand" href="${c.link('home')}"><img class="px" src="${c.a('art/logo.png')}" width="180" height="19" alt="StartupSwipe"></a>
    <nav class="foot-nav" aria-label="${esc(T.nav.footer)}">
      <a href="${c.link('news')}">${esc(T.nav.news)}</a>
      <a href="${c.link('press')}">${esc(T.nav.press)}</a>
      <a href="${c.link('support')}">${esc(T.nav.support)}</a>
      <a href="${c.link('privacy')}">${esc(T.nav.privacy)}</a>
    </nav>
    <div class="foot-end">${langSwitch ? `
      <a class="foot-lang" href="${otherHref}" hreflang="${c.other}" lang="${c.other}">${esc(T.otherName)}</a>` : ''}
      <p class="foot-copy">${esc(config.copyright)}</p>
    </div>
  </div>
</footer>`;
}

// On the English home page only: a Spanish browser goes to the Spanish home, unless the person picked English.
const LANG_REDIRECT = `<script>try{var l=localStorage.getItem('ss-lang');if((l==='es'||(!l&&/^es\\b/i.test(navigator.language||'')))&&!/[?&]lang=/.test(location.search))location.replace('es/'+location.hash)}catch(e){}</script>`;

function layout(c, { title, description, canonical, alternates = null, body, bodyClass = '', noindex = false, ogImage = null, ogType = 'website', jsonld = null, base = null, redirect = false }) {
  const { lang, T } = c;
  const og = ogImage ? abs(ogImage) : abs('assets/art/og.png');
  const alt = alternates ? Object.entries(alternates).map(([l, p]) => `<link rel="alternate" hreflang="${l}" href="${abs(p)}">`).join('\n') +
    (alternates.en !== undefined ? `\n<link rel="alternate" hreflang="x-default" href="${abs(alternates.en)}">` : '') : '';
  return `<!doctype html>
<html lang="${lang}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<script>document.documentElement.classList.remove('no-js')</script>
${redirect ? LANG_REDIRECT + '\n' : ''}${base ? `<base href="${base}">\n` : ''}<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}${canonical !== null ? `<link rel="canonical" href="${abs(canonical)}">\n` : ''}${alt ? alt + '\n' : ''}<meta name="theme-color" content="#2A3C59">
<link rel="icon" type="image/png" sizes="32x32" href="${c.r('favicon.png')}">
<link rel="apple-touch-icon" href="${c.r('apple-touch-icon.png')}">
<link rel="alternate" type="application/atom+xml" title="${esc(`StartupSwipe ${T.newsTitle}`)}" href="${c.r(routes.news[lang] + 'feed.xml')}">
<meta property="og:site_name" content="StartupSwipe">
<meta property="og:type" content="${ogType}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical !== null ? `<meta property="og:url" content="${abs(canonical)}">\n` : ''}<meta property="og:image" content="${og}">
${ogImage ? '' : '<meta property="og:image:width" content="1232">\n<meta property="og:image:height" content="706">\n'}<meta property="og:image:alt" content="StartupSwipe">
<meta property="og:locale" content="${T.locale.replace('-', '_')}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${og}">
<link rel="preload" href="${c.a('fonts/pixelify-400.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:ital,wght@0,400;0,700;1,400&amp;display=swap">
<link rel="stylesheet" href="${c.a('css/site.css')}?v=${V}">
<script src="${c.a('js/site.js')}?v=${V}" defer></script>
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>\n` : ''}</head>
<body class="${bodyClass}">
<a class="skip" href="#content">${esc(T.skip)}</a>
${body}
</body>
</html>
`;
}

// ------------------------------------------------------------------ pieces
function stores(c, keys, { hints = false } = {}) {
  const { T } = c;
  return `<ul class="stores" aria-label="${esc(T.storesLabel)}">
${keys.map((k) => {
    const url = config.stores[k];
    const inner = `<span class="store-name">${esc(T.stores[k])}</span>${hints ? `<span class="store-hint">${esc(T.storeHint[k])}</span>` : ''}`;
    return url
      ? `  <li><a class="store is-live" href="${esc(url)}">${inner}</a></li>`
      : `  <li><span class="store"><span class="store-text">${inner}</span><span class="tag">${esc(T.soon)}</span></span></li>`;
  }).join('\n')}
</ul>`;
}

function shotImg(c, key, { lazy = true, cls = '' } = {}) {
  const s = shots[key];
  return `<img${cls ? ` class="${cls}"` : ''} src="${c.a(`shots/${c.lang}/${s.file}`)}" width="1920" height="1080" alt="${esc(s[c.lang])}"${lazy ? ' loading="lazy"' : ''} decoding="async">`;
}
function gifImg(c, key) {
  const g = gifs[key];
  return `<img class="px" src="${c.a(`gifs/${c.lang}/${g.file}`)}" width="${g.w}" height="${g.h}" alt="${esc(g[c.lang])}" loading="lazy" decoding="async">`;
}
function media(c, m) {
  if (m.shot) {
    const s = shots[m.shot];
    if (!s.phone && !s.crop) return `<figure class="media media-shot">${shotImg(c, m.shot)}</figure>`;
    const full = [0, 0, 1920, 1080];
    const [px, py, pw, ph] = s.phone || s.crop || full;
    const [dx, dy, dw, dh] = s.crop || full;
    return `<figure class="media media-shot"><div class="crop" style="--px:${px};--py:${py};--pw:${pw};--ph:${ph};--dx:${dx};--dy:${dy};--dw:${dw};--dh:${dh}">${shotImg(c, m.shot)}</div></figure>`;
  }
  return `<figure class="media media-gif">${gifImg(c, m.gif)}</figure>`;
}

function postItems(c, posts) {
  return posts.map((p) => `<li class="post-item">
  <a href="${c.r(p.path)}">
    <time datetime="${p.date}">${esc(fmtDate(c.lang, p.date))}</time>
    <span class="post-item-title">${esc(p.title)}</span>
    <span class="post-item-sum">${esc(p.summary)}</span>
  </a>
</li>`).join('\n');
}

// -------------------------------------------------------------------- home
function home(lang, posts) {
  const file = routes.home[lang] + 'index.html';
  const c = ctxFor(lang, file);
  const { T } = c;
  const mine = posts.filter((p) => p.lang === lang).slice(0, 3);
  const body = `${header(c, { home: true })}
<main id="content">
<section class="hero">
  <div class="hero-sky">
    <h1 class="logo">
      <span class="sr-only">StartupSwipe</span>
      <img class="px logo-line" src="${c.a('art/logo.png')}" width="180" height="19" alt="">
      <span class="logo-stack"><img class="px" src="${c.a('art/logo-startup.png')}" width="105" height="19" alt=""><img class="px" src="${c.a('art/logo-swipe.png')}" width="75" height="19" alt=""></span>
    </h1>
    <p class="tagline">${esc(T.tagline)}</p>
  </div>
  <div class="world">
    <div class="world-frame"><img class="px world-art" src="${c.a('art/world-dusk.png')}" width="1300" height="790" alt="${esc(T.worldAlt)}" fetchpriority="high"></div>
    <div class="ground">
      <p class="hook panel">${esc(T.description)}</p>
      <div class="buy panel">
        ${stores(c, ['appstore', 'googleplay', 'steam'], { hints: true })}
      </div>
    </div>
  </div>
</section>

<section class="reel" aria-label="${esc(T.reelLabel)}">
  <div class="reel-frame">
    <video class="reel-video" controls muted loop playsinline preload="none" width="864" height="1080" poster="${c.a('video/timelapse-tall.webp')}" data-wide="${c.a('video/timelapse-wide.mp4')}" data-wide-poster="${c.a('video/timelapse-wide.webp')}" aria-label="${esc(T.reelLabel)}">
      <source src="${c.a('video/timelapse-tall.mp4')}" type="video/mp4">
    </video>
  </div>
</section>

<section class="about" aria-labelledby="about-h">
  <h2 id="about-h" class="sr-only">${esc(T.aboutTitle)}</h2>
  <figure class="dlg">
    <figcaption class="dlg-name">Augusto</figcaption>
    <blockquote class="dlg-line"><p>${esc(T.quote)}</p></blockquote>
    <img class="px dlg-face" src="${c.a('art/augusto.png')}" width="32" height="33" alt="">
  </figure>
  <div class="beats">
${T.about.map((item, i) => `  <div class="beat beat-${item.media?.gif ? 'gif' : 'shot'}${shots[item.media?.shot]?.crop ? ' beat-crop' : ''}"${item.sign ? ` data-sign="${esc(item.sign)}"` : ''}>
    <div class="beat-text">${item.sign ? `<p class="beat-sign">${esc(item.sign)}</p>` : ''}<p>${esc(item.p)}</p></div>
    ${item.media ? media(c, item.media) : ''}
  </div>`).join('\n')}
  </div>
</section>

<section class="gallery" aria-labelledby="gal-h">
  <h2 id="gal-h" class="sr-only">${esc(T.galleryTitle)}</h2>
  <div class="rail" role="region" aria-label="${esc(T.galleryHint)}" tabindex="0">
    <ul class="rail-list">
${gallery.map((k, i) => `      <li class="rail-item"><button type="button" class="rail-shot" data-i="${i}">${shotImg(c, k)}</button></li>`).join('\n')}
    </ul>
  </div>
  <div class="rail-nav">
    <button type="button" class="btn btn-icon rail-prev" aria-label="${esc(T.prev)}"><span aria-hidden="true" class="arrow arrow-l"></span></button>
    <p class="rail-count"><span class="rail-now">1</span> ${esc(T.of)} ${gallery.length}</p>
    <button type="button" class="btn btn-icon rail-next" aria-label="${esc(T.next)}"><span aria-hidden="true" class="arrow arrow-r"></span></button>
  </div>
  <dialog class="viewer" aria-label="${esc(T.galleryTitle)}">
    <div class="viewer-in">
      <img class="viewer-img" src="" alt="">
      <div class="viewer-bar">
        <button type="button" class="btn btn-icon viewer-prev" aria-label="${esc(T.prev)}"><span aria-hidden="true" class="arrow arrow-l"></span></button>
        <p class="viewer-count"></p>
        <button type="button" class="btn btn-icon viewer-next" aria-label="${esc(T.next)}"><span aria-hidden="true" class="arrow arrow-r"></span></button>
        <button type="button" class="btn viewer-close">${esc(T.close)}</button>
      </div>
    </div>
  </dialog>
</section>

<section class="get" aria-labelledby="get-h">
  <h2 id="get-h" class="get-title">${esc(T.endTitle)}</h2>
  <p class="get-sub">${esc(T.endSub)}</p>
  <div class="get-cards">
    <div class="card panel">
      <h3>${esc(T.phones)}</h3>
      <p>${esc(T.phonesText)}</p>
      ${stores(c, ['appstore', 'googleplay'])}
    </div>
    <div class="card panel">
      <h3>${esc(T.computer)}</h3>
      <p>${esc(T.computerText)}</p>
      ${stores(c, ['steam'])}
    </div>
  </div>
  <p class="get-langs">${esc(T.languages)}</p>
</section>
${mine.length ? `
<section class="news-teaser" aria-labelledby="news-h">
  <h2 id="news-h" class="section-title">${esc(T.newsTitle)}</h2>
  <ul class="post-list">
${postItems(c, mine)}
  </ul>
  <p class="more"><a href="${c.link('news')}">${esc(T.newsAll)}</a></p>
</section>` : ''}
</main>
${footer(c)}`;
  const jsonld = {
    '@context': 'https://schema.org', '@type': 'VideoGame', name: 'StartupSwipe', url: abs(routes.home[lang]),
    description: T.description, image: abs('assets/art/og.png'), inLanguage: ['en', 'es', 'it'],
    gamePlatform: ['iOS', 'Android', 'Windows', 'macOS'], genre: ['Simulation', 'Management'],
    author: { '@type': 'Person', name: 'Maurizzio Peñalba' },
  };
  write(file, layout(c, { title: T.homeTitle, description: T.description, canonical: routes.home[lang], alternates: { en: routes.home.en, es: routes.home.es }, body, bodyClass: 'home', jsonld, redirect: lang === 'en' }));
}

// -------------------------------------------------------------------- news
function newsIndex(lang, posts) {
  const file = routes.news[lang] + 'index.html';
  const c = ctxFor(lang, file);
  const { T } = c;
  const mine = posts.filter((p) => p.lang === lang);
  const body = `${header(c, { langHref: c.link('news', c.other), current: 'news' })}
<main id="content" class="page">
  <h1 class="page-title">${esc(T.newsListTitle)}</h1>
  ${mine.length ? `<ul class="post-list">\n${postItems(c, mine)}\n  </ul>` : `<p class="empty">${esc(T.newsEmpty)}</p>`}
  <p class="feed"><a href="feed.xml">${esc(T.newsFeed)}</a></p>
</main>
${footer(c, { langHref: c.link('news', c.other) })}`;
  write(file, layout(c, { title: `${T.newsListTitle} | StartupSwipe`, description: T.newsListDescription, canonical: routes.news[lang], alternates: { en: routes.news.en, es: routes.news.es }, body, bodyClass: 'inner' }));
}

function newsPost(p) {
  const file = p.path + 'index.html';
  const c = ctxFor(p.lang, file);
  const { T } = c;
  const url = (u) => (/^(https?:|mailto:|#)/.test(u) ? u : rel(file, u.replace(/^\//, '')));
  const otherHref = p.alt ? c.r(p.alt.path) : c.link('news', c.other);
  const body = `${header(c, { langHref: otherHref, current: 'news' })}
<main id="content" class="page post">
  ${p.draft ? `<p class="draft-banner">${esc(T.draft)}</p>` : ''}
  <p class="post-back"><a href="${c.link('news')}">${esc(T.newsBack)}</a></p>
  <article>
    <header class="post-head">
      <time datetime="${p.date}">${esc(fmtDate(p.lang, p.date))}</time>
      <h1 class="page-title">${esc(p.title)}</h1>
    </header>
    <div class="prose">
${markdown(p.body, url)}
    </div>
  </article>
</main>
${footer(c, { langHref: otherHref })}`;
  const alternates = { [p.lang]: p.path };
  if (p.alt) alternates[p.alt.lang] = p.alt.path;
  write(file, layout(c, { title: `${p.title} | StartupSwipe`, description: p.summary, canonical: p.path, alternates: p.alt ? alternates : null, body, bodyClass: 'inner', ogType: 'article', ogImage: p.image, noindex: p.draft }));
}

function feed(lang, posts) {
  const T = t[lang];
  const mine = posts.filter((p) => p.lang === lang);
  const listUrl = abs(routes.news[lang]);
  const updated = (mine[0]?.date || '2026-10-24') + 'T12:00:00Z';
  const entries = mine.map((p) => {
    const html = markdown(p.body, (u) => (/^(https?:|mailto:|#)/.test(u) ? u : abs(u.replace(/^\//, ''))));
    return `  <entry>
    <title>${esc(p.title)}</title>
    <link href="${abs(p.path)}"/>
    <id>${abs(p.path)}</id>
    <published>${p.date}T12:00:00Z</published>
    <updated>${p.date}T12:00:00Z</updated>
    <summary>${esc(p.summary)}</summary>
    <content type="html">${esc(html)}</content>
  </entry>`;
  }).join('\n');
  write(routes.news[lang] + 'feed.xml', `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${lang}">
  <title>StartupSwipe: ${esc(T.newsTitle)}</title>
  <subtitle>${esc(T.newsListDescription)}</subtitle>
  <link href="${listUrl}" rel="alternate" type="text/html"/>
  <link href="${listUrl}feed.xml" rel="self" type="application/atom+xml"/>
  <id>${listUrl}</id>
  <updated>${updated}</updated>
  <author><name>Maurizzio Peñalba</name></author>
  <icon>${abs('apple-touch-icon.png')}</icon>
${entries}
</feed>
`);
}

// ------------------------------------------------------------------- press
function press(lang) {
  const file = routes.press[lang] + 'index.html';
  const c = ctxFor(lang, file);
  const { T } = c;
  const P = T.press;
  const body = `${header(c, { langHref: c.link('press', c.other) })}
<main id="content" class="page press">
  <h1 class="page-title">${esc(T.pressTitle)}</h1>
  <p class="lead">${esc(P.intro)}</p>
  <p><a class="btn btn-cta" href="${c.r('press/files/startupswipe-press-kit.zip')}" download>${esc(P.zip)}</a></p>

  <section aria-labelledby="facts-h">
    <h2 id="facts-h" class="section-title">${esc(P.factsTitle)}</h2>
    <dl class="facts panel">
${P.facts.map(([k, v]) => `      <div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join('\n')}
      <div><dt>${esc(P.contactTitle)}</dt><dd><a href="mailto:${config.contact}">${config.contact}</a></dd></div>
    </dl>
  </section>

  <section aria-labelledby="desc-h" class="press-desc">
    <h2 id="desc-h" class="section-title">${esc(P.aboutTitle)}</h2>
    <p class="lead">${esc(T.description)}</p>
    <p>${T.quoteMarks[0]}${esc(T.quote)}${T.quoteMarks[1]}</p>
${T.about.map((i) => `    <p>${esc(i.p)}</p>`).join('\n')}
    <p>${esc(T.endTitle)} ${esc(T.endSub)}</p>
  </section>

  <section aria-labelledby="art-h">
    <h2 id="art-h" class="section-title">${esc(P.artTitle)}</h2>
    <ul class="dl-grid">
${P.files.map(([f, label, size]) => `      <li class="dl-item">
        <a class="dl-thumb${f.includes('logo') ? ' is-logo' : ''}" href="${c.r('press/files/' + f)}" download><img${/logo|icon/.test(f) ? ' class="px"' : ''} src="${c.r('press/files/' + f)}" alt="" loading="lazy" decoding="async"></a>
        <p class="dl-label">${esc(label)}</p>
        <p class="dl-meta"><a href="${c.r('press/files/' + f)}" download>${esc(P.download)}</a> <span>${size}</span></p>
      </li>`).join('\n')}
    </ul>
  </section>

  <section aria-labelledby="shots-h">
    <h2 id="shots-h" class="section-title">${esc(P.shotsTitle)}</h2>
    <p>${esc(P.shotsNote)}</p>
    <ul class="dl-grid dl-shots">
${gallery.map((k) => `      <li class="dl-item"><a class="dl-thumb" href="${c.a(`shots/${lang}/${shots[k].file}`)}" download>${shotImg(c, k)}</a></li>`).join('\n')}
    </ul>
  </section>

  <section aria-labelledby="contact-h">
    <h2 id="contact-h" class="section-title">${esc(P.contactTitle)}</h2>
    <p>${esc(P.contactText)} <a href="mailto:${config.contact}">${config.contact}</a>.</p>
  </section>
</main>
${footer(c, { langHref: c.link('press', c.other) })}`;
  write(file, layout(c, { title: `${T.pressTitle} | StartupSwipe`, description: P.intro, canonical: routes.press[lang], alternates: { en: routes.press.en, es: routes.press.es }, body, bodyClass: 'inner' }));
}

// ------------------------------------------------- privacy, support, survey
// Their text lives in content/pages/*.html and is used as is; only the frame around it changes.
function legacy(name, { lang, title, description, noindex = false, langSwitch = true, canonical = name + '.html' }) {
  const file = name + '.html';
  const c = ctxFor(lang, file);
  const inner = fs.readFileSync(path.join(ROOT, 'content/pages', name + '.html'), 'utf8');
  const langHref = '#es';
  const body = `${header(c, { langHref, langSwitch })}
<main id="content" class="page legal page-${name}">
${inner}
</main>
${footer(c, { langHref, langSwitch })}`;
  write(file, layout(c, { title, description, canonical: noindex ? null : canonical, body, bodyClass: `inner legacy-${name}`, noindex }));
}

function notFound() {
  const c = ctxFor('en', '404.html');
  const es = t.es;
  const T = c.T;
  const body = `${header(c)}
<main id="content" class="page notfound">
  <h1 class="page-title">${esc(T.notFoundTitle)}</h1>
  <p>${esc(T.notFoundText)}</p>
  <p><a class="btn btn-cta" href="./">${esc(T.notFoundBack)}</a></p>
  <div lang="es" class="notfound-es">
    <h2 class="section-title">${esc(es.notFoundTitle)}</h2>
    <p>${esc(es.notFoundText)}</p>
    <p><a href="es/">${esc(es.notFoundBack)}</a></p>
  </div>
</main>
${footer(c)}`;
  write('404.html', layout(c, { title: `${T.notFoundTitle} | StartupSwipe`, description: T.notFoundText, canonical: null, body, bodyClass: 'inner', noindex: true, base: new URL(config.siteUrl).pathname }));
}

function sitemap(posts) {
  const urls = [routes.home.en, routes.home.es, routes.news.en, routes.news.es, routes.press.en, routes.press.es, 'privacy.html', 'support.html', ...posts.filter((p) => !p.draft).map((p) => p.path)];
  write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((u) => `  <url><loc>${abs(u)}</loc></url>`).join('\n')}
</urlset>
`);
  write('robots.txt', `User-agent: *\nAllow: /\n\nSitemap: ${abs('sitemap.xml')}\n`);
}

// -------------------------------------------------------------- press ZIP
// A plain (stored) ZIP: the images are already compressed. Fixed dates keep the file identical between builds.
const CRC = (() => { const tb = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; tb[n] = c >>> 0; } return tb; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entries) {
  const parts = []; const central = []; let offset = 0;
  const DOS_TIME = 0, DOS_DATE = ((2026 - 1980) << 9) | (10 << 5) | 24;
  for (const { name, data } of entries) {
    const n = Buffer.from(name); const crc = crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10); local.writeUInt16LE(DOS_DATE, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(n.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, n, data);
    const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(20, 4); cd.writeUInt16LE(20, 6); cd.writeUInt16LE(0x0800, 8); cd.writeUInt16LE(0, 10);
    cd.writeUInt16LE(DOS_TIME, 12); cd.writeUInt16LE(DOS_DATE, 14); cd.writeUInt32LE(crc, 16); cd.writeUInt32LE(data.length, 20); cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(n.length, 28); cd.writeUInt32LE(offset, 42);
    central.push(cd, n);
    offset += 30 + n.length + data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}
function pressZip() {
  const entries = [];
  const add = (src, name) => entries.push({ name: `startupswipe-press-kit/${name}`, data: fs.readFileSync(path.join(ROOT, src)) });
  for (const [f] of t.en.press.files) add(`press/files/${f}`, f);
  for (const [lang, folder] of [['en', 'english'], ['es', 'spanish']]) {
    for (const k of gallery) add(`assets/shots/${lang}/${shots[k].file}`, `screenshots-${folder}/${shots[k].file}`);
    for (const g of Object.values(gifs)) add(`assets/gifs/${lang}/${g.file}`, `gifs-${folder}/${g.file}`);
  }
  const fact = (lang) => [t[lang].description, '', ...t[lang].press.facts.map(([k, v]) => `${k}: ${v}`), `${t[lang].press.contactTitle}: ${config.contact}`, '', config.siteUrl + routes.home[lang]].join('\n');
  entries.push({ name: 'startupswipe-press-kit/README.txt', data: Buffer.from(`StartupSwipe\n\n${fact('en')}\n\n---\n\n${fact('es')}\n`) });
  write('press/files/startupswipe-press-kit.zip', zip(entries));
}

// -------------------------------------------------------------------- main
if (PREVIEW) {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [link, target] of [['assets', '../assets'], ['favicon.png', '../favicon.png'], ['apple-touch-icon.png', '../apple-touch-icon.png']]) {
    const p = path.join(OUT, link); if (!fs.existsSync(p)) fs.symlinkSync(target, p);
  }
  const pf = path.join(OUT, 'press/files'); fs.mkdirSync(path.dirname(pf), { recursive: true });
  if (!fs.existsSync(pf)) fs.symlinkSync('../../press/files', pf);
}
const posts = readPosts();
if (!PREVIEW) pressZip();
for (const lang of LANGS) { home(lang, posts); newsIndex(lang, posts); feed(lang, posts); press(lang); }
for (const p of posts) newsPost(p);
legacy('privacy', { lang: 'en', title: 'Privacy | StartupSwipe', description: 'How StartupSwipe handles your data. In English and Spanish.' });
legacy('support', { lang: 'en', title: 'Support | StartupSwipe', description: 'Help with StartupSwipe: purchases, saves, stats and the beta. In English and Spanish.' });
legacy('encuesta', { lang: 'es', title: 'Encuesta | StartupSwipe', description: 'Encuesta del capítulo I.', noindex: true, langSwitch: false });
notFound();
sitemap(posts);

// Pages of posts that are now drafts or were deleted would stay behind: list them so they can be removed.
if (!PREVIEW) {
  for (const lang of LANGS) {
    const dir = path.join(ROOT, routes.news[lang]);
    if (!fs.existsSync(dir)) continue;
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (d.isDirectory() && !posts.some((p) => p.path === `${routes.news[lang]}${d.name}/`)) {
        fs.rmSync(path.join(dir, d.name), { recursive: true });
        console.log(`removed ${routes.news[lang]}${d.name}/ (no published post uses it)`);
      }
    }
  }
}
const drafts = posts.filter((p) => p.draft).length;
console.log(`built ${written.length} files into ${path.relative(process.cwd(), OUT) || '.'}${PREVIEW ? ` (preview, ${drafts} draft${drafts === 1 ? '' : 's'} included)` : ''}`);

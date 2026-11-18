// Sinkron feed Blogger -> data/*.json + halaman artikel lengkap (a/... dan p/...) + sitemap.xml
// Dijalankan oleh GitHub Actions (Node 20+, tanpa dependensi).

import { mkdir, rm, writeFile } from 'node:fs/promises';

const SITE_URL = (process.env.SITE_URL || '').replace(/\/?$/, '/');
if (!/^https:\/\//.test(SITE_URL)) {
  console.error('SITE_URL belum diisi, mis. https://mandaga.my.id/');
  process.exit(1);
}
const DEFAULT_IMAGE = process.env.DEFAULT_IMAGE || 'https://i.ibb.co.com/KcywhB2N/logo.png';
const SITE_NAME = 'MAN 2 Grobogan';

const BLOGS = {
  berita: 'beritamandaga.blogspot.com',
  mading: 'madingmandaga.blogspot.com',
  foto: 'fotomandaga.blogspot.com',
  video: 'videomandaga.blogspot.com'
};
const INFO_HOST = 'infomandaga.blogspot.com';
const POST_LIMIT = 300;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function textOf(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function thumbOf(e, html) {
  if (e['media$thumbnail']) return e['media$thumbnail'].url.replace(/\/s\d+(-c)?\//, '/w640/');
  const m = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (m) return m[1];
  const y = html.match(/youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{6,})/);
  if (y) return `https://img.youtube.com/vi/${y[1]}/hqdefault.jpg`;
  return DEFAULT_IMAGE;
}

function norm(e) {
  const html = (e.content && e.content.$t) || (e.summary && e.summary.$t) || '';
  const pid = ((e.id && e.id.$t) || '').match(/post-(\d+)/);
  const link = (e.link || []).find((l) => l.rel === 'alternate');
  const text = textOf(html);
  return {
    id: pid ? pid[1] : '',
    title: e.title.$t,
    published: e.published ? e.published.$t : '',
    url: link ? link.href : '',
    html,
    thumb: thumbOf(e, html),
    excerpt: text.length > 140 ? text.slice(0, 140).trim() + '…' : text,
    description: text.length > 200 ? text.slice(0, 200).trim() + '…' : text
  };
}

async function fetchAll(host, limit) {
  const out = [];
  const step = 100;
  for (let start = 1; out.length < limit; start += step) {
    const url = `https://${host}/feeds/posts/default?alt=json&max-results=${step}&start-index=${start}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${host}: HTTP ${res.status}`);
    const data = await res.json();
    const entries = (data.feed && data.feed.entry) || [];
    entries.forEach((e) => out.push(norm(e)));
    if (entries.length < step) break;
  }
  return out.slice(0, limit);
}

function fmtDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return iso;
  }
}

function cleanBody(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, '');
}

const CSP = "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src https://www.youtube.com https://www.youtube-nocookie.com https://drive.google.com https://docs.google.com https://www.google.com https://player.vimeo.com https://www.blogger.com; object-src 'none'; base-uri 'self'; form-action 'none'";

function articlePage({ title, description, image, pageUrl, date, body }) {
  const t = esc(title);
  const d = esc(description || SITE_NAME);
  const dt = fmtDate(date);
  const img = esc(image);
  const url = esc(pageUrl);
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="${CSP}">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${t} - ${SITE_NAME}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${url}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${img}">
<meta property="og:url" content="${url}">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="https://i.ibb.co.com/KcywhB2N/logo.png">
<style>
  :root { --primary:#673DE6; --accent:#08796E; --accent-light:#14C9B6; }
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Poppins',sans-serif; color:#fff; min-height:100vh; background:linear-gradient(135deg,#24125a 0%,#4c29bc 40%,#673DE6 70%,#3a1999 100%); }
  .wrap { max-width:820px; margin:0 auto; padding:100px 20px 60px; }
  .back { display:inline-flex; align-items:center; gap:8px; color:var(--accent-light); text-decoration:none; font-size:.9rem; font-weight:500; margin-bottom:18px; }
  .back:hover { text-decoration:underline; }
  .box { padding:40px 44px; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.15); border-radius:28px; backdrop-filter:blur(16px); }
  .date { font-size:.8rem; color:var(--accent-light); font-weight:500; margin:0 0 8px; letter-spacing:.3px; }
  h1 { font-size:clamp(1.35rem,2.4vw,1.85rem); line-height:1.35; font-weight:700; margin-bottom:18px; text-align:left; }
  .body { font-size:1rem; line-height:1.85; color:#fff; overflow-wrap:break-word; }
  .body img { max-width:100%; height:auto; border-radius:16px; margin:14px auto; display:block; }
  .body iframe { max-width:100%; border:none; border-radius:16px; }
  .body a { color:var(--accent-light); text-decoration:underline; }
  .body table { width:100%; border-collapse:collapse; font-size:.92rem; margin:16px 0; display:block; overflow-x:auto; }
  .body table td,.body table th { border:1px solid rgba(255,255,255,0.25); padding:10px 12px; }
  .body table th { background:rgba(255,255,255,0.12); font-weight:600; }
  .foot { text-align:center; margin-top:40px; opacity:.8; font-size:.88rem; }
  .foot a { color:var(--accent-light); }
  @media (max-width:600px){ .box { padding:22px 18px; } h1 { font-size:1.25rem; } }
</style>
</head>
<body>
<div class="wrap">
  <a href="${SITE_URL}" class="back">&larr; Kembali ke beranda</a>
  <article class="box">
    ${dt ? `<span class="date">${esc(dt)}</span>` : ''}
    <h1>${t}</h1>
    <div class="body">${cleanBody(body || '')}</div>
  </article>
  <p class="foot">&copy; ${new Date().getFullYear()} MAN 2 Grobogan. <a href="${SITE_URL}">Kunjungi situs utama</a></p>
</div>
</body>
</html>
`;
}

async function writePage(rel, html) {
  await mkdir(rel, { recursive: true });
  await writeFile(`${rel}/index.html`, html);
}

const sitemapUrls = [];
function addSitemap(url) { sitemapUrls.push(url); }

async function main() {
  await rm('data', { recursive: true, force: true });
  await rm('a', { recursive: true, force: true });
  await rm('p', { recursive: true, force: true });
  await mkdir('data', { recursive: true });
  await mkdir('a', { recursive: true });
  await mkdir('p', { recursive: true });

  addSitemap(SITE_URL);

  for (const [key, host] of Object.entries(BLOGS)) {
    const posts = await fetchAll(host, POST_LIMIT);
    const index = posts.map(({ id, title, published, thumb, excerpt }) => ({ id, title, published, thumb, excerpt }));
    await writeFile(`data/${key}.json`, JSON.stringify(index));
    await mkdir(`data/${key}`, { recursive: true });
    for (const p of posts) {
      if (!p.id) continue;
      await writeFile(`data/${key}/${p.id}.json`, JSON.stringify({ title: p.title, published: p.published, html: p.html }));
      const pageUrl = `${SITE_URL}a/${key}/${p.id}/`;
      await writePage(`a/${key}/${p.id}`, articlePage({
        title: p.title,
        description: p.description,
        image: p.thumb,
        pageUrl,
        date: p.published,
        body: p.html
      }));
      addSitemap(pageUrl);
    }
    console.log(`${key}: ${posts.length} postingan`);
  }

  const pages = await fetchAll(INFO_HOST, 500);
  const map = {};
  for (const p of pages) {
    const m = p.url.match(/\/([^\/]+)\.html$/);
    if (!m) continue;
    const slug = m[1];
    map[slug] = { title: p.title, published: p.published, url: p.url, html: p.html };
    const pageUrl = `${SITE_URL}p/${slug}/`;
    await writePage(`p/${slug}`, articlePage({
      title: p.title,
      description: p.description,
      image: p.thumb,
      pageUrl,
      date: p.published,
      body: p.html
    }));
    addSitemap(pageUrl);
  }
  await writeFile('data/info.json', JSON.stringify(map));
  console.log(`info: ${Object.keys(map).length} halaman`);

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapUrls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`;
  await writeFile('sitemap.xml', sitemap);
  console.log(`sitemap: ${sitemapUrls.length} URL`);

  await writeFile('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${SITE_URL}sitemap.xml\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

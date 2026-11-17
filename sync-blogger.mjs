// Sinkron feed Blogger -> data/*.json + halaman berbagi statis (a/... dan p/...)
// Dijalankan oleh GitHub Actions (Node 20+, tanpa dependensi).
//
// Wajib: env SITE_URL, mis. https://username.github.io/nama-repo/
// Opsional: env DEFAULT_IMAGE (gambar pratinjau bila artikel tidak punya gambar)

import { mkdir, rm, writeFile } from 'node:fs/promises';

const SITE_URL = (process.env.SITE_URL || '').replace(/\/?$/, '/');
if (!/^https:\/\//.test(SITE_URL)) {
  console.error('SITE_URL belum diisi, mis. https://username.github.io/nama-repo/');
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
const POST_LIMIT = 300; // jumlah postingan terbaru per blog yang disalin

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

// Halaman berbagi: crawler (WhatsApp, Facebook, dll.) membaca tag og:, pengunjung langsung diarahkan ke halaman utama.
function sharePage({ title, description, image, pageUrl, target }) {
  const t = esc(title);
  const d = esc(description || SITE_NAME);
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${t} - ${SITE_NAME}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta name="twitter:card" content="summary_large_image">
<meta http-equiv="refresh" content="0; url=${esc(target)}">
<script>location.replace(${JSON.stringify(target)});</script>
</head>
<body>
<h1>${t}</h1>
<p>${d}</p>
<p><a href="${esc(target)}">Buka di situs ${SITE_NAME}</a></p>
</body>
</html>
`;
}

async function writeShare(rel, data) {
  await mkdir(rel, { recursive: true });
  await writeFile(`${rel}/index.html`, sharePage(data));
}

async function main() {
  await rm('data', { recursive: true, force: true });
  await rm('a', { recursive: true, force: true });
  await rm('p', { recursive: true, force: true });
  await mkdir('data', { recursive: true });
  await mkdir('a', { recursive: true });
  await mkdir('p', { recursive: true });

  // Blog daftar: berita, mading, foto, video
  for (const [key, host] of Object.entries(BLOGS)) {
    const posts = await fetchAll(host, POST_LIMIT);
    const index = posts.map(({ id, title, published, thumb, excerpt }) => ({ id, title, published, thumb, excerpt }));
    await writeFile(`data/${key}.json`, JSON.stringify(index));
    for (const p of posts) {
      if (!p.id) continue;
      await writeShare(`a/${key}/${p.id}`, {
        title: p.title,
        description: p.description,
        image: p.thumb,
        pageUrl: `${SITE_URL}a/${key}/${p.id}/`,
        target: `${SITE_URL}#a/${key}/${p.id}`
      });
    }
    console.log(`${key}: ${posts.length} postingan`);
  }

  // Blog info: halaman Profil, Akademik, dst. (kunci = slug)
  const pages = await fetchAll(INFO_HOST, 500);
  const map = {};
  for (const p of pages) {
    const m = p.url.match(/\/([^\/]+)\.html$/);
    if (!m) continue;
    const slug = m[1];
    map[slug] = { title: p.title, published: p.published, url: p.url, html: p.html };
    await writeShare(`p/${slug}`, {
      title: p.title,
      description: p.description,
      image: p.thumb,
      pageUrl: `${SITE_URL}p/${slug}/`,
      target: `${SITE_URL}#p/${slug}`
    });
  }
  await writeFile('data/info.json', JSON.stringify(map));
  console.log(`info: ${Object.keys(map).length} halaman`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

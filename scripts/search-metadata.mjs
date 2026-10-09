import {readFile,writeFile} from 'node:fs/promises';

const origin=(process.env.SITE_URL||'https://aniozu.github.io/motion-strobe').replace(/\/+$/,'');
const pages=[
 {lang:'ja',file:'dist/index.html',path:'/',locale:'ja_JP',name:'モーションストロボ',title:'モーションストロボ｜無料のストロボ合成・動画で運動解析',description:'モーションストロボは、動画から一定間隔で動きを切り取り、ストロボ写真・動画を無料で作成できるアプリです。物体の位置検出、座標の校正、運動のグラフ表示や関数フィットに対応。スマホ・iPad・PCのブラウザで使えます。'},
 {lang:'en',file:'dist/en/index.html',path:'/en/',locale:'en_US',name:'Motion Strobe',title:'Motion Strobe | Free Video Motion Analysis & Strobe Photos',description:'Create strobe photos and videos for free. Track object positions, calibrate distances, and analyze motion with graphs and curve fitting in your browser.'}
];
const escapeHtml=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const stripSearchMetadata=html=>html.replace(/<!-- search-metadata:start -->[\s\S]*?<!-- search-metadata:end -->\r?\n?/g,'');

export async function writeSearchMetadata(version){
 for(const page of pages){
  let html=stripSearchMetadata(await readFile(page.file,'utf8'));
  html=html.replace(/<title>[\s\S]*?<\/title>/g,'')
   .replace(/<meta\b[^>]*\bname="(?:description|robots)"[^>]*>/g,'')
   .replace(/<link\b[^>]*\brel="(?:canonical|alternate)"[^>]*>/g,'');
  const url=origin+page.path;
  const schema={'@context':'https://schema.org','@graph':[
   {'@type':'WebSite','@id':origin+'/#website',name:page.name,url:origin+'/',inLanguage:['ja','en']},
   {'@type':'WebApplication','@id':url+'#application',name:page.name,url,description:page.description,applicationCategory:'EducationalApplication',operatingSystem:'Any',inLanguage:page.lang,isAccessibleForFree:true,softwareVersion:version}
  ]};
  const metadata=[
   '<!-- search-metadata:start -->',
   `<title>${escapeHtml(page.title)}</title>`,
   `<meta name="description" content="${escapeHtml(page.description)}">`,
   '<meta name="robots" content="index,follow,max-image-preview:large">',
   `<link rel="canonical" href="${url}">`,
   ...pages.map(other=>`<link rel="alternate" hreflang="${other.lang}" href="${origin+other.path}">`),
   `<link rel="alternate" hreflang="x-default" href="${origin}/">`,
   '<meta property="og:type" content="website">',
   `<meta property="og:site_name" content="${escapeHtml(page.name)}">`,
   `<meta property="og:title" content="${escapeHtml(page.title)}">`,
   `<meta property="og:description" content="${escapeHtml(page.description)}">`,
   `<meta property="og:url" content="${url}">`,
   `<meta property="og:locale" content="${page.locale}">`,
   `<script type="application/ld+json">${JSON.stringify(schema).replaceAll('<','\\u003c')}</script>`,
   '<!-- search-metadata:end -->'
  ].join('\n');
  await writeFile(page.file,html.replace('</head>',metadata+'\n</head>'));
 }
 await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
 await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(page=>`  <url><loc>${origin+page.path}</loc></url>`).join('\n')}\n</urlset>\n`);
}

import {readFile,writeFile} from 'node:fs/promises';
import {languages,languagePath,languageFile} from './languages.mjs';
import {learningPages} from './learning-pages.mjs';
export const searchOrigin=(process.env.SITE_URL||(process.env.GITHUB_PAGES==='true'?'https://aniozu.github.io/motion-strobe':'https://motion-strobe-lab.workspace-552571.chatgpt.site')).replace(/\/+$/,'');
export const searchPages=[
 ...languages.map(l=>({...l,lang:l.code,file:languageFile(l.code),path:'/'+languagePath(l.code),slug:'app',name:l.code==='ja'?'モーションストロボ':'Motion Strobe',image:'sample-constant-speed.png'})),
 ...learningPages.map(p=>({...p,title:`${p.name}${p.lang==='ja'?'｜':' | '}${p.title.replace(/ Motion Strobe$/, '')}`,description:`${p.name}${p.lang==='ja'?(p.slug==='guide'?'の使い方。':'の解析例。'):' — '}${p.description}`,image:p.image||'sample-constant-speed.png'}))
];
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
export const stripSearchMetadata=html=>html.replace(/<!-- search-metadata:start -->[\s\S]*?<!-- search-metadata:end -->\r?\n?/g,'');
export const alternatePages=page=>searchPages.filter(other=>other.slug===page.slug);
export async function writeSearchMetadata(version){
 const origin=searchOrigin;
 for(const page of searchPages){
  let html=stripSearchMetadata(await readFile(page.file,'utf8'));
  html=html.replace(/<title>[\s\S]*?<\/title>/g,'').replace(/<meta\b[^>]*\bname="(?:description|robots)"[^>]*>/g,'').replace(/<link\b[^>]*\brel="(?:canonical|alternate)"[^>]*>/g,'');
  const url=origin+page.path,peers=alternatePages(page),image=origin+'/'+page.image;
  const website={'@type':'WebSite','@id':origin+'/#website',name:page.name,...(page.lang==='ja'?{alternateName:'Motion Strobe'}:{}),url:origin+'/',inLanguage:languages.map(l=>l.code)};
  const webpage={'@type':'WebPage','@id':url+'#page',url,name:page.title,description:page.description,inLanguage:page.lang,isPartOf:{'@id':origin+'/#website'},primaryImageOfPage:{'@type':'ImageObject',url:image}};
  const entity=page.slug==='app'
   ?{'@type':'WebApplication','@id':url+'#application',name:page.name,url,description:page.description,applicationCategory:'EducationalApplication',operatingSystem:'Any',inLanguage:page.lang,isAccessibleForFree:true,softwareVersion:version,offers:{'@type':'Offer',price:'0',priceCurrency:'USD'}}
   :{'@type':'Article','@id':url+'#article',headline:page.title,description:page.description,inLanguage:page.lang,mainEntityOfPage:{'@id':url+'#page'},image:[image]};
  const nodes=[website,webpage,entity];
  if(page.slug!=='app')nodes.push({'@type':'BreadcrumbList','@id':url+'#breadcrumb',itemListElement:[{'@type':'ListItem',position:1,name:page.name,item:origin+'/'+languagePath(page.lang)},{'@type':'ListItem',position:2,name:page.title,item:url}]});
  const metadata=[
   '<!-- search-metadata:start -->',
   `<title>${escape(page.title)}</title>`,
   `<meta name="description" content="${escape(page.description)}">`,
   '<meta name="robots" content="index,follow,max-image-preview:large">',
   `<link rel="canonical" href="${escape(url)}">`,
   ...peers.map(other=>`<link rel="alternate" hreflang="${other.lang}" href="${escape(origin+other.path)}">`),
   `<link rel="alternate" hreflang="x-default" href="${escape(origin+peers.find(p=>p.lang==='ja').path)}">`,
   `<meta property="og:type" content="${page.slug==='app'?'website':'article'}">`,
   `<meta property="og:site_name" content="${escape(page.name)}">`,
   `<meta property="og:title" content="${escape(page.title)}">`,
   `<meta property="og:description" content="${escape(page.description)}">`,
   `<meta property="og:url" content="${escape(url)}">`,
   `<meta property="og:locale" content="${page.locale}">`,
   ...peers.filter(p=>p.lang!==page.lang).map(p=>`<meta property="og:locale:alternate" content="${p.locale}">`),
   `<meta property="og:image" content="${escape(image)}">`,
   `<meta property="og:image:alt" content="${escape(page.alt||page.title)}">`,
   '<meta name="twitter:card" content="summary_large_image">',
   `<meta name="twitter:title" content="${escape(page.title)}">`,
   `<meta name="twitter:description" content="${escape(page.description)}">`,
   `<meta name="twitter:image" content="${escape(image)}">`,
   `<script type="application/ld+json">${JSON.stringify({'@context':'https://schema.org','@graph':nodes}).replaceAll('<','\\u003c')}</script>`,
   '<!-- search-metadata:end -->'
  ].join('\n');
  await writeFile(page.file,html.replace('</head>',metadata+'\n</head>'));
 }
 await writeFile('dist/robots.txt',`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`);
 const entries=searchPages.map(page=>`  <url><loc>${escape(origin+page.path)}</loc>${alternatePages(page).map(other=>`<xhtml:link rel="alternate" hreflang="${other.lang}" href="${escape(origin+other.path)}"/>`).join('')}<image:image><image:loc>${escape(origin+'/'+page.image)}</image:loc></image:image></url>`);
 await writeFile('dist/sitemap.xml',`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n${entries.join('\n')}\n</urlset>\n`);
}

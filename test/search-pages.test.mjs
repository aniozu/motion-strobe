import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
import {searchOrigin,searchPages,alternatePages} from '../scripts/search-metadata.mjs';
import {learningPages,homeLearning} from '../scripts/learning-pages.mjs';
import {languages,languageFile} from '../scripts/languages.mjs';
import {samples} from '../src/samples.js';

const attr=(s,name)=>s.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
const unescape=s=>s.replaceAll('&amp;','&').replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>');
const documentUrl=page=>searchOrigin+page.path;

test('every search entry has one unique canonical, localized metadata and truthful structured data',async()=>{
 assert.equal(searchPages.length,18);assert.equal(new Set(searchPages.map(p=>p.path)).size,18);
 const titles=new Set();
 for(const page of searchPages){
  const html=await readFile(page.file,'utf8'),url=documentUrl(page);
  const title=unescape(html.match(/<title>([^<]*)<\/title>/)[1]);assert.equal(title,page.title);assert(!titles.has(title));titles.add(title);
  assert.equal([...html.matchAll(/rel="canonical"/g)].length,1);assert(html.includes(`rel="canonical" href="${url}"`));
  assert(html.includes('name="description"'));assert(html.includes('index,follow'));assert(!html.includes('name="keywords"'));
  assert(html.includes(`property="og:image" content="${searchOrigin}/${page.image}"`));assert(html.includes('name="twitter:card" content="summary_large_image"'));
  const schema=JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert(!JSON.stringify(schema).includes('aggregateRating'));assert(!JSON.stringify(schema).includes('FAQPage'));
  const entity=schema['@graph'].find(x=>x['@type']===(page.slug==='app'?'WebApplication':'Article'));
  assert(entity);assert.equal(entity.inLanguage,page.lang);
  if(page.slug==='app')assert.equal(entity.offers.price,'0');else assert.equal(entity.mainEntityOfPage['@id'],url+'#page');
 }
});

test('hreflang is reciprocal for the same content and never labels untranslated guides as another language',async()=>{
 for(const page of searchPages){
  const html=await readFile(page.file,'utf8'),peers=alternatePages(page);
  assert.equal([...html.matchAll(/<link rel="alternate" hreflang=/g)].length,peers.length+1);
  for(const peer of peers){assert(html.includes(`hreflang="${peer.lang}" href="${documentUrl(peer)}"`));assert.equal(peer.slug,page.slug);}
  if(page.slug!=='app')assert.deepEqual(peers.map(p=>p.lang),['ja','en']);
 }
});

test('guides contain visible standalone instructions, correct sample links and no automatic video downloads',async()=>{
 for(const page of learningPages){
  const html=await readFile(page.file,'utf8');
  assert.equal([...html.matchAll(/<h1>/g)].length,1);assert(html.includes('<article>'));assert.equal([...html.matchAll(/<section id="section-/g)].length,page.sections.length);
  assert(!html.includes('<video'));assert(!html.includes('src="app.'));assert(html.includes('src="learning.js?v='));
  for(const [heading] of page.sections)assert(html.includes(heading));
  if(page.sample){assert(samples.some(s=>s.id===page.sample));assert(html.includes(`?sample=${page.sample}`));assert(html.includes(`src="${page.image}"`));}
  const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"/g)].map(m=>m[1]);assert.equal(scripts.length,1);
 }
 const analytics=await readFile('dist/learning.js','utf8');assert(analytics.includes('G-3BCPMT58JK'));assert((await stat('dist/learning.js')).size<8000);
});

test('all internal navigation, sections and assets resolve within the current hosting subdirectory',async()=>{
 const prefix=new URL(searchOrigin+'/');
 for(const page of searchPages){
  const html=await readFile(page.file,'utf8'),url=documentUrl(page),base=new URL(html.match(/<base href="([^"]+)"/)?.[1]||url,url);
  const tags=[...html.matchAll(/<(?:a|img|script|link)\b[^>]*>/g)].map(m=>m[0]);
  for(const tag of tags){
   if(tag.startsWith('<link')&&!/rel="(?:stylesheet|icon|apple-touch-icon)"/.test(tag))continue;
   const raw=attr(tag,tag.startsWith('<a')||tag.startsWith('<link')?'href':'src');if(!raw)continue;
   const target=new URL(unescape(raw),base);if(target.origin!==prefix.origin)continue;
   assert(target.pathname.startsWith(prefix.pathname),`${page.path}: ${target}`);
   let relative=decodeURIComponent(target.pathname.slice(prefix.pathname.length));if(!relative||relative.endsWith('/'))relative+='index.html';
   const file='dist/'+relative;assert((await stat(file)).isFile(),`${page.path}: ${file}`);
   if(target.hash){const destination=await readFile(file,'utf8');assert(destination.includes(`id="${target.hash.slice(1)}"`));}
  }
 }
});

test('homepage learning links are crawlable across all languages and regeneration does not duplicate content',async()=>{
 for(const lang of languages){
  const html=await readFile(languageFile(lang.code),'utf8');assert.equal([...html.matchAll(/<!-- learning:start -->/g)].length,1);assert.equal([...html.matchAll(/data-language-links/g)].length,0);assert(!html.includes('class="learn-section"'));assert(html.indexOf(homeLearning(lang,['ja','en'].includes(lang.code)?{}:JSON.parse(await readFile(`translations/${lang.code}.json`,'utf8'))))<html.indexOf('<section id="editor"'));
  const catalog=['ja','en'].includes(lang.code)?{}:JSON.parse(await readFile(`translations/${lang.code}.json`,'utf8'));
  assert(html.includes(homeLearning(lang,catalog)));
 }
 const sitemap=await readFile('dist/sitemap.xml','utf8');assert.equal([...sitemap.matchAll(/<url>/g)].length,18);
 for(const page of searchPages)assert(sitemap.includes(`<loc>${documentUrl(page)}</loc>`));
 assert(sitemap.includes('xmlns:image='));assert(sitemap.includes('xmlns:xhtml='));
});


test('guide pages reuse the exact app header and settings, with only two concise analysis examples',async()=>{
 for(const page of learningPages){
  const html=await readFile(page.file,'utf8'),app=await readFile(languageFile(page.lang),'utf8');
  assert.equal(html.match(/<header>[\s\S]*?<\/header>/)[0],app.match(/<header>[\s\S]*?<\/header>/)[0]);
  assert.equal(html.match(/<dialog id="settingsDialog"[\s\S]*?<\/dialog>/)[0],app.match(/<dialog id="settingsDialog"[\s\S]*?<\/dialog>/)[0]);
  assert(html.includes('href="style.css?v='));assert(!/授業|Classroom|physics lesson|examples\/pendulum/i.test(html));
  if(page.slug==='guide'){assert(html.includes('examples/constant-speed/'));assert(html.includes('examples/projectile-motion/'));assert.equal([...html.matchAll(/class="operation-capture"/g)].length,11);}
 }
 const css=await readFile('dist/learn.css','utf8');assert(!/(?:^|})\s*(?:header|main|body|h1|h2|p|:root|\*)[ {]/m.test(css));
 for(const lang of ['ja','en']){const old=await readFile(`dist/${lang==='en'?'en/':''}examples/pendulum/index.html`,'utf8');assert(old.includes('noindex,follow'));assert(old.includes('url=../../guide/'));}
});

test('illustrated guides explain filming and sensitivity before detection, then display and export',async()=>{
 const metadata=JSON.parse(await readFile('dist/guide-images/captures.json','utf8'));
 for(const lang of ['ja','en']){
  const page=learningPages.find(p=>p.lang===lang&&p.slug==='guide');
  assert.equal(page.sections.length,9);
  assert.deepEqual(page.sections.flatMap(s=>s[2]?[s[2]].flat():[]),['range-013-073','range-end-013-073','sampling-preview-005','sampling-005','result-013-073','video-options','detection-005','grid-settings','grid-result','coordinates','graphs']);
  const html=await readFile(page.file,'utf8');
  assert(!html.includes('<figcaption>'));
  assert(!html.match(/class="guide-toc"[\s\S]*?<li><a[^>]*>1\./));
  assert(html.includes(lang==='ja'?'三脚':'tripod'));
  assert(html.includes(lang==='ja'?'数値を下げる':'Lower values'));
  assert(html.includes(lang==='ja'?'数値を':'Higher values'));
  assert(html.includes('0.13'));assert(html.includes('0.73'));assert(html.includes('0.05'));
  for(const [name,entry] of Object.entries(metadata).filter(([name])=>name.startsWith(lang+'-'))){
   assert.equal(entry.frames,13);assert.equal(entry.intervalSeconds,0.05);
   assert(entry.width>900&&entry.height>600);assert((await stat('dist/guide-images/'+name)).size>10000);
   assert(html.includes(`width="${entry.width}" height="${entry.height}"`));
  }
 }
 const home=await readFile(languageFile('ja'),'utf8');assert(home.includes('class="secondary guide-entry"'));assert(home.includes('🔰'));
});

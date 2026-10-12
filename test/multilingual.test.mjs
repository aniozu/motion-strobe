import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {languages,languagePath,languageFile,untranslatedJapanesePattern} from '../scripts/languages.mjs';
import {localizeJavaScript} from '../scripts/localize.mjs';
import {installLanguagePicker} from '../src/language-picker.js';
import {transform} from 'esbuild';
import {searchPages} from '../scripts/search-metadata.mjs';

const extra=languages.filter(l=>!['ja','en'].includes(l.code));
const jsEnglish=JSON.parse(await readFile('translations/en-js.json','utf8'));
const ids=s=>[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort();
const controls=s=>[...s.matchAll(/<(?:input|select|button)\b[^>]*\bid="[^"]+"[^>]*>/g)].map(m=>m[0].replace(/\s(?:aria-label|title|placeholder|data-short)="[^"]*"/g,'')).sort();
const withoutPicker=s=>s.replace(/<select\b[^>]*id="languageSelect"[^>]*>[\s\S]*?<\/select>/,'').replace(/<nav\b[^>]*data-language-links[^>]*>[\s\S]*?<\/nav>/,'');

test('all language pages keep the same controls and explicit language routes',async()=>{
 const jp=await readFile(languageFile('ja'),'utf8');
 for(const l of languages){
  const html=await readFile(languageFile(l.code),'utf8');
  assert.deepEqual(ids(html),ids(jp),l.code);
  assert.equal(ids(html).length,new Set(ids(html)).size,l.code);
  assert.deepEqual(controls(html),controls(jp),l.code);
  assert.match(html,new RegExp(`<html lang="${l.code}">`));
  for(const other of languages)assert(html.includes(`value="${other.code}" data-url="${languagePath(other.code)||'./'}"`));
  const picker=html.match(/<select\b[^>]*id="languageSelect"[^>]*>[\s\S]*?<\/select>/)[0];
  assert.equal([...picker.matchAll(/<option\b[^>]* selected/g)].length,1);
  assert(html.includes(`value="${l.code}" data-url="${languagePath(l.code)||'./'}" lang="${l.code}" selected`));
  if(l.code!=='ja'){
   assert.match(html,/<base href="\.\.\/">/);
   assert(!untranslatedJapanesePattern(l.code).test(withoutPicker(html)),l.code);
   assert(html.includes(`src="app.${l.code}.js?v=`));
  }
  assert(html.indexOf('result-group result-detection')<html.indexOf('result-group result-display'));
  assert.match(html,/<option value="8">×8<\/option>/);
  assert(!html.includes('class="shooting-tips"'));assert(!html.includes('id="autoBackgroundHint"'));
 }
});

test('every active message, help paragraph and JS template is translated and remains executable',async()=>{
 const sources=await Promise.all((await readdir('src')).filter(f=>f.endsWith('.js')).map(async f=>[f,await readFile(`src/${f}`,'utf8')]));
 for(const l of extra){
  const catalog=JSON.parse(await readFile(`translations/${l.code}.json`,'utf8'));
  const dictionary=Object.fromEntries(Object.entries(jsEnglish).map(([jp,en])=>[jp,catalog[en]]));
  for(const [name,source] of sources){
   const result=localizeJavaScript(source,dictionary);
   assert(!untranslatedJapanesePattern(l.code).test(result.code),`${l.code}/${name}`);
   await transform(result.code,{loader:'js',format:'esm'});
  }
  const app=await readFile(`dist/app.${l.code}.js`,'utf8');
  assert(app.includes(`worker.${l.code}.js?v=`));
  const audio=await readFile(`dist/worker.${l.code}.js`,'utf8');
  assert(audio.includes(`software-aac.${l.code}.js?v=`));
  assert(catalog['Reference frame']!==catalog['Background']);
  assert(catalog['Capture fps']!==catalog['frames/s']);
  const speeds=catalog['Select Video, then choose ×0.25, ×0.5, ×1, ×2, ×4 or ×8 speed. Speeds other than ×1 are shown in the video.'];
  for(const speed of ['×0.25','×0.5','×1','×2','×4','×8'])assert(speeds.includes(speed));
 }
});

test('language changes preserve the hosting subdirectory without relying on root URLs',()=>{
 for(const host of ['https://aniozu.github.io/motion-strobe/','https://motion-strobe-lab.workspace-552571.chatgpt.site/']){
  for(const current of languages){
   const currentUrl=host+languagePath(current.code);
   const baseURI=current.code==='ja'?currentUrl:new URL('../',currentUrl).href;
   for(const target of languages){
    let changed,handler;
    const picker={selectedOptions:[{dataset:{url:languagePath(target.code)||'./'}}],addEventListener:(event,fn)=>{assert.equal(event,'change');handler=fn;}};
    installLanguagePicker({doc:{baseURI,getElementById:()=>picker},location:{assign:url=>changed=url}});
    handler();assert.equal(changed,host+languagePath(target.code));
   }
  }
 }
});

test('translated HTML templates preserve tags and machine-readable attributes',async()=>{
 const tags=s=>[...s.matchAll(/<\/?[a-z][^>]*>/gi)].map(m=>m[0].replace(/\s(?:aria-label|title|placeholder|data-short)="[^"]*"/g,''));
 for(const l of extra){
  const catalog=JSON.parse(await readFile(`translations/${l.code}.json`,'utf8'));
  for(const [en,text] of Object.entries(catalog))assert.deepEqual(tags(text),tags(en),`${l.code}: ${en}`);
 }
});

test('language metadata lists all routes without repeating or leaking the other host',async()=>{
 const origin=(process.env.SITE_URL||(process.env.GITHUB_PAGES==='true'?'https://aniozu.github.io/motion-strobe':'https://motion-strobe-lab.workspace-552571.chatgpt.site')).replace(/\/+$/,'');
 const sitemap=await readFile('dist/sitemap.xml','utf8');
 for(const l of languages){
  const html=await readFile(languageFile(l.code),'utf8');
  assert(html.includes(`<link rel="canonical" href="${origin}/${languagePath(l.code)}">`));
  assert(sitemap.includes(`<loc>${origin}/${languagePath(l.code)}</loc>`));
  for(const other of languages)assert(html.includes(`hreflang="${other.code}" href="${origin}/${languagePath(other.code)}"`));
  assert.equal([...html.matchAll(/<link rel="canonical"/g)].length,1);
 }
 assert.equal([...sitemap.matchAll(/<loc>/g)].length,searchPages.length);
});

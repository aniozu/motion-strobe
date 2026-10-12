import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {localizeJavaScript} from './scripts/localize.mjs';
import {stripSearchMetadata,writeSearchMetadata} from './scripts/search-metadata.mjs';
import {languages,languagePath,languageFile,untranslatedJapanesePattern} from './scripts/languages.mjs';
import {homeLearning,writeLearningPages} from './scripts/learning-pages.mjs';

const version=JSON.parse(await readFile('package.json','utf8')).version;
const jsEnglish=JSON.parse(await readFile('translations/en-js.json','utf8'));
const htmlEnglish=JSON.parse(await readFile('translations/en-html.json','utf8'));
const catalogs=new Map();
for(const language of languages.filter(l=>!['ja','en'].includes(l.code)))catalogs.set(language.code,JSON.parse(await readFile(`translations/${language.code}.json`,'utf8')));
const entries=['src/app.js','src/worker.js','src/opening.js','src/software-aac.js'];
await build({entryPoints:[...entries,'src/learning.js'],outdir:'dist',bundle:true,format:'esm',target:['es2022'],minify:true,legalComments:'eof'});
for(const {code} of languages.filter(l=>l.code!=='ja')){
 const catalog=catalogs.get(code);
 const translations=Object.fromEntries(Object.entries(jsEnglish).map(([jp,en])=>[jp,code==='en'?en:catalog[en]]));
 const plugin={name:`language-${code}`,setup(builder){builder.onLoad({filter:/\.js$/},async args=>{
  if(!args.path.startsWith(resolve('src')+'/'))return null;
  let source=localizeJavaScript(await readFile(args.path,'utf8'),translations).code;
  source=source.replaceAll("'worker.js?v=",`'worker.${code}.js?v=`).replaceAll("'software-aac.js?v=",`'software-aac.${code}.js?v=`);
  return {contents:source,loader:'js'};
 });}};
 await build({entryPoints:entries,outdir:'dist',outExtension:{'.js':`.${code}.js`},bundle:true,format:'esm',target:['es2022'],minify:true,legalComments:'eof',plugins:[plugin]});
}

const template=stripSearchMetadata(await readFile('dist/index.html','utf8'))
 .replace(/<!-- learning:start -->[\s\S]*?<!-- learning:end -->\r?\n?/g,'')
 .replace(/<base\b[^>]*>/g,'')
 .replace(/<select\b[^>]*id="languageSelect"[^>]*>[\s\S]*?<\/select>/g,'')
 .replace(/<a\b[^>]*class="language-switch"[^>]*>[\s\S]*?<\/a>/g,'')
 .replace(/\bv=\d+\.\d+\.\d+/g,`v=${version}`);
const escape=s=>s.replaceAll('&','&amp;').replaceAll('"','&quot;');
for(const language of languages){
 const {code}=language;let html=template;
 if(code!=='ja'){
  const catalog=catalogs.get(code);
  for(const [jp,en] of Object.entries(htmlEnglish).sort((a,b)=>b[0].length-a[0].length)){
   if(!html.includes(jp))continue;
   const value=code==='en'?en:catalog[en];
   if(value===undefined)throw Error(`Missing ${code} HTML translation: ${en}`);
   html=html.replaceAll(jp,value);
  }
  if(untranslatedJapanesePattern(code).test(html))throw Error(`Untranslated Japanese in ${code} HTML`);
  html=html.replace('<html lang="ja">',`<html lang="${code}">`).replace('<head>','<head><base href="../">')
   .replace('class="brand" href="./"',`class="brand" href="${languagePath(code)}"`)
   .replace(/src="(app|opening)\.js(\?[^"]*)?"/g,`src="$1.${code}.js$2"`);
 }
 const picker=`<select id="languageSelect" class="language-picker" aria-label="${escape(language.label)}">${languages.map(l=>`<option value="${l.code}" data-url="${languagePath(l.code)||'./'}" lang="${l.code}"${l.code===code?' selected':''}>${l.name}</option>`).join('')}</select>`;
 html=html.replace('<div class="header-actions">',`<div class="header-actions">${picker}`);
 html=html.replace('<p class="privacy">',`<!-- learning:start -->${homeLearning(language,catalogs.get(code))}<!-- learning:end --><p class="privacy">`);
 await mkdir(`dist/${languagePath(code)}`,{recursive:true});await writeFile(languageFile(code),html);
}
await writeFile('dist/.nojekyll','');
await writeLearningPages(version);
await writeSearchMetadata(version);

import {build} from 'esbuild';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {localizeJavaScript} from './scripts/localize.mjs';
import {stripSearchMetadata,writeSearchMetadata} from './scripts/search-metadata.mjs';

const version=JSON.parse(await readFile('package.json','utf8')).version;
await build({entryPoints:['src/app.js','src/worker.js','src/opening.js'],outdir:'dist',bundle:true,format:'esm',target:['es2022'],minify:true,legalComments:'eof'});

const jsTranslations=JSON.parse(await readFile('translations/en-js.json','utf8'));
const enPlugin={name:'english-text',setup(build){build.onLoad({filter:/\.js$/},async args=>{
 if(!args.path.startsWith(resolve('src')+'/'))return null;
 let source=await readFile(args.path,'utf8');
 source=localizeJavaScript(source,jsTranslations).code;
 if(basename(args.path)==='app.js')source=source.replace("'worker.js?v=", "'worker.en.js?v=");
 source=source.replaceAll('1.14.3',version);
 return {contents:source,loader:'js'};
});}};
await build({entryPoints:['src/app.js','src/worker.js','src/opening.js'],outdir:'dist',outExtension:{'.js':'.en.js'},bundle:true,format:'esm',target:['es2022'],minify:true,legalComments:'eof',plugins:[enPlugin]});

const htmlTranslations=JSON.parse(await readFile('translations/en-html.json','utf8'));
let html=stripSearchMetadata(await readFile('dist/index.html','utf8')).replaceAll('href="en/"','href="/en/"').replace(/\bv=\d+\.\d+\.\d+/g,`v=${version}`);
for(const [jp,en] of Object.entries(htmlTranslations).sort((a,b)=>b[0].length-a[0].length))html=html.replaceAll(jp,en);
if(/[\u3040-\u30ff\u3400-\u9fff]/.test(html))throw Error('English HTML contains untranslated Japanese text.');
html=html.replace('<html lang="ja">','<html lang="en">')
 .replace('<head>','<head><base href="../"><link rel="alternate" hreflang="ja" href="./"><link rel="alternate" hreflang="en" href="en/">')
 .replace('class="brand" href="./"','class="brand" href="en/"')
 .replace('<a class="language-switch" href="/en/" lang="en" hreflang="en" aria-label="Switch to English">English</a>','')
 .replace('<div class="header-actions">','<div class="header-actions"><a class="language-switch" href="./" lang="ja" hreflang="ja" aria-label="Switch to Japanese">日本語</a>')
 .replace(`src="opening.js?v=${version}"`,`src="opening.en.js?v=${version}"`)
 .replace(`src="app.js?v=${version}"`,`src="app.en.js?v=${version}"`);
await mkdir('dist/en',{recursive:true});await writeFile('dist/en/index.html',html);

let japanese=stripSearchMetadata(await readFile('dist/index.html','utf8')).replaceAll('href="en/"','href="/en/"').replace(/\bv=\d+\.\d+\.\d+/g,`v=${version}`);
if(!japanese.includes('class="language-switch"'))japanese=japanese.replace('<div class="header-actions">','<div class="header-actions"><a class="language-switch" href="/en/" lang="en" hreflang="en" aria-label="Switch to English">English</a>');
if(!japanese.includes('href="/en/"'))throw Error('Missing language link.');
await writeFile('dist/index.html',japanese.replaceAll('href="/en/"','href="en/"'));
await writeFile('dist/.nojekyll','');
await writeSearchMetadata(version);

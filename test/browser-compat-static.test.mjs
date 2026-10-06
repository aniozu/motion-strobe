import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=name=>readFile(new URL(name,import.meta.url),'utf8');
test('opening poster, worker, and asset cache versions agree with the release',async()=>{
 const [html,app,opening,manifest]=await Promise.all([read('../dist/index.html'),read('../dist/app.js'),read('../dist/opening.js'),read('../package.json')]);
 const version=JSON.parse(manifest).version;
 assert(opening.includes(`opening-projectile-poster.webp?v=${version}`));assert(opening.includes(`opening-projectile.gif?v=${version}`));assert(app.includes(`worker.js?v=${version}`));
 assert(html.includes(`opening.js?v=${version}`));assert(html.includes(`opening-projectile-start.webp?v=${version}`));
});
test('picked files use the probe and processing diagnostics are available in the deployed UI',async()=>{
 const [html,source,app]=await Promise.all([read('../dist/index.html'),read('../src/app.js'),read('../dist/app.js')]);
 assert.match(source,/safeVideoBlob\(file\)/);assert.match(source,/await probeVideoBlob\(blob\)/);
 for(const id of ['decodeReport','decodeReportText','copyDecodeReport','retryDecode']){assert(html.includes(`id="${id}"`));assert(app.includes(id));}
});


test('opening GIF has no picture source that can override it with an OS-selected still, and settings exposes explicit animation control',async()=>{
 const [html,css]=await Promise.all([read('../dist/index.html'),read('../dist/style.css')]);
 assert(!html.includes('homeExampleStill'));assert(!html.includes('prefers-reduced-motion'));assert(html.includes('id="openingAnimation"'));
 assert(!css.includes('@media(prefers-reduced-motion:no-preference)'));assert(css.includes('html[data-home-animation=off] .home-visual'));
});

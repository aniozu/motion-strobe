import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {localizeJavaScript} from '../scripts/localize.mjs';

test('English and Japanese routes keep the same controls and link to each other',async()=>{
 const [jp,en]=await Promise.all(['dist/index.html','dist/en/index.html'].map(f=>readFile(f,'utf8')));
 const ids=s=>[...s.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]).sort();
 assert.deepEqual(ids(en),ids(jp));
 assert.match(jp,/lang="ja"/);assert.match(en,/lang="en"/);
 assert.match(jp,/class="language-switch" href="en\/"/);
 assert.match(en,/class="language-switch" href="\.\/"/);
 assert.match(en,/src="app\.en\.js\?v=/);assert.match(en,/src="opening\.en\.js\?v=/);
 assert.match(en,/<base href="\.\.\/">/);
 assert.match(en,/Analyze motion from video/);
 assert.match(jp,/モーションストロボは、動画から一定間隔で動きを切り取り、<br>ストロボ写真・動画を作成します。/);
 assert.match(en,/Motion Strobe samples motion from video at regular intervals<br>to create strobe photos and videos\./);
 assert.match(en,/Center grid/);
 assert.doesNotMatch(en.replace('日本語',''),/[\u3040-\u30ff\u3400-\u9fff]/);
});

test('English build covers every Japanese message, help topic and CSV header',async()=>{
 const translations=JSON.parse(await readFile('translations/en-js.json','utf8'));
 for(const file of (await readdir('src')).filter(f=>f.endsWith('.js'))){
  const source=await readFile(`src/${file}`,'utf8');
  const code=localizeJavaScript(source,translations).code;
  assert.doesNotMatch(code,/[\u3040-\u30ff\u3400-\u9fff]/,file);
 }
 const [app,worker]=await Promise.all(['dist/app.en.js','dist/worker.en.js'].map(f=>readFile(f,'utf8')));
 assert.match(app,/worker\.en\.js/);
 assert.match(app,/Time \(s\)/);
 assert.match(worker,/Extracting frames/);
});

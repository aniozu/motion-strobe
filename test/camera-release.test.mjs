import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {languages,languageFile} from '../scripts/languages.mjs';

test('release pages expose one optional correction checkbox without test-startup handlers or explanatory notes',()=>{
 for(const {code} of languages){
  const html=readFileSync(languageFile(code),'utf8'),app=readFileSync(`dist/app${code==='ja'?'':'.'+code}.js`,'utf8');
  assert.equal((html.match(/id="stabilizeCamera"/g)||[]).length,1,code);
  assert(!/tryStabilization|stabilizationSample|stabilization-test/.test(html+app),code);
  assert(/id="stabilizationResult"[^>]*role="status"/.test(html));
  const option=html.match(/<div class="camera-correction-option">([\s\S]*?)<\/div>/)?.[1];
  assert(option&&option.includes('type="checkbox"'));assert(!/<p\b/.test(option));
 }
});

test('the range guide leads with timeline markers and has no device-dependent below-image direction',()=>{
 const ja=readFileSync('dist/guide/index.html','utf8'),en=readFileSync('dist/en/guide/index.html','utf8');
 assert(ja.includes('時刻バーの「開始」「終了」の点をドラッグ'));assert(ja.indexOf('時刻バーの「開始」「終了」の点をドラッグ')<ja.indexOf('「時間範囲」の±ボタン'));
 assert(en.includes('Drag the Start and End markers on the timeline'));assert(!ja.includes('画像の下の時間バー'));assert(!en.includes('timeline below the image'));
});

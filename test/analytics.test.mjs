import test from 'node:test';
import assert from 'node:assert/strict';
import {installAnalytics,trackUsage,measurementId} from '../src/analytics.js';

function fixture(href='https://aniozu.github.io/motion-strobe/?filename=private.mov#coordinates'){
 const scripts=[],win={location:{href}};
 const doc={title:'Motion Strobe',referrer:'https://example.org/private-name?q=secret',createElement:()=>({}),head:{append:s=>scripts.push(s)}};
 const calls=()=>Array.from(win.dataLayer||[],row=>Array.from(row));
 return {win,doc,scripts,calls};
}
test('one asynchronous Google tag sends one page view configuration on both language routes and hosts',()=>{
 for(const href of ['https://aniozu.github.io/motion-strobe/','https://aniozu.github.io/motion-strobe/en/','https://motion-strobe-lab.workspace-552571.chatgpt.site/','https://motion-strobe-lab.workspace-552571.chatgpt.site/en/']){
  const f=fixture(href);assert(installAnalytics(f));assert(installAnalytics(f));
  assert.equal(f.scripts.length,1);assert.equal(f.scripts[0].async,true);
  assert.equal(f.scripts[0].src,`https://www.googletagmanager.com/gtag/js?id=${measurementId}`);
  const configs=f.calls().filter(c=>c[0]==='config');assert.equal(configs.length,1);assert.equal(configs[0][1],measurementId);assert(configs[0][2].send_page_view);
 }
});
test('local use, other domains and other GitHub projects never load analytics',()=>{
 for(const href of ['http://localhost:5173/','http://127.0.0.1:5173/en/','file:///private/video.html','https://example.org/','https://aniozu.github.io/','https://aniozu.github.io/motion-strobe-other/']){
  const f=fixture(href);assert.equal(installAnalytics(f),false);assert.equal(trackUsage('photo_create',{},f.win),false);assert.equal(f.scripts.length,0);assert.equal(f.calls().length,0);
 }
});
test('configuration removes URL queries, fragments and referrer paths and disables advertising signals',()=>{
 const f=fixture();installAnalytics(f);const config=f.calls()[1][2];
 assert.equal(config.page_location,'https://aniozu.github.io/motion-strobe/');assert.equal(config.page_referrer,'https://example.org');
 assert.equal(config.allow_google_signals,false);assert.equal(config.allow_ad_personalization_signals,false);
});
test('usage events accept only fixed categories and cannot transmit file names, coordinates or arbitrary input',()=>{
 const f=fixture();installAnalytics(f);f.scripts[0].onload();
 assert(trackUsage('sample_select',{sample_id:'pendulum',filename:'student.mov',coordinates:[1,2],user_id:'person'},f.win));
 assert.deepEqual(f.calls().at(-1),['event','sample_select',{send_to:measurementId,sample_id:'pendulum'}]);
 assert(trackUsage('video_load',{input_source:'camera',input_value:'student'},f.win));assert.equal(f.calls().at(-1)[2].input_source,'camera');
 assert(trackUsage('result_save',{result_kind:'video',filename:'secret'},f.win));assert.equal(f.calls().at(-1)[2].result_kind,'video');
 assert(trackUsage('sample_select',{sample_id:'private-name'},f.win));assert.deepEqual(f.calls().at(-1)[2],{send_to:measurementId});
 const before=f.calls().length;assert.equal(trackUsage('private_filename.mov',{secret:'data'},f.win),false);assert.equal(trackUsage('toString',{},f.win),false);assert.equal(f.calls().length,before);
});
test('a blocked tag, opt-out or third-party failure never throws; pending event queues stay bounded',()=>{
 const f=fixture();installAnalytics(f);
 for(let i=0;i<100;i++)trackUsage('photo_create',{},f.win);
 assert.equal(f.calls().filter(c=>c[0]==='event').length,50);
 f.scripts[0].onload();assert(trackUsage('photo_create',{},f.win));
 f.scripts[0].onerror();assert.equal(trackUsage('photo_create',{},f.win),false);
 const off=fixture();off.win[`ga-disable-${measurementId}`]=true;assert.equal(installAnalytics(off),false);assert.equal(off.scripts.length,0);
 const bad=fixture();bad.doc.head.append=()=>{throw Error('blocked');};assert.equal(installAnalytics(bad),false);assert.equal(trackUsage('video_create',{},bad.win),false);
 const throwing=fixture();installAnalytics(throwing);throwing.win.gtag=()=>{throw Error('provider failed');};assert.equal(trackUsage('result_save',{result_kind:'photo'},throwing.win),false);
});

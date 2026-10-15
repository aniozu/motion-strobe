import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {SamplingPreview} from '../src/sampling-preview.js';
import {downloadSample} from '../src/sample-download.js';
import {safeVideoBlob,probeVideoBlob} from '../src/media-source.js';
import {parseVideo} from '../src/media.js';
import {samples} from '../src/samples.js';

test('the production sample-selection and file-load handlers reach parsing with browser-style timer receivers',async()=>{
 const source=await readFile('src/app.js','utf8');
 const busy=source.match(/^const busy=.*$/m)[0];
 const load=source.slice(source.indexOf('async function load('),source.indexOf('\nfunction setStep('));
 const choose=source.match(/^installSamples\(.*$/m)[0];
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout;
 const assertReceiver=value=>{if(value!==globalThis&&value!=null)throw TypeError('Illegal invocation');};
 globalThis.setTimeout=function(...args){assertReceiver(this);return originalSet(...args);};
 globalThis.clearTimeout=function(...args){assertReceiver(this);return originalClear(...args);};
 try{
  // Evaluate the real handlers unchanged, supplying only their DOM/worker edges.
  const factory=new Function('SamplingPreview','downloadSample','safeVideoBlob','probeVideoBlob',`
   'use strict';
   const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,focus(){},removeAttribute(){}});return nodes.get(id);};
   const document={activeElement:null},location={search:''};
   const samplingPreview=new SamplingPreview({show:async()=>true,onChange:running=>{$('toggleSamplingPreview').textContent=running?'pause':'preview';}});
   let lastFocus,task,sourceFile,sampleSelection,sampleProgress,demoAbort,inputSource,select;
   const errors=[],posts=[],post=m=>posts.push(m),trackUsage=()=>{},hideError=()=>{},armLoadStall=()=>{};
   const showError=m=>errors.push(m),finishBusy=()=>{task=null;};
   const setProgress=(text,value)=>{$('progressTitle').textContent=text;$('progress').value=value;};
   const installSamples=options=>{select=options.onChoose;};
   ${busy}
   ${load}
   ${choose}
   return {select,load,errors,posts,nodes,getTask:()=>task};
  `);
  // This is the pre-fix callback wiring. The actual selection handler catches
  // its timer exception as a load error, before any request or worker message.
  class PreviousPreview extends SamplingPreview{
   constructor(options){super({...options,schedule:globalThis.setTimeout,cancel:globalThis.clearTimeout});}
  }
  let failedRequests=0;
  const previous=factory(PreviousPreview,async()=>{failedRequests++;return new Blob();},safeVideoBlob,probeVideoBlob);
  await previous.select(samples[0]);
  assert.deepEqual(previous.errors,['サンプルを読み込めませんでした。']);
  assert.equal(failedRequests,0);assert.equal(previous.posts.length,0);
  for(const sample of samples){
   const bytes=await readFile('dist/'+sample.video),requests=[];
   const app=factory(SamplingPreview,(url,options)=>downloadSample(url,{...options,fetcher:async address=>{requests.push(address);return new Response(bytes,{headers:{'Content-Type':'video/mp4','Content-Length':String(bytes.length)}});},yieldTurn:async()=>{}}),safeVideoBlob,probeVideoBlob);
   await app.select(sample);
   assert.equal(app.errors.length,0,sample.id);assert.equal(requests.length,1,sample.id);
   assert.equal(app.posts.length,1,sample.id);assert.equal(app.posts[0].type,'load');assert.equal(app.getTask(),'load');
   const parsed=await parseVideo(app.posts[0].file);assert(parsed.clock.ordered.length>=2,sample.id);
   assert(parsed.config.codec);assert(parsed.track.video.width>0);
  }
  const bytes=await readFile('dist/sample-parabolic-motion.mp4');
  const app=factory(SamplingPreview,downloadSample,safeVideoBlob,probeVideoBlob);
  await app.load(new File([bytes],'selected.mp4',{type:'video/mp4'}));
  assert.deepEqual(app.errors,[]);assert.equal(app.posts[0].type,'load');assert.equal(app.getTask(),'load');
 }finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});

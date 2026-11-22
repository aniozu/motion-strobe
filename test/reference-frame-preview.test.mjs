import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// Validates the reference-seek state machine as embedded in src/app.js.
// The source does not import DOM modules into Node; use a narrow extraction.
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const from=app.indexOf('let referencePreviewAbort=null,referencePreviewSequence=0;');
const to=app.indexOf('const samplingPreview=new SamplingPreview',from);
assert.ok(from>=0&&to>from,'reference preview implementation must exist');
const implementation=app.slice(from,to);

function harness(){
 const pending=[];
 const frames=[];
 const state={stage:'sampling',samplingPreviewMode:'reference',reference:1};
 const video={readyState:4,duration:1,getAttribute:()=> 'blob:test'};
 const samplingSurface={
  frame:null,active:false,
  hide(){this.frame=null;this.active=false;},
  prepare(index,target,{signal}){
   return new Promise(resolve=>pending.push({index,target,signal,resolve}));
  }
 };
 const previewFrameTarget=(_,index)=>({start:index/30,end:(index+1)/30,time:(index+.5)/30});
 let displayedPreviewInfo=null;
 const calls=[];
 const syncPreviewFrame=()=>calls.push(samplingSurface.frame?.index??null);
 const fn=new Function('state','samplingSurface','previewFrameTarget','$','syncPreviewFrame','getDisplayed','setDisplayed',
  'let displayedPreviewInfo=getDisplayed();'+implementation+';return {renderReferencePreview,cancelReferencePreview,get pending(){return referencePreviewAbort!==null;}}');
 const api=fn(state,samplingSurface,previewFrameTarget,()=>video,syncPreviewFrame,()=>displayedPreviewInfo,x=>displayedPreviewInfo=x);
 function complete(req){
  req.resolve({present:()=>{samplingSurface.frame={index:req.index};samplingSurface.active=true;frames.push(req.index);},dispose(){}});
 }
 return {state,pending,frames,calls,api,complete,samplingSurface};
}

test('rapid reference nudges keep only newest image, not stale response',async()=>{
 const t=harness();
 const older=t.api.renderReferencePreview();
 t.state.reference=2;
 const newer=t.api.renderReferencePreview();
 assert.equal(t.pending.length,2);
 assert.equal(t.pending[0].signal.aborted,true);
 assert.equal(t.pending[1].target.time,2.5/30);
 t.complete(t.pending[1]);
 await newer;
 t.complete(t.pending[0]);
 await older;
 assert.deepEqual(t.frames,[2]);
 assert.equal(t.samplingSurface.frame.index,t.state.reference);
 assert.equal(t.api.pending,false);
});

test('cancel after selecting a frame prevents a delayed redraw',async()=>{
 const t=harness();
 const run=t.api.renderReferencePreview();
 t.api.cancelReferencePreview();
 t.complete(t.pending[0]);
 await run;
 assert.deepEqual(t.frames,[]);
});

test('single reference change uses an intra-frame timestamp',async()=>{
 const t=harness();
 const run=t.api.renderReferencePreview();
 assert.ok(t.pending[0].target.time>t.pending[0].target.start);
 assert.ok(t.pending[0].target.time<t.pending[0].target.end);
 t.complete(t.pending[0]);
 await run;
 assert.deepEqual(t.frames,[1]);
});

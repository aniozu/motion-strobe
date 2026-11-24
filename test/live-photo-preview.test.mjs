import test from 'node:test';
import assert from 'node:assert/strict';
import {LivePhotoPreview} from '../src/live-photo-preview.js';
function harness(){
 const posts=[],frames=[],statuses=[],timers=new Map();let timer=0;
 const api=new LivePhotoPreview({post:m=>posts.push(m),onPresent:m=>frames.push(m),onStatus:s=>statuses.push(s),setTimer:(fn,ms)=>{timers.set(++timer,{fn,ms});return timer;},clearTimer:id=>timers.delete(id)});
 const tick=()=>{for(const [id,t] of [...timers])if(t.ms===40){timers.delete(id);t.fn();}};
 api.setSource(true);
 return {api,posts,frames,statuses,tick,timers};
}
const plan=step=>({first:12,last:78,reference:12,step,background:0,backgroundMode:'auto'});
test('preview submits only the latest plan to the already loaded worker',()=>{
 const t=harness();t.api.request(plan(6));t.api.request(plan(12));t.tick();
 assert.deepEqual(t.posts.filter(m=>m.type!=='cancel').map(m=>[m.type,m.step]),[['render',12]]);
});
test('changing reference keeps cached source frames and rejects late renders',()=>{
 const t=harness();t.api.request(plan(6));t.tick();const old=t.posts.at(-1).id;
 t.api.request({...plan(12),reference:13});assert.equal(t.posts.at(-1).type,'cancel');assert.equal(t.posts.at(-1).keepFrames,true);
 t.api.accept({type:'composed',id:old,count:10});assert.equal(t.frames.length,0);
 t.tick();assert.equal(t.posts.at(-1).reference,13);
 t.api.accept({type:'composed',id:t.posts.at(-1).id,count:6});assert.equal(t.frames.length,1);assert.equal(t.statuses.at(-1),'ready');
});
test('leaving preview clears its cache and ignores unfinished results',()=>{
 const t=harness();t.api.request(plan(6));t.tick();const id=t.posts.at(-1).id;
 t.api.cancel();assert.equal(t.posts.at(-1).keepFrames,false);assert.equal(t.timers.size,0);
 t.api.accept({type:'composed',id,count:10});assert.equal(t.frames.length,0);
});
test('the preview sends no request after its worker loses the source',()=>{
 const t=harness();t.api.request(plan(6));t.tick();const id=t.posts.at(-1).id;
 t.api.setSource(false);const count=t.posts.length;t.api.request(plan(6));t.tick();
 t.api.accept({type:'composed',id,count:10});assert.equal(t.posts.length,count);assert.equal(t.frames.length,0);
});
test('a preview error can be retried on the same loaded source',()=>{
 const t=harness();t.api.request(plan(6));t.tick();t.api.accept({type:'error',id:t.posts.at(-1).id});assert.equal(t.statuses.at(-1),'error');
 t.api.request(plan(6));t.tick();assert.equal(t.posts.at(-1).type,'render');
});
test('identical settings leave the current preview in place',()=>{
 const t=harness();t.api.request(plan(6));t.tick();t.api.accept({type:'composed',id:t.posts.at(-1).id,count:12});
 const count=t.posts.length;t.api.request(plan(6));t.tick();assert.equal(t.posts.length,count);
});

test('returning from the result reuses the displayed image after releasing worker frames',()=>{
 const t=harness();let started=0;const onStart=()=>started++;
 t.api.request(plan(6),{onStart});t.tick();t.api.accept({type:'composed',id:t.posts.at(-1).id,count:12});
 t.api.cancel();const posts=t.posts.length;
 t.api.request(plan(6),{onStart});t.tick();
 assert.equal(t.posts.length,posts);assert.equal(started,1);assert.equal(t.statuses.at(-1),'ready');assert.equal(t.frames.length,1);
 t.api.request(plan(12),{onStart});t.tick();assert.equal(t.posts.at(-1).type,'render');assert.equal(started,2);
});

test('a different video with the same settings renders a fresh preview',()=>{
 const t=harness();t.api.request(plan(6));t.tick();t.api.accept({type:'composed',id:t.posts.at(-1).id,count:12});
 t.api.setSource(true);t.api.request(plan(6));t.tick();assert.equal(t.posts.at(-1).type,'render');assert.equal(t.statuses.at(-1),'updating');
});

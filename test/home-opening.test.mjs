import test from 'node:test';
import assert from 'node:assert/strict';
import {installHomeExample,restartHomeExample,homeExamples} from '../src/home-examples.js';
import {playHomeIntro,installHomeIntro} from '../src/home-intro.js';
import {initializeOpeningPreference,openingAnimationEnabled} from '../src/opening-preference.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const classes=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x)};};
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness(t,{reduced=false,animation=true}={}){
 const raf=[],events=[],fetchReady=deferred(),urls=[];
 const document=new EventTarget();document.visibilityState='visible';document.documentElement={classList:classes(),dataset:{homeAnimation:animation?'on':'off'}};document.documentElement.classList.add('intro-pending');
 const home=new EventTarget();home.hidden=false;home.ownerDocument=document;home.classList=classes();
 function img(){return {src:homeExamples[0].start,decode(){events.push('decode-still');return Promise.resolve();},cloneNode(){return img();},replaceWith(next){events.push({type:'replace',entering:home.classList.contains('is-entering'),pending:document.documentElement.classList.contains('intro-pending')});home.image=next;}};}
 home.image=img();home.still=null;home.querySelector=id=>id==='#homeExampleImage'?home.image:home.still;
 for(const [key,value] of Object.entries({window:new EventTarget(),matchMedia:()=>({matches:reduced}),requestAnimationFrame:cb=>raf.push(cb),fetch:()=>fetchReady.promise})){const before=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>before?Object.defineProperty(globalThis,key,before):delete globalThis[key]);}
 t.mock.method(URL,'createObjectURL',blob=>{urls.push(blob);return `blob:gif-${urls.length}`;});
 t.mock.method(URL,'revokeObjectURL',url=>events.push({type:'revoke',url}));
 const paints=async(n=4)=>{for(let i=0;i<n;i++){for(const f of raf.splice(0))f();await tick();}};
 return {home,document,events,fetchReady,urls,paints,respond(){fetchReady.resolve({ok:true,blob:async()=>new Blob(['GIF89a'],{type:'application/octet-stream'})});}};
}

test('fade becomes visible before GIF fetch completes; animation starts afterwards without GIF decode()',async t=>{
 const h=harness(t);await installHomeExample(h.home);
 const p=playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});
 await h.paints();assert(h.home.classList.contains('is-entering'));assert(!h.document.documentElement.classList.contains('intro-pending'));
 assert.equal(h.urls.length,0);assert.equal(h.home.image.src,homeExamples[0].start);
 h.respond();await p;
 assert.equal(h.home.image.src,'blob:gif-1');assert.equal(h.urls[0].type,'image/gif');
 assert.deepEqual(h.events.filter(e=>e?.type==='replace'),[{type:'replace',entering:true,pending:false}]);
 assert.equal(h.events.filter(e=>e==='decode-still').length,1);
});

test('home replay creates an independent GIF element and URL and releases old resources',async t=>{
 const h=harness(t);installHomeExample(h.home);h.respond();await tick();
 const initial=h.home.image;await restartHomeExample(h.home);const first=h.home.image;
 await restartHomeExample(h.home);assert.notEqual(first,initial);assert.notEqual(h.home.image,first);
 assert.equal(h.home.image.src,'blob:gif-2');assert(h.events.some(e=>e?.type==='revoke'&&e.url==='blob:gif-1'));
});

test('late GIF cannot change a hidden home or overwrite a newer intro',async t=>{
 const h=harness(t);installHomeExample(h.home);
 const canceled=new AbortController();const first=restartHomeExample(h.home,{signal:canceled.signal});
 canceled.abort();const second=restartHomeExample(h.home);h.respond();await Promise.all([first,second]);
 assert.equal(h.urls.length,1);
 const current=h.home.image;h.home.hidden=true;await restartHomeExample(h.home);assert.equal(h.home.image,current);assert.equal(h.urls.length,1);
 h.home.hidden=false;const late=restartHomeExample(h.home);h.home.hidden=true;await late;assert.equal(h.urls.length,1);
});

test('a failed GIF fetch falls back to a fresh native GIF request and a failed image holds the final still',async t=>{
 const h=harness(t);installHomeExample(h.home);h.fetchReady.resolve({ok:false});await restartHomeExample(h.home);
 assert.match(h.home.image.src,/opening-projectile\.gif\?.*&play=/);h.home.image.onerror();assert.equal(h.home.image.src,homeExamples[0].poster);
});

test('app animation off keeps the final still visible without hiding controls or requesting GIF',async t=>{
 const h=harness(t,{reduced:true,animation:false});await installHomeExample(h.home);
 await playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});
 assert.equal(h.home.image.src,homeExamples[0].poster);assert(!h.home.classList.contains('is-entering'));assert(!h.document.documentElement.classList.contains('intro-pending'));assert.equal(h.urls.length,0);
});

test('background-tab opening resumes once; completed intro does not restart on tab switches',async t=>{
 const h=harness(t);h.document.visibilityState='hidden';installHomeIntro(h.home,installHomeExample(h.home),options=>restartHomeExample(h.home,options));
 await tick();assert(!h.home.classList.contains('is-entering'));
 h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));await h.paints();h.respond();await tick();
 const image=h.home.image;assert.equal(h.urls.length,1);
 h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));await h.paints();assert.equal(h.home.image,image);
});


test('app animation on runs both the GIF and fade even when Chrome reports OS reduced-motion',async t=>{
 const h=harness(t,{reduced:true});await installHomeExample(h.home);
 const p=playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});await h.paints();h.respond();await p;
 assert(h.home.classList.contains('is-entering'));assert.equal(h.home.image.src,'blob:gif-1');assert(!h.document.documentElement.classList.contains('intro-pending'));
});

test('turning animation off during a slow GIF fetch holds the still; turning it on later fetches and plays',async t=>{
 const h=harness(t,{reduced:true,animation:false});installHomeExample(h.home);
 h.document.documentElement.dataset.homeAnimation='on';const first=playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});await h.paints();
 h.document.documentElement.dataset.homeAnimation='off';await playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});h.respond();await first;
 assert.equal(h.home.image.src,homeExamples[0].poster);assert.equal(h.urls.length,0);assert(!h.home.classList.contains('is-entering'));
 h.document.documentElement.dataset.homeAnimation='on';const second=playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});await h.paints();await second;assert.equal(h.home.image.src,'blob:gif-1');assert(h.home.classList.contains('is-entering'));
});

test('opening preference survives reloads and defaults on when storage is missing, corrupt or inaccessible',()=>{
 const document={documentElement:{dataset:{}}};
 for(const value of [null,'{}','not json','null','{"openingAnimation":true}']){assert(initializeOpeningPreference(document,{getItem:()=>value}));assert(openingAnimationEnabled(document));}
 assert.equal(initializeOpeningPreference(document,{getItem:()=>' {"openingAnimation":false} '}),false);assert.equal(openingAnimationEnabled(document),false);
 assert(initializeOpeningPreference(document,{getItem(){throw Error('storage denied');}}));
});

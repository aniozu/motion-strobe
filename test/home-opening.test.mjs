import test from 'node:test';
import assert from 'node:assert/strict';
import {installHomeExample,restartHomeExample,homeExamples} from '../src/home-examples.js';
import {playHomeIntro,installHomeIntro} from '../src/home-intro.js';
import {initializeOpeningPreference,openingAnimationEnabled} from '../src/opening-preference.js';

const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const classes=()=>{const values=new Set();return {add:x=>values.add(x),remove:x=>values.delete(x),contains:x=>values.has(x)};};
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
function harness(t,{animation=true}={}){
 const raf=[],events=[];
 const document=new EventTarget();document.visibilityState='visible';document.documentElement={classList:classes(),dataset:{homeAnimation:animation?'on':'off'}};document.documentElement.classList.add('intro-pending');
 const home=new EventTarget();home.hidden=false;home.ownerDocument=document;home.classList=classes();
 const video=new EventTarget();Object.assign(video,{src:'',currentTime:4,play(){events.push('play');return Promise.resolve();},pause(){events.push('pause');},load(){events.push('load');},setAttribute(name,value){this[name]=value;},getAttribute(){return this.src;},removeAttribute(){this.src='';}});home.video=video;const caption={textContent:''},figure={classList:classes()};home.querySelector=selector=>selector==='#homeExampleVideo'?video:selector==='#homeExampleCaption'?caption:selector==='.home-example'?figure:null;
 for(const [key,value] of Object.entries({window:new EventTarget(),requestAnimationFrame:cb=>raf.push(cb)})){const before=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});t.after(()=>before?Object.defineProperty(globalThis,key,before):delete globalThis[key]);}
 const paints=async(n=4)=>{for(let i=0;i<n;i++){for(const f of raf.splice(0))f();await tick();}};
 return {home,document,video,caption,figure,events,paints};
}
test('home becomes visible before movie playback starts',async t=>{
 const h=harness(t);await installHomeExample(h.home);assert(!h.video.src);assert(h.video.muted&&h.video.defaultMuted&&h.video.playsInline);assert.equal(h.video.playbackRate,2);assert.equal(h.video.defaultPlaybackRate,2);
 const p=playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});await h.paints();await p;
 assert(h.home.classList.contains('is-entering'));assert(!h.document.documentElement.classList.contains('intro-pending'));assert.equal(h.video.src,homeExamples[0].video);assert(h.events.includes('play'));
});
test('returning home restarts the muted video without creating new media elements',async t=>{
 const h=harness(t);await installHomeExample(h.home);await restartHomeExample(h.home);h.video.currentTime=8;await restartHomeExample(h.home);assert.equal(h.video.currentTime,0);assert.equal(h.video.playbackRate,2);assert.equal(h.events.filter(x=>x==='play').length,2);
});
test('cancelled or hidden home never starts playback',async t=>{
 const h=harness(t);await installHomeExample(h.home);const controller=new AbortController();controller.abort();await restartHomeExample(h.home,{signal:controller.signal});h.home.hidden=true;await restartHomeExample(h.home);assert(!h.events.includes('play'));assert(!h.video.src);
});
test('blocked autoplay and invalid movie leave the poster without throwing',async t=>{
 const h=harness(t);await installHomeExample(h.home);h.video.play=()=>Promise.reject(Error('blocked'));await restartHomeExample(h.home);assert.equal(h.video.poster,homeExamples[0].poster);h.video.dispatchEvent(new Event('error'));assert(!h.video.src);assert(h.events.includes('load'));
});
test('animation off shows poster without downloading movie or hiding controls',async t=>{
 const h=harness(t,{animation:false});await installHomeExample(h.home);await playHomeIntro(h.home,{prepareImage:options=>restartHomeExample(h.home,options)});assert(!h.video.src);assert(!h.events.includes('play'));assert(!h.home.classList.contains('is-entering'));assert(!h.document.documentElement.classList.contains('intro-pending'));
});
test('background tab pauses video and resumes without restarting its position',async t=>{
 const h=harness(t);await installHomeExample(h.home);await restartHomeExample(h.home);h.video.currentTime=8;h.document.visibilityState='hidden';h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.events.at(-1),'pause');h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));assert.equal(h.events.at(-1),'play');assert.equal(h.video.currentTime,8);
});
test('opening a background tab starts the intro when first shown',async t=>{
 const h=harness(t);h.document.visibilityState='hidden';installHomeIntro(h.home,installHomeExample(h.home),options=>restartHomeExample(h.home,options));await tick();assert(!h.events.includes('play'));h.document.visibilityState='visible';h.document.dispatchEvent(new Event('visibilitychange'));await h.paints();assert(h.events.includes('play'));
});
test('turning animation off stops playback and releases movie source; enabling it restarts',async t=>{
 const h=harness(t);await installHomeExample(h.home);await restartHomeExample(h.home);h.document.documentElement.dataset.homeAnimation='off';await restartHomeExample(h.home);assert(!h.video.src);h.document.documentElement.dataset.homeAnimation='on';await restartHomeExample(h.home);assert.equal(h.video.src,homeExamples[0].video);
});
test('opening preference survives reloads and defaults on when storage is missing, corrupt or inaccessible',()=>{
 const document={documentElement:{dataset:{}}};
 for(const value of [null,'{}','not json','null','{"openingAnimation":true}']){assert(initializeOpeningPreference(document,{getItem:()=>value}));assert(openingAnimationEnabled(document));}
 assert.equal(initializeOpeningPreference(document,{getItem:()=>' {"openingAnimation":false} '}),false);assert.equal(openingAnimationEnabled(document),false);
 assert(initializeOpeningPreference(document,{getItem(){throw Error('storage denied');}}));
});

test('a late cancelled play promise cannot pause a newer home playback',async t=>{
 const h=harness(t);await installHomeExample(h.home);const slow=deferred();h.video.play=()=>slow.promise;
 const old=new AbortController();const pending=restartHomeExample(h.home,{signal:old.signal});old.abort();
 h.video.play=()=>{h.events.push('play');return Promise.resolve();};await restartHomeExample(h.home);
 slow.resolve();await pending;assert.equal(h.events.at(-1),'play');
});


test('three examples rotate in order with matching posters, captions and labels, then restart from soccer',async t=>{
 const h=harness(t);await installHomeExample(h.home);assert.equal(h.video.loop,false);assert.equal(homeExamples.length,3);
 await restartHomeExample(h.home);
 for(const i of [0,1,2,0]){
  assert.equal(h.video.src,homeExamples[i].video);assert.equal(h.video.poster,homeExamples[i].poster);
  assert.equal(h.caption.textContent,homeExamples[i].caption);assert.equal(h.video['aria-label'],homeExamples[i].caption);
  assert.equal(h.video.playbackRate,2);assert(h.video.muted);
  h.video.dispatchEvent(new Event('playing'));assert(h.figure.classList.contains('is-example-entering'));
  h.video.dispatchEvent(new Event('ended'));assert(!h.figure.classList.contains('is-example-entering'));
 }
 await restartHomeExample(h.home);assert.equal(h.video.src,homeExamples[0].video);
});
test('hidden, aborted or disabled opening does not fetch the next example',async t=>{
 const h=harness(t);await installHomeExample(h.home);const controller=new AbortController();await restartHomeExample(h.home,{signal:controller.signal});
 h.home.hidden=true;h.video.dispatchEvent(new Event('ended'));assert.equal(h.video.src,homeExamples[0].video);
 h.home.hidden=false;controller.abort();h.video.dispatchEvent(new Event('ended'));assert.equal(h.video.src,homeExamples[0].video);
 await restartHomeExample(h.home);h.document.documentElement.dataset.homeAnimation='off';h.video.dispatchEvent(new Event('ended'));assert.equal(h.video.src,homeExamples[0].video);
});

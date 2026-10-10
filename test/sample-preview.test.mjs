import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {stat,readFile} from 'node:fs/promises';
import {samples} from '../src/samples.js';
import {installSamplePreviews} from '../src/sample-preview.js';

const tick=()=>new Promise(resolve=>setTimeout(resolve,10));
class Element{
 constructor(){this.listeners=new Map();this.children=[];this.attributes=new Map();this.classes=new Set();this.classList={add:name=>this.classes.add(name)};this.pauseCount=0;this.loadCount=0;}
 addEventListener(name,cb){if(!this.listeners.has(name))this.listeners.set(name,[]);this.listeners.get(name).push(cb);}
 emit(name,event={}){for(const cb of this.listeners.get(name)||[])cb(event);}
 append(child){this.children.push(child);child.parent=this;}
 setAttribute(name,value){this.attributes.set(name,value);}
 removeAttribute(name){this.attributes.delete(name);if(name==='src')delete this.src;}
 remove(){this.parent.children=this.parent.children.filter(child=>child!==this);}
 pause(){this.pauseCount++;}
 load(){this.loadCount++;}
 play(){this.playCount=(this.playCount||0)+1;return this.playResult??Promise.resolve();}
}
function fixture(t,delay=0){
 const dialog=new Element(),doc=new Element(),win=new Element(),created=[];
 dialog.open=true;doc.hidden=false;
 doc.createElement=()=>{const video=new Element();created.push(video);return video;};
 const previews=installSamplePreviews(dialog,{doc,win,delay});t.after(previews.stop);
 const photos=[new Element(),new Element()];photos.forEach((photo,i)=>previews.attach(photo,`preview-${i}.mp4`));
 return {dialog,doc,win,created,photos,previews};
}

test('opening the picker and brushing across a photo do not create or load videos',async t=>{
 const f=fixture(t,30);assert.equal(f.created.length,0);
 f.photos[0].emit('pointerenter',{pointerType:'mouse'});f.photos[0].emit('pointerleave');
 await new Promise(resolve=>setTimeout(resolve,40));assert.equal(f.created.length,0);
 f.photos[0].emit('pointerenter',{pointerType:'touch'});await tick();assert.equal(f.created.length,0);
});

test('only the hovered photo plays, inline and muted; leaving releases its source and keeps the photo',async t=>{
 const f=fixture(t);f.photos[0].emit('pointerenter',{pointerType:'mouse'});await tick();
 const first=f.created[0];assert.equal(first.src,'preview-0.mp4');assert.equal(first.preload,'none');
 assert(first.muted&&first.defaultMuted&&first.loop&&first.playsInline);assert.equal(first.attributes.get('aria-hidden'),'true');
 assert(!first.classes.has('is-playing'));first.emit('playing');assert(first.classes.has('is-playing'));
 f.photos[1].emit('pointerenter',{pointerType:'mouse'});await tick();
 assert.equal(first.pauseCount,1);assert.equal(first.loadCount,1);assert.equal(first.src,undefined);assert.equal(f.photos[0].children.length,0);
 assert.equal(f.photos[1].children.length,1);assert.equal(f.created[1].src,'preview-1.mp4');
 f.photos[1].emit('pointerleave');assert.equal(f.photos[1].children.length,0);assert.equal(f.created[1].src,undefined);
});

test('touch taps play synchronously, survive touch pointerleave, and toggle back to the photograph',t=>{
 const f=fixture(t,180),photo=f.photos[0];
 photo.emit('pointerenter',{pointerType:'touch'});assert.equal(f.created.length,0);
 photo.emit('click');const video=f.created[0];assert.equal(video.playCount,1);assert.equal(photo.attributes.get('aria-pressed'),'true');
 photo.emit('pointerleave',{pointerType:'touch'});assert.equal(video.pauseCount,0);assert.equal(photo.children.length,1);
 photo.emit('click');assert.equal(video.pauseCount,1);assert.equal(photo.attributes.get('aria-pressed'),'false');assert.equal(photo.children.length,0);
});

test('tapping a second photo releases the first; a tap cancels pending hover and stays active',async t=>{
 const f=fixture(t,30);f.photos[0].emit('pointerenter',{pointerType:'mouse'});f.photos[0].emit('click');
 assert.equal(f.created.length,1);await new Promise(resolve=>setTimeout(resolve,40));assert.equal(f.created.length,1);
 f.photos[1].emit('click');assert.equal(f.created[0].pauseCount,1);assert.equal(f.photos[0].children.length,0);assert.equal(f.created[1].playCount,1);
 f.dialog.emit('scroll');assert.equal(f.photos[1].children.length,0);
});

test('mobile autoplay picks one visible photo, changes after scrolling, and respects manual stop',async t=>{
 const f=fixture(t),box={left:0,right:300,top:0,bottom:600};
 f.win.matchMedia=()=>({matches:true});f.dialog.getBoundingClientRect=()=>box;
 f.photos[0].getBoundingClientRect=()=>({left:0,right:140,top:220,bottom:320});
 f.photos[1].getBoundingClientRect=()=>({left:150,right:290,top:500,bottom:600});
 f.previews.refresh();assert.equal(f.created.length,0);await new Promise(resolve=>setTimeout(resolve,420));
 assert.equal(f.created.length,1);assert.equal(f.created[0].src,'preview-0.mp4');assert(f.created[0].autoplay&&f.created[0].muted);
 f.photos[0].getBoundingClientRect=()=>({left:0,right:140,top:-90,bottom:10});
 f.photos[1].getBoundingClientRect=()=>({left:150,right:290,top:240,bottom:340});
 f.dialog.emit('scroll');assert.equal(f.photos[0].children.length,0);await new Promise(resolve=>setTimeout(resolve,420));
 assert.equal(f.created.length,2);assert.equal(f.created[1].src,'preview-1.mp4');
 f.photos[1].emit('click');f.previews.refresh();await new Promise(resolve=>setTimeout(resolve,420));assert.equal(f.created.length,2);
});

test('closing the dialog or hiding the tab cancels pending automatic playback',async t=>{
 const f=fixture(t);f.win.matchMedia=()=>({matches:true});
 f.previews.refresh();f.dialog.open=false;f.dialog.emit('close');
 await new Promise(resolve=>setTimeout(resolve,420));assert.equal(f.created.length,0);
});

test('late rejection from an old play request cannot stop a newer preview',async t=>{
 const f=fixture(t);let rejectOld;
 const create=f.doc.createElement;f.doc.createElement=()=>{const video=create();if(f.created.length===1)video.playResult=new Promise((_,reject)=>{rejectOld=reject;});return video;};
 f.photos[0].emit('pointerenter',{});await tick();f.photos[1].emit('pointerenter',{});await tick();
 rejectOld(Error('cancelled old playback'));await tick();assert.equal(f.photos[1].children.length,1);assert.equal(f.created[1].pauseCount,0);
 f.created[1].emit('error');assert.equal(f.photos[1].children.length,0);
});

test('close, scrolling, hidden tab, window blur, resize and page exit stop decoding',async t=>{
 const f=fixture(t);
 for(const [target,event] of [[f.dialog,'close'],[f.dialog,'cancel'],[f.dialog,'scroll'],[f.doc,'visibilitychange'],[f.win,'blur'],[f.win,'resize'],[f.win,'pagehide']]){
  f.doc.hidden=false;f.photos[0].emit('pointerenter',{});await tick();const video=f.created.at(-1);
  if(event==='visibilitychange')f.doc.hidden=true;
  target.emit(event);assert.equal(video.pauseCount,1,event);assert.equal(video.src,undefined,event);assert.equal(f.photos[0].children.length,0,event);
 }
 f.dialog.open=false;f.photos[0].emit('pointerenter',{});await tick();assert.equal(f.created.length,7);
});

test('all ten committed previews are small, silent, fully decodable H.264 with changing strobe frames',async()=>{
 const provided=JSON.parse(await readFile(new URL('../scripts/analyzed-preview-sources.json',import.meta.url),'utf8'));
 let total=0;
 for(const sample of samples){
  const path=new URL(`../dist/sample-preview-${sample.id}.mp4`,import.meta.url).pathname;
  const size=(await stat(path)).size;total+=size;assert(size<300000,`${sample.id}: ${size}`);
  const info=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',path]));
  const stream=info.streams[0],width=stream.width,height=stream.height;
  assert.equal(info.streams.length,1);assert.equal(stream.codec_name,'h264');
  assert(width>0&&width<=480&&height>0&&height<=480,sample.id);
  const [fpsNumerator,fpsDenominator]=stream.r_frame_rate.split('/').map(Number);
  assert(fpsNumerator/fpsDenominator<=24,sample.id);
  if(provided[sample.id])assert(Math.abs(Number(info.format.duration)-provided[sample.id].duration)<.2,sample.id);
  else assert(Number(info.format.duration)<=4.6);
  const raw=execFileSync('ffmpeg',['-v','error','-i',path,'-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{maxBuffer:100*1024*1024});
  const bytes=width*height*3;assert.equal(raw.length%bytes,0);assert(raw.length/bytes>24);
  assert(!raw.subarray(0,bytes).equals(raw.subarray(-bytes)),sample.id);
 }
 assert(total<1000000,`total: ${total}`);
});

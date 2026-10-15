import test from 'node:test';
import assert from 'node:assert/strict';
import {SourcePlayer,playbackTime} from '../src/source-player.js';
class Element extends EventTarget{
 constructor(){super();this.attrs={};this.value='0';}
 setAttribute(key,value){this.attrs[key]=value;}
}
class Video extends Element{
 constructor(){super();this.duration=20;this.currentTime=0;this.paused=true;this.attrs.src='blob:video';}
 getAttribute(key){return this.attrs[key];}
 async play(){this.paused=false;this.dispatchEvent(new Event('play'));}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
}
function setup(){
 const video=new Video(),button=new Element(),seek=new Element(),readout=new Element();let manual=0,errors=0,allowed=true;
 const player=new SourcePlayer({video,button,seek,readout,labels:{play:'Play',pause:'Pause'},onManual:()=>manual++,onError:()=>errors++,canUse:()=>allowed});
 return {video,button,seek,readout,player,get manual(){return manual;},get errors(){return errors;},block(){allowed=false;player.update();}};
}
test('bottom controls play and pause through the native media engine without its central controls',async()=>{
 const h=setup();assert.equal(h.video.controls,false);assert.equal(h.seek.max,'20');assert.equal(h.button.attrs['aria-label'],'Play');
 await h.player.toggle();assert(!h.video.paused);assert.equal(h.button.attrs['aria-label'],'Pause');assert.equal(h.manual,1);
 await h.player.toggle();assert(h.video.paused);assert.equal(h.button.attrs['aria-label'],'Play');assert.equal(h.manual,2);
});
test('scrubbing stops automatic preview and holds the thumb while media events arrive',()=>{
 const h=setup();h.seek.value='8.5';h.seek.dispatchEvent(new Event('pointerdown'));h.seek.dispatchEvent(new Event('input'));
 assert.equal(h.video.currentTime,8.5);assert(h.video.paused);assert.equal(h.readout.textContent,'0:08 / 0:20');assert(h.manual>0);
 h.video.currentTime=4;h.video.dispatchEvent(new Event('timeupdate'));assert.equal(h.seek.value,'8.5');
 h.seek.dispatchEvent(new Event('pointerup'));assert.equal(h.seek.value,'4');
 h.seek.value='30';h.seek.dispatchEvent(new Event('input'));assert.equal(h.video.currentTime,20);
});
test('blocked processing cannot play or seek; a failed play returns a controlled error',async()=>{
 const h=setup();h.block();await h.player.toggle();h.seek.value='9';h.seek.dispatchEvent(new Event('input'));assert(h.video.paused);assert.equal(h.video.currentTime,0);assert.equal(h.manual,0);assert(h.button.disabled);
 const failed=setup();failed.video.play=async()=>{throw Error('blocked');};await failed.player.toggle();assert.equal(failed.errors,1);assert(failed.video.paused);
});
test('playback time remains readable for missing durations and hour-long videos',()=>{
 assert.equal(playbackTime(NaN),'0:00');assert.equal(playbackTime(-1),'0:00');assert.equal(playbackTime(61.9),'1:01');assert.equal(playbackTime(3661),'1:01:01');
});

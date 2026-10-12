import test from 'node:test';
import assert from 'node:assert/strict';
import {installSampleBackdropDismiss} from '../src/samples.js';

function dialogFixture(){
 const listeners=new Map(),dialog={open:true,closes:0,
  getBoundingClientRect:()=>({left:100,right:700,top:50,bottom:500}),
  addEventListener:(name,handler)=>listeners.set(name,handler),
  close(){this.open=false;this.closes++;listeners.get('close')?.();}
 };
 installSampleBackdropDismiss(dialog);
 const send=(name,x,y,extra={})=>listeners.get(name)?.({target:dialog,clientX:x,clientY:y,pointerId:1,button:0,isPrimary:true,...extra});
 return {dialog,send};
}

test('mouse and touch taps on any side of the sample backdrop close the dialog',()=>{
 for(const pointerType of ['mouse','touch'])for(const [x,y] of [[90,250],[710,250],[300,40],[300,510]]){
  const {dialog,send}=dialogFixture();send('pointerdown',x,y,{pointerType});send('click',x,y,{pointerType});assert.equal(dialog.closes,1);
 }
});

test('padding, sample cards and clicks without an outside press stay open',()=>{
 for(const [x,y,target] of [[110,60,null],[350,250,{}]]){
  const {dialog,send}=dialogFixture();send('pointerdown',x,y,{target:target||dialog});send('click',x,y,{target:target||dialog});assert.equal(dialog.closes,0);
 }
 const {dialog,send}=dialogFixture();send('click',90,250);assert.equal(dialog.closes,0);
});

test('scrolls, dragged presses and cancelled touch gestures do not dismiss samples',()=>{
 for(const cancel of ['inside','move','cancel','secondary']){
  const {dialog,send}=dialogFixture();
  send('pointerdown',cancel==='inside'?350:90,250,{isPrimary:cancel!=='secondary'});
  if(cancel==='move')send('pointermove',90,280);
  if(cancel==='cancel')send('pointercancel',90,250);
  send('click',90,250);assert.equal(dialog.closes,0,cancel);
 }
});

test('a press ending inside does not close, and another tap can dismiss after scrolling',()=>{
 const {dialog,send}=dialogFixture();
 send('pointerdown',90,250);send('click',110,250);assert.equal(dialog.closes,0);
 dialog.getBoundingClientRect=()=>({left:120,right:680,top:50,bottom:500});
 send('pointerdown',110,250);send('click',110,250);assert.equal(dialog.closes,1);
});

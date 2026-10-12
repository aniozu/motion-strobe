import test from 'node:test';
import assert from 'node:assert/strict';
import {installVideoOptions} from '../src/video-options.js';
function setup({available=true,ready=true}={}){
 const events={},dialog={open:false,showModal(){this.open=true;},close(){this.open=false;events.close?.();},addEventListener(type,fn){events[type]=fn;}};
 const speed={value:'1',focus(){}},sound={checked:false},confirm={},cancel={};let created=0,updated=0;
 const controller=installVideoOptions({dialog,speed,sound,confirm,cancel,canOpen:()=>ready,canUseSound:()=>available,onUpdate:()=>updated++,onConfirm:()=>created++});
 return {dialog,speed,sound,confirm,cancel,controller,created:()=>created,updated:()=>updated};
}
test('selecting video and editing options does not encode until confirmation',()=>{
 const ui=setup();ui.controller.open();assert(ui.dialog.open);assert.equal(ui.created(),0);
 ui.speed.value='.5';ui.speed.onchange();ui.sound.checked=true;ui.sound.onchange();assert.equal(ui.created(),0);
 ui.confirm.onclick();assert.equal(ui.created(),1);assert.equal(ui.dialog.open,false);assert.equal(ui.speed.value,'.5');assert(ui.sound.checked);
});
test('cancel and native close restore settings without creating or replacing a video',()=>{
 for(const close of [ui=>ui.cancel.onclick(),ui=>ui.dialog.close()]){
  const ui=setup();ui.controller.open();ui.speed.value='.25';ui.sound.checked=true;close(ui);
  assert.equal(ui.created(),0);assert.equal(ui.speed.value,'1');assert.equal(ui.sound.checked,false);
 }
});
test('the next dialog starts with the last confirmed options and blocked actions do not create',()=>{
 const ui=setup();ui.controller.open();ui.speed.value='.5';ui.confirm.onclick();ui.controller.open();assert.equal(ui.speed.value,'.5');ui.speed.value='.25';ui.cancel.onclick();assert.equal(ui.speed.value,'.5');
 const blocked=setup({ready:false});blocked.controller.open();blocked.confirm.onclick();assert.equal(blocked.dialog.open,false);assert.equal(blocked.created(),0);
});
test('an unavailable shutter encoder cannot be enabled for export',()=>{
 const ui=setup({available:false});ui.sound.checked=true;ui.controller.open();assert.equal(ui.sound.checked,false);
 ui.sound.checked=true;ui.confirm.onclick();assert.equal(ui.sound.checked,false);assert.equal(ui.created(),1);
});

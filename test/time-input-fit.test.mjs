// DOM edges only: verify fitting changes presentation while timestamps stay exact.
import test from 'node:test';import assert from 'node:assert/strict';
import {bindTimeInputFit} from '../src/time-input-fit.js';
const textWidth=(text,size)=>[...text].reduce((sum,c)=>sum+(c==='.'?4.5:9)*size/16,0);
const context={font:'',measureText(text){return {width:textWidth(text,Number(this.font.match(/([\d.]+)px/)[1]))};}};
function harness(value,width=60,maximum=16){
 const events={};let resized;
 globalThis.document={createElement:()=>({getContext:()=>context})};
 globalThis.getComputedStyle=()=>({fontStyle:'normal',fontWeight:'500',fontFamily:'sans-serif',paddingLeft:'4px',paddingRight:'4px'});
 globalThis.ResizeObserver=class{constructor(callback){resized=callback;}observe(){}};
 const input={value,clientWidth:width,style:{},selectionStart:2,addEventListener:(name,callback)=>{events[name]=callback;}};
 const binding=bindTimeInputFit(input,maximum);return {input,events,binding,resize:()=>resized()};
}
test('99.999 keeps the normal font while more digits shrink into the same field without rounding',()=>{
 const h=harness('99.999');assert.equal(h.input.style.fontSize,'16px');
 for(const value of ['999.999','12345.123456']){
  h.input.value=value;h.events.input();const size=Number.parseFloat(h.input.style.fontSize);assert(size<16);assert(textWidth(value,size)<=h.input.clientWidth-9);assert.equal(h.input.value,value);assert.equal(h.input.selectionStart,2);
 }
 h.input.value='9.123';h.events.input();assert.equal(h.input.style.fontSize,'16px');
});
test('hidden panels fit when shown, and a wider field restores normal text size',()=>{
 const h=harness('9999.999',0);assert.equal(h.input.style.fontSize,'16px');
 h.input.clientWidth=60;h.resize();assert(Number.parseFloat(h.input.style.fontSize)<16);
 h.input.clientWidth=130;h.resize();assert.equal(h.input.style.fontSize,'16px');assert.equal(h.input.value,'9999.999');
});
test('the reference field fits independently with a larger 18px font',()=>{
 const h=harness('99.999',72,18);assert.equal(h.input.style.fontSize,'18px');
 h.input.value='9999.123456';h.binding.update();const size=Number.parseFloat(h.input.style.fontSize);assert(size<18);assert(textWidth(h.input.value,size)<=63);
 h.input.value='0.123';h.binding.update();assert.equal(h.input.style.fontSize,'18px');
});

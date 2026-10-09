import test from 'node:test';
import assert from 'node:assert/strict';
import {installSamples,samples} from '../src/samples.js';

function fixture(t){
 const previous={document:globalThis.document,window:globalThis.window,getComputedStyle:globalThis.getComputedStyle};
 const resize=new Map();let columns=2,chosen=null;
 const doc={activeElement:null};
 class Element{
  constructor(){this.children=[];this.scrollTop=0;this.open=false;this.listeners=new Map();}
  append(...children){for(const child of children){if(child.parent){child.parent.children=child.parent.children.filter(c=>c!==child);}child.parent=this;this.children.push(child);}}
  replaceChildren(...children){for(const child of this.children)child.parent=null;this.children=[];this.append(...children);}
  addEventListener(name,callback){this.listeners.set(name,callback);}
  showModal(){this.open=true;}
  close(){this.open=false;this.listeners.get('close')?.();}
  focus(options){doc.activeElement=this;this.focusOptions=options;}
 }
 const dialog=new Element(),list=new Element(),tryDemo=new Element();
 doc.getElementById=id=>({samplesDialog:dialog,sampleList:list,tryDemo})[id];doc.createElement=()=>new Element();
 globalThis.document=doc;globalThis.window={addEventListener:(name,cb)=>resize.set(name,cb)};
 globalThis.getComputedStyle=()=>({getPropertyValue:()=>String(columns)});
 t.after(()=>{for(const [name,value] of Object.entries(previous)){if(value===undefined)delete globalThis[name];else globalThis[name]=value;}});
 installSamples({onChoose:sample=>{chosen=sample;}});
 const cards=()=>list.children.flatMap(row=>row.children);
 const change=value=>{columns=value;resize.get('resize')();};
 return {doc,dialog,list,tryDemo,cards,change,getChosen:()=>chosen};
}

test('resizing samples between 2, 3 and 4 columns retains all ten cards and their order',t=>{
 const f=fixture(t),original=f.cards();
 for(const [columns,lengths] of [[2,[2,2,2,2,2]],[3,[3,3,3,1]],[4,[4,4,2]],[2,[2,2,2,2,2]]]){
  f.change(columns);assert.deepEqual(f.list.children.map(row=>row.children.length),lengths);
  assert.deepEqual(f.cards(),original);assert.deepEqual(f.cards().map(card=>card.children[1].textContent),samples.map(s=>s.title));
 }
});

test('changing columns preserves focused card and scroll position, and selections still choose the correct sample',t=>{
 const f=fixture(t);f.tryDemo.onclick();assert(f.dialog.open);
 const pendulum=f.cards().at(-1);f.doc.activeElement=pendulum;f.dialog.scrollTop=320;
 f.change(4);assert.equal(f.doc.activeElement,pendulum);assert.deepEqual(pendulum.focusOptions,{preventScroll:true});assert.equal(f.dialog.scrollTop,320);
 pendulum.onclick();assert(!f.dialog.open);assert.equal(f.getChosen(),samples.at(-1));
});

test('a resize within the same column count does not rebuild rows or disturb focus',t=>{
 const f=fixture(t),rows=[...f.list.children];f.change(2);assert.deepEqual(f.list.children,rows);
 f.change(3);const wider=[...f.list.children];f.change(3);assert.deepEqual(f.list.children,wider);
});

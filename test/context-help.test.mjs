import test from 'node:test';import assert from 'node:assert/strict';import {installContextHelp,helpTopics} from '../src/context-help.js';
test('context help replaces the prior topic and shows only the selected feature',()=>{
 const buttons=['background','reference','save'].map(help=>({dataset:{help}})),title={},content={children:[],replaceChildren(){this.children=[];},append(p){this.children.push(p);}},dialog={opens:0,showModal(){this.opens++;}},elements={helpDialog:dialog,helpTitle:title,helpContent:content};
 globalThis.document={getElementById:id=>elements[id],querySelectorAll:()=>buttons,createElement:()=>({})};installContextHelp();buttons[0].onclick();assert.equal(title.textContent,'背景');assert(content.children.some(p=>p.textContent.includes('比較画像')));
 buttons[1].onclick();assert.equal(title.textContent,'基準');assert.equal(content.children.length,helpTopics.reference.paragraphs.length);assert(content.children.every(p=>!p.textContent.includes('比較画像')));
 buttons[2].onclick();assert.equal(title.textContent,'保存と共有');assert(content.children.some(p=>p.textContent.includes('「動画」')));assert.equal(dialog.opens,3);
});

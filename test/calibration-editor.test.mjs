import test from 'node:test';import assert from 'node:assert/strict';import {CalibrationEditor} from '../src/calibration-editor.js';
function harness(){
 const elements=new Map(),buttons=['a','b'].map(p=>({dataset:{calibrationPoint:p},classList:{toggle(){}},setAttribute(){}})),ctx={clearRect(){},save(){},restore(){},translate(){},scale(){},drawImage(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){}};
 const el=id=>{if(!elements.has(id))elements.set(id,{width:400,height:200,handlers:{},classList:{toggle(){}},setAttribute(){},querySelectorAll(){return buttons;},addEventListener(k,f){this.handlers[k]=f;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},getContext(){return ctx;},getBoundingClientRect(){return {left:10,top:20,width:200,height:100};},setPointerCapture(){}});return elements.get(id);};globalThis.document={getElementById:el};const applied=[],cleared=[];const editor=new CalibrationEditor({onApply:x=>applied.push(x),onClear:()=>cleared.push(true)}),data={size:{width:400,height:200},centers:[{x:80,y:100,confidence:'manual'}]};editor.open({calibration:null,data});editor.image={};editor.update();return {editor,el,applied,cleared};
}
test('calibration requires a positive physical length, applies a copy, and stays a draft until applied',()=>{
 const h=harness();assert(h.el('applyCalibration').disabled);h.el('calibrationLength').value='.5';h.el('calibrationLength').oninput();assert.equal(h.el('applyCalibration').disabled,false);assert.equal(h.editor.basis().length,.5);
 const c=h.el('calibrationCanvas');c.onpointerdown({clientX:60,clientY:70,pointerId:1});c.onpointermove({clientX:70,clientY:75,pointerId:1});c.onpointerup({clientX:70,clientY:75,pointerId:1});assert.deepEqual(h.editor.draft.a,{x:120,y:110});assert.equal(h.applied.length,0);
 h.el('calibrationAngle').value='30';h.el('calibrationAngle').oninput();assert(Math.abs(h.editor.angle()-30)<1e-8);h.el('applyCalibration').onclick();assert.equal(h.applied.length,1);assert.equal(h.applied[0].length,.5);assert.equal(h.el('calibrationDialog').open,false);
});
test('zoom and pinch preserve calibration points and do not change the scale measurement',()=>{
 const h=harness(),before=structuredClone(h.editor.draft);h.el('calibrationZoomIn').onclick();const canvas=h.el('calibrationCanvas');canvas.onpointerdown({clientX:85,clientY:70,pointerId:1});const afterOne=structuredClone(h.editor.draft);canvas.onpointerdown({clientX:135,clientY:70,pointerId:2});canvas.onpointermove({clientX:170,clientY:70,pointerId:2});canvas.onpointerup({clientX:170,clientY:70,pointerId:2});canvas.onpointerup({clientX:85,clientY:70,pointerId:1});assert.deepEqual(h.editor.draft,before);assert(h.editor.viewport.scale>1.5);assert.equal(before.length,h.editor.draft.length);assert.equal(h.applied.length,0);
});
test('a y-axis selection changes the perpendicular basis and closing or clearing cannot apply a draft',()=>{
 const h=harness();h.el('calibrationAxis').value='y';h.el('calibrationAxis').onchange();h.el('calibrationAngle').value='0';h.el('calibrationAngle').oninput();assert(Math.abs(h.editor.draft.a.x-h.editor.draft.b.x)<1e-8);assert(h.editor.draft.a.y!==h.editor.draft.b.y);h.el('calibrationDialog').close();assert.equal(h.applied.length,0);h.el('clearCalibration').onclick();assert.equal(h.cleared.length,1);
});

test('numeric x-axis angles accept negative decimals, synchronize the slider and retain scale and midpoint',()=>{
 const h=harness();h.el('calibrationLength').value='.5';h.el('calibrationLength').oninput();
 const before=structuredClone(h.editor.draft),distance=h.editor.distance(),field=h.el('calibrationAngleNumber');
 field.value='-12.345';field.oninput();assert(Math.abs(h.editor.angle()+12.345)<1e-8);
 assert.equal(field.value,'-12.345');assert(Math.abs(Number(h.el('calibrationAngle').value)+12.345)<1e-8);
 assert(Math.abs(h.editor.distance()-distance)<1e-8);assert.equal(h.editor.draft.length,.5);
 assert(Math.abs(h.editor.draft.a.x+h.editor.draft.b.x-before.a.x-before.b.x)<1e-8);
 assert(Math.abs(h.editor.draft.a.y+h.editor.draft.b.y-before.a.y-before.b.y)<1e-8);
 h.el('applyCalibration').onclick();assert.equal(h.applied.length,1);assert.equal(h.applied[0].length,.5);
});
test('empty or out-of-range angle input does not change the axis and cannot be applied; blur restores the actual angle',()=>{
 const h=harness();h.el('calibrationLength').value='1';h.el('calibrationLength').oninput();
 const before=structuredClone(h.editor.draft),field=h.el('calibrationAngleNumber');
 for(const value of ['', '91', '-100', 'not-a-number']){field.value=value;field.oninput();assert.deepEqual(h.editor.draft,before);assert(h.el('applyCalibration').disabled);}
 field.onblur();assert.equal(field.value,'0');assert.equal(h.el('applyCalibration').disabled,false);
});
test('numeric angle uses the x-axis direction even for a y-axis ruler and updates after slider or point changes',()=>{
 const h=harness();h.el('calibrationLength').value='.1';h.el('calibrationLength').oninput();h.el('calibrationAxis').value='y';h.el('calibrationAxis').onchange();
 const field=h.el('calibrationAngleNumber');field.value='45';field.oninput();assert(Math.abs(h.editor.angle()-45)<1e-8);
 assert(Math.abs(h.editor.basis().x.x-Math.SQRT1_2)<1e-8);assert(Math.abs(h.editor.basis().y.y+Math.SQRT1_2)<1e-8);
 h.el('calibrationAngle').value='30';h.el('calibrationAngle').oninput();assert.equal(field.value,'30');
 h.editor.draft.b={x:200,y:20};h.editor.update();assert(Math.abs(Number(field.value)-h.editor.angle())<.00005);
});

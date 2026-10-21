import test from 'node:test';import assert from 'node:assert/strict';import {CalibrationEditor} from '../src/calibration-editor.js';
function harness(){
 const elements=new Map(),buttons=['a','b'].map(p=>({dataset:{calibrationPoint:p},classList:{toggle(){}},setAttribute(){}})),fitButtons=[0,1].map(id=>({dataset:{calibrationFitObject:String(id)},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}})),ctx={clearRect(){},save(){},restore(){},translate(){},scale(){},drawImage(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){}};
 const el=id=>{if(!elements.has(id))elements.set(id,{width:400,height:200,handlers:{},classList:{toggle(){}},setAttribute(){},querySelectorAll(selector){return selector==='[data-calibration-fit-object]'?fitButtons:buttons;},addEventListener(k,f){this.handlers[k]=f;},showModal(){this.open=true;},close(){this.open=false;this.handlers.close?.();},getContext(){return ctx;},getBoundingClientRect(){return {left:10,top:20,width:200,height:100};},setPointerCapture(){}});return elements.get(id);};globalThis.document={getElementById:el};const applied=[],cleared=[];const editor=new CalibrationEditor({onApply:x=>applied.push(x),onClear:()=>cleared.push(true)}),data={size:{width:400,height:200},centers:[{x:80,y:100,confidence:'manual'}]};editor.open({calibration:null,data});editor.image={};editor.update();return {editor,el,applied,cleared,fitButtons};
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
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const motionData={size:{width:400,height:200},objects:[
 {id:0,centers:[{x:20,y:160,confidence:'manual'},{x:120,y:60,confidence:'auto'},{x:999,y:0,confidence:'uncertain'}]},
 {id:1,centers:[{x:200,y:150,confidence:'auto'},{x:200,y:50,confidence:'manual'},{x:300,y:100,confidence:'skipped'}]}
]};
const setMotion=(h,checked)=>{h.el('fitCalibrationAngle').checked=checked;h.el('fitCalibrationAngle').onchange();};
test('motion checkbox switches between the selected trajectory and AB without moving the ruler or changing the scale',()=>{
 const h=harness(),calibration={a:{x:10,y:190},b:{x:390,y:190},length:2,axis:'x',width:400,height:200},original=structuredClone(calibration),data=structuredClone(motionData);
 h.editor.open({calibration,data,objectId:0});h.editor.image={};h.editor.update();const ruler=structuredClone(h.editor.draft),scale=h.editor.basis().metersPerPixel;
 assert.equal(h.el('fitCalibrationAngle').checked,false);assert(h.fitButtons.every(b=>b.disabled));
 setMotion(h,true);near(h.editor.angle(),45);near(h.editor.basis().metersPerPixel,scale);assert.deepEqual(h.editor.draft.a,ruler.a);assert.deepEqual(h.editor.draft.b,ruler.b);assert.equal(h.editor.draft.length,2);assert.equal(h.el('calibrationFitStatus').hidden,true);
 h.fitButtons[1].onclick();assert.equal(h.fitButtons[1]['aria-pressed'],'true');near(h.editor.angle(),90);near(h.editor.basis().metersPerPixel,scale);
 for(const id of ['calibrationAxis','calibrationAngle','calibrationAngleNumber'])assert(h.el(id).disabled);
 h.editor.setAngle(12);near(h.editor.angle(),90);assert.equal(h.applied.length,0);assert.deepEqual(calibration,original);assert.deepEqual(data,motionData);
 h.el('applyCalibration').onclick();assert.equal(h.applied.length,1);near(h.applied[0].axisAngle,90);assert.equal(h.applied[0].motionObject,1);
 h.editor.open({calibration:h.applied[0],data,objectId:0});assert(h.el('fitCalibrationAngle').checked);assert.equal(h.editor.fitObject,1);near(h.editor.angle(),90);h.editor.image={};
 setMotion(h,false);assert.equal(h.editor.draft.axisAngle,undefined);assert.equal(h.editor.draft.motionObject,undefined);near(h.editor.angle(),0);near(h.editor.basis().metersPerPixel,scale);assert.deepEqual(h.editor.draft.a,ruler.a);assert.deepEqual(h.editor.draft.b,ruler.b);
 for(const id of ['calibrationAxis','calibrationAngle','calibrationAngleNumber'])assert.equal(h.el(id).disabled,false);
 h.el('calibrationDialog').close();near(h.applied[0].axisAngle,90);assert.equal(h.applied[0].motionObject,1);
});
test('checkbox finds available motion, blocks unusable objects and remains separate from length validity',()=>{
 const h=harness(),data={...motionData,objects:[{id:0,centers:[{x:1,y:1,confidence:'manual'},{x:1,y:1,confidence:'auto'},{x:80,y:10,confidence:'uncertain'}]},motionData.objects[1]]};
 h.editor.open({calibration:null,data,objectId:0});assert.equal(h.editor.fitObject,1);assert(h.el('fitCalibrationAngle').disabled);h.editor.image={};h.editor.update();assert.equal(h.el('fitCalibrationAngle').disabled,false);
 setMotion(h,true);assert(h.fitButtons[0].disabled);h.fitButtons[0].onclick();assert.equal(h.editor.fitObject,1);assert(h.el('applyCalibration').disabled);
 h.el('calibrationLength').value='.2';h.el('calibrationLength').oninput();assert.equal(h.el('applyCalibration').disabled,false);
 const fitted=h.editor.draft.axisAngle;h.el('calibrationSpan').value='50';h.el('calibrationSpan').oninput();near(h.editor.draft.axisAngle,fitted);near(h.editor.distance(),50);
 setMotion(h,false);h.el('calibrationAxis').value='y';h.el('calibrationAxis').onchange();near(h.editor.angle(),90);
 h.editor.open({calibration:null,data:{...data,objects:[data.objects[0]]}});h.editor.image={};h.editor.update();assert(h.el('fitCalibrationAngle').disabled);setMotion(h,true);assert.equal(h.el('fitCalibrationAngle').checked,false);assert.match(h.el('calibrationFitStatus').textContent,/2コマ/);
});
test('unchecked motion follows edited AB points, while checked motion keeps the chosen direction',()=>{
 const h=harness();h.editor.open({calibration:{a:{x:100,y:150},b:{x:200,y:150},length:1,axis:'x',width:400,height:200},data:motionData});h.editor.image={};h.editor.update();
 setMotion(h,true);h.editor.draft.b={x:200,y:180};h.editor.update();near(h.editor.angle(),45);
 setMotion(h,false);near(h.editor.angle(),-Math.atan2(30,100)*180/Math.PI);h.el('applyCalibration').onclick();assert.equal(h.applied[0].axisAngle,undefined);assert.equal(h.applied[0].motionObject,undefined);
 h.editor.open({calibration:h.applied[0],data:motionData});assert.equal(h.el('fitCalibrationAngle').checked,false);
});

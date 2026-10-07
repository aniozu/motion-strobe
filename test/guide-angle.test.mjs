import test from 'node:test';import assert from 'node:assert/strict';
import {drawAnnotations,gridOptions,normalizeGuideAngle} from '../src/annotations.js';
import {angleFromStroke,GuideEditor} from '../src/guide-editor.js';
const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
function lines(centers,grid){const paths=[],ctx={save(){},restore(){},beginPath(){},moveTo(x,y){paths.push([x,y]);},lineTo(x,y){paths.push([x,y]);},stroke(){}};drawAnnotations(ctx,centers,100,60,{grid:{enabled:true,points:false,...grid},labels:false});return paths;}
const point={x:50,y:30,confidence:'manual'};
test('grids independently select object 1, object 2, both or neither',()=>{
 const points=[{...point,objectId:0},{x:80,y:40,confidence:'manual',objectId:1}];
 assert.equal(lines(points,{}).length,8);
 assert.deepEqual(lines(points,{object2:false}),lines([points[0]],{}));
 assert.deepEqual(lines(points,{object1:false}),lines([points[1]],{}));
 assert.deepEqual(lines(points,{object1:false,object2:false}),[]);
 assert.deepEqual(lines([point],{object1:false}),[]);
});
test('rotated guides intersect the selected center, remain orthogonal and end at the image edges',()=>{
 const paths=lines([point],{angle:45});assert.equal(paths.length,4);
 [[80,0],[20,60],[20,0],[80,60]].forEach((p,i)=>p.forEach((v,j)=>near(paths[i][j],v)));
 const dx=paths[1][0]-paths[0][0],dy=paths[1][1]-paths[0][1],hx=paths[3][0]-paths[2][0],hy=paths[3][1]-paths[2][1];near(dx*hx+dy*hy,0);
 assert.deepEqual(point,{x:50,y:30,confidence:'manual'});
});
test('vertical-only, horizontal-only, negative and right-angle rotations obey the chosen display',()=>{
 const vertical=lines([point],{angle:45,horizontal:false}),horizontal=lines([point],{angle:45,vertical:false});assert.equal(vertical.length,2);assert.equal(horizontal.length,2);near(vertical[0][0],80);near(horizontal[0][0],20);
 const negative=lines([point],{angle:-45,vertical:false});near(negative[0][0],20);near(negative[0][1],60);near(negative[1][0],80);near(negative[1][1],0);
 const rightAngle=lines([point],{angle:90,vertical:false});near(rightAngle[0][0],50);near(rightAngle[1][0],50);near(rightAngle[0][1],0);near(rightAngle[1][1],60);
 assert.equal(lines([point],{vertical:false,horizontal:false}).length,0);
});
test('parallel rotated lines are deduplicated and unmeasured centers stay excluded',()=>{
 const paths=lines([{x:40,y:20,confidence:'manual'},point,{x:25,y:20,confidence:'skipped'},{x:80,y:20,confidence:'uncertain'}],{angle:45,vertical:false});assert.equal(paths.length,2);
 assert.equal(gridOptions({}).angle,0);assert.equal(gridOptions({angle:'invalid'}).angle,0);assert.equal(normalizeGuideAngle(180),0);assert.equal(normalizeGuideAngle(135),-45);
});
test('drawing either way along a movement chooses the same axis; very short taps do not change it',()=>{
 assert.equal(angleFromStroke({x:10,y:10},{x:60,y:60}),45);assert.equal(angleFromStroke({x:60,y:60},{x:10,y:10}),45);
 assert.equal(angleFromStroke({x:10,y:60},{x:60,y:10}),-45);assert.equal(angleFromStroke({x:1,y:1},{x:2,y:2}),null);
});
function harness(){
 const elements=new Map(),callbacks=new Map(),frames=new Map();let frameId=0;
 const buttons=['both','vertical','horizontal','none'].map(mode=>({dataset:{guideLines:mode},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}}));
 const ctx={clearRect(){},drawImage(){},save(){},restore(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},setLineDash(){}};
 const el=id=>{if(!elements.has(id))elements.set(id,{open:false,value:'',checked:false,width:400,height:200,classList:{toggle(){}},getContext:()=>ctx,getBoundingClientRect:()=>({left:10,top:20,width:200,height:100}),setPointerCapture(){},setAttribute(k,v){this[k]=v;},querySelectorAll:()=>buttons,showModal(){this.open=true;},close(){this.open=false;callbacks.get('close')?.();},addEventListener(k,fn){callbacks.set(k,fn);}});return elements.get(id);};
 globalThis.document={getElementById:el};globalThis.requestAnimationFrame=fn=>{const id=++frameId;frames.set(id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 const images=[];globalThis.Image=class{constructor(){images.push(this);}};
 const applied=[],editor=new GuideEditor({onApply:x=>applied.push(x)}),guide=gridOptions({angle:0,points:false});editor.open({guide,centers:[{x:100,y:50,confidence:'manual'}],labels:false});
 return {editor,el,buttons,images,applied,guide,flush(){for(const [id,fn]of frames){frames.delete(id);fn();}}};
}
test('photo drag uses image coordinates, previews a draft, and applies only on request',()=>{
 const h=harness();h.editor.accept({blob:new Blob(['png']),size:{width:400,height:200}});h.images[0].onload();h.flush();
 const e=(x,y)=>({clientX:x,clientY:y,pointerId:1});h.el('guideCanvas').onpointerdown(e(30,30));h.el('guideCanvas').onpointermove(e(80,80));h.el('guideCanvas').onpointerup(e(80,80));assert.equal(h.editor.draft.angle,45);assert.equal(h.el('guideAngle').value,45);
 h.buttons[1].onclick();assert.equal(h.editor.draft.vertical,true);assert.equal(h.editor.draft.horizontal,false);assert.equal(h.buttons[1]['aria-pressed'],'true');assert.equal(h.guide.angle,0);assert.equal(h.applied.length,0);
 h.el('applyGuides').onclick();assert.equal(h.applied.length,1);assert.equal(h.applied[0].angle,45);assert.equal(h.applied[0].horizontal,false);assert.equal(h.applied[0].enabled,true);
});
test('slider, numeric input, reset and keyboard stay synchronized; closing discards changes',()=>{
 const h=harness();h.el('guideAngle').value=-12.3;h.el('guideAngle').oninput();assert.equal(h.el('guideAngleNumber').value,-12.3);
 h.el('guideAngleNumber').value='8.5';h.el('guideAngleNumber').valueAsNumber=8.5;h.el('guideAngleNumber').oninput();assert.equal(h.editor.draft.angle,8.5);assert.equal(h.el('guideAngle').value,8.5);
 h.el('guideCanvas').onkeydown({key:'ArrowRight',shiftKey:true,preventDefault(){}});assert.equal(h.editor.draft.angle,13.5);h.el('resetGuideAngle').onclick();assert.equal(h.editor.draft.angle,0);
 h.editor.accept({blob:new Blob(['png']),size:{width:400,height:200}});h.el('guideDialog').close();h.images[0].onload();assert.equal(h.editor.image,null);assert.equal(h.applied.length,0);assert.equal(h.guide.angle,0);
});
test('object checkboxes remain a draft until applied and are restored when reopened',()=>{
 const h=harness();assert.equal(h.el('guideObject1').checked,true);assert.equal(h.el('guideObject2').checked,true);
 h.el('guideObject1').checked=false;h.el('guideObject1').oninput();assert.equal(h.editor.draft.object1,false);
 h.el('guideDialog').close();assert.equal(h.guide.object1,true);assert.equal(h.applied.length,0);
 h.editor.open({guide:h.guide,centers:[],labels:false});assert.equal(h.el('guideObject1').checked,true);
 h.el('guideObject2').checked=false;h.el('guideObject2').oninput();h.el('applyGuides').onclick();
 assert.equal(h.applied[0].object1,true);assert.equal(h.applied[0].object2,false);
});

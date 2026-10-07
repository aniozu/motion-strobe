// DOM adapter for the frame editor's touch/keyboard contract, not browser QA.
import test from 'node:test';import assert from 'node:assert/strict';import {CenterEditor} from '../src/center-editor.js';
function editorHarness(){
 const elements=new Map(),modes=['target','center','none'].map(mode=>({dataset:{centerMode:mode},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}}));
 const context={save(){},restore(){},translate(){},scale(){},clearRect(){},drawImage(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){}};
 const el=id=>{if(!elements.has(id))elements.set(id,{classList:{toggle(){}},setAttribute(key,value){this[key]=value;},addEventListener(){},querySelectorAll(){return modes;},showModal(){},getContext(){return context;},getBoundingClientRect(){return {left:10,top:20,width:200,height:100};},setPointerCapture(){},width:400,height:200});return elements.get(id);};
 elements.set('skipCenter',modes[2]);globalThis.document={getElementById:el};const preview=[],anchors=[],skipped=[],reset=[],automatic=[],cancelled=[];
 const editor=new CenterEditor({preview:i=>preview.push(i),onAnchor:a=>anchors.push(a),onSkip:i=>skipped.push(i),onReset:i=>reset.push(i),onAuto:i=>automatic.push(i),onCancel:()=>cancelled.push(true)});
 const data={indices:[3,6,9],centers:[{index:3,confidence:'unset'},{index:6,x:100,y:50,confidence:'manual',source:'object'},{index:9,confidence:'skipped'}],size:{width:400,height:200},period:1/60,first:3,anchors:[]};editor.setData(data);editor.image={};
 return {editor,data,el,modes,preview,anchors,skipped,reset,automatic,cancelled};
}
test('tap selection and center drag carry only the displayed frame and its coordinate space',()=>{const h=editorHarness();h.editor.select(1);assert.deepEqual(h.preview,[6]);h.editor.setBusy(false);h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointerup({clientX:60,clientY:45,pointerId:1});assert.deepEqual(h.anchors[0],{index:6,x:100,y:50,mode:'target',source:'manual',spaceWidth:400,spaceHeight:200});
 h.editor.setData(h.data);h.modes[1].onclick();h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointermove({clientX:70,clientY:55,pointerId:1});h.el('centerCanvas').onpointerup({clientX:70,clientY:55,pointerId:1});assert.equal(h.anchors[1].mode,'center');assert.equal(h.anchors[1].index,6);assert.equal(h.anchors[1].x,120);assert.equal(h.anchors[1].y,70);assert.equal(h.data.centers[1].x,100);
});
test('skip and reset address only the current frame and expose the skipped state',()=>{const h=editorHarness();h.editor.select(2);h.editor.setBusy(false);assert.equal(h.el('skipCenter')['aria-pressed'],'true');assert.match(h.el('centerStatus').textContent,/3\/3.*検出なし/);h.el('skipCenter').onclick();assert.deepEqual(h.skipped,[9]);h.editor.setData(h.data);h.el('resetCenters').onclick();assert.deepEqual(h.reset,[9]);});

test('automatic action requires a manual seed, keeps the initial seed and offers progress cancellation',()=>{
 const h=editorHarness();assert.equal(h.el('autoDetect').disabled,true);
 const data={...h.data,anchors:[{index:6,x:100,y:50,mode:'center',source:'object'},{index:9,x:150,y:60,mode:'center',source:'manual'}],seedIndex:9};h.editor.setData(data);h.editor.select(1);h.editor.setBusy(false);
 assert.equal(h.el('autoDetect').disabled,false);h.el('autoDetect').onclick();assert.deepEqual(h.automatic,[9]);assert.equal(h.editor.pending,true);assert.equal(h.el('detectionProgress').hidden,false);assert.equal(h.el('centerFrame').disabled,true);
 h.editor.progress({stage:'物体を検出中 2/3',value:2/3});assert.match(h.el('detectionTitle').textContent,/67%/);h.el('cancelDetection').onclick();assert.equal(h.cancelled.length,1);h.editor.setBusy(false);assert.equal(h.el('detectionProgress').hidden,true);
});

test('auto, manual and none have distinct instructions and none never writes a tapped position',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);assert.equal(h.el('centerInstruction').textContent,'検出する物体をタップすると、位置を自動で決定します。');
 h.modes[1].onclick();assert.equal(h.el('centerInstruction').textContent,'タップ・ドラッグで物体の中心を決めます。');
 h.modes[2].onclick();assert.deepEqual(h.skipped,[6]);assert.equal(h.editor.mode,'none');h.editor.setBusy(false);assert.equal(h.el('centerInstruction').textContent,'このコマでは物体の位置を検出しません。');
 h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointerup({clientX:60,clientY:45,pointerId:1});assert.equal(h.anchors.length,0);
 h.modes[0].onclick();assert.equal(h.editor.mode,'target');h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointerup({clientX:60,clientY:45,pointerId:1});assert.equal(h.anchors.length,1);assert.equal(h.anchors[0].index,6);
});

test('zoomed manual taps map to source pixels, pan never changes a center, and reset restores the whole image',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);h.modes[1].onclick();h.el('centerZoomIn').onclick();h.el('centerZoomIn').onclick();assert.equal(h.editor.viewport.scale,2.25);
 h.el('centerCanvas').onpointerdown({clientX:85,clientY:57.5,pointerId:1});h.el('centerCanvas').onpointerup({clientX:85,clientY:57.5,pointerId:1});
 assert.equal(h.anchors.length,1);assert.equal(h.anchors[0].index,6);assert.equal(h.anchors[0].spaceWidth,400);assert.equal(h.anchors[0].spaceHeight,200);assert(Math.abs(h.anchors[0].x-(200-50/2.25))<1e-9);assert(Math.abs(h.anchors[0].y-(100-25/2.25))<1e-9);
 h.editor.setData(h.data);const before=h.editor.viewport.x;h.el('centerPan').onclick();h.el('centerCanvas').onpointerdown({clientX:110,clientY:70,pointerId:2});h.el('centerCanvas').onpointermove({clientX:130,clientY:70,pointerId:2});h.el('centerCanvas').onpointerup({clientX:130,clientY:70,pointerId:2});assert(h.editor.viewport.x<before);assert.equal(h.anchors.length,1);
 h.el('centerZoomReset').onclick();assert.equal(h.editor.viewport.scale,1);assert.deepEqual(h.editor.point({clientX:60,clientY:45}),{x:100,y:50});assert.equal(h.el('centerZoomOut').disabled,true);
});
test('two-finger pinch and pan cannot accidentally place a center, including when one finger lifts first',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);h.modes[1].onclick();const canvas=h.el('centerCanvas');
 canvas.onpointerdown({clientX:85,clientY:70,pointerId:1});canvas.onpointerdown({clientX:135,clientY:70,pointerId:2});canvas.onpointermove({clientX:185,clientY:70,pointerId:2});assert.equal(h.editor.viewport.scale,2);
 canvas.onpointerup({clientX:185,clientY:70,pointerId:2});canvas.onpointermove({clientX:90,clientY:75,pointerId:1});canvas.onpointerup({clientX:90,clientY:75,pointerId:1});assert.equal(h.anchors.length,0);
 canvas.onpointerdown({clientX:110,clientY:70,pointerId:3});canvas.onpointerup({clientX:110,clientY:70,pointerId:3});assert.equal(h.anchors.length,1);
});
test('wheel zoom anchors the source point and skips zoom while processing; frame changes retain zoom',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);const point={clientX:110,clientY:70};const before=h.editor.point(point);let prevented=false;
 h.el('centerCanvas').onwheel({...point,deltaY:-100,preventDefault(){prevented=true;}});assert(prevented);assert(h.editor.viewport.scale>1);assert.deepEqual(h.editor.point(point),before);
 const scale=h.editor.viewport.scale;h.editor.select(0);assert.equal(h.editor.viewport.scale,scale);h.el('centerCanvas').onwheel({...point,deltaY:-100,preventDefault(){}});assert.equal(h.editor.viewport.scale,scale);
});

test('switching objects shows independent seeds and skipped frames without replacing the first object',()=>{
 const h=editorHarness(),first={...h.data,objectId:0,anchors:[{index:6,x:100,y:50,mode:'center',source:'manual'}],seedIndex:6};
 h.editor.setData(first);h.editor.select(1);h.editor.setBusy(false);h.modes[1].onclick();assert.equal(h.editor.seed().x,100);
 const second={...h.data,objectId:1,centers:[{index:3,confidence:'unset'},{index:6,confidence:'skipped'},{index:9,x:250,y:80,confidence:'manual'}],anchors:[{index:6,mode:'skip'},{index:9,x:250,y:80,mode:'center',source:'manual'}],seedIndex:9};
 h.editor.setData(second);h.editor.select(1);h.editor.setBusy(false);assert.equal(h.editor.mode,'none');assert.equal(h.editor.seed().x,250);
 h.editor.setData(first);h.editor.select(1);h.editor.setBusy(false);assert.equal(h.editor.mode,'target');assert.equal(h.editor.seed().x,100);assert.equal(h.editor.centers[1].x,100);assert.equal(first.anchors.length,1);
});

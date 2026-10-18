// DOM adapter for the frame editor's touch/keyboard contract, not browser QA.
import test from 'node:test';import assert from 'node:assert/strict';import {CenterEditor} from '../src/center-editor.js';
function editorHarness(){
 const elements=new Map(),modes=['target','center','none'].map(mode=>({dataset:{centerMode:mode},classList:{toggle(){}},setAttribute(k,v){this[k]=v;}}));
 const rectangles=[],context={save(){},restore(){},translate(){},scale(){},clearRect(){},drawImage(){},setLineDash(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},strokeRect(...args){rectangles.push({args,color:this.strokeStyle});},arc(){},fill(){}};
 const el=id=>{if(['centerZoomIn','centerZoomOut','centerZoomReset','centerZoomLevel','centerPan'].includes(id))throw Error('Removed viewport control: '+id);if(!elements.has(id))elements.set(id,{classList:{toggle(){}},setAttribute(key,value){this[key]=value;},addEventListener(){},querySelectorAll(){return modes;},showModal(){this.open=true;},close(){this.open=false;},focus(){this.focused=true;},getContext(){return context;},getBoundingClientRect(){return {left:10,top:20,width:200,height:100};},setPointerCapture(){},width:400,height:200});return elements.get(id);};
 elements.set('skipCenter',modes[2]);globalThis.document={getElementById:el};const preview=[],anchors=[],skipped=[],reset=[],automatic=[],cancelled=[];
 const editor=new CenterEditor({preview:i=>preview.push(i),onAnchor:a=>anchors.push(a),onSkip:i=>skipped.push(i),onReset:i=>reset.push(i),onAuto:i=>automatic.push(i),onCancel:()=>cancelled.push(true)});
 const data={indices:[3,6,9],centers:[{index:3,confidence:'unset'},{index:6,x:100,y:50,confidence:'manual',source:'object'},{index:9,confidence:'skipped'}],size:{width:400,height:200},period:1/60,first:3,anchors:[]};editor.setData(data);editor.image={};
 return {editor,data,el,modes,preview,anchors,skipped,reset,automatic,cancelled,rectangles};
}
test('the inspection frame shows the measured object bounds, with uncertainty color and no box for a manual point',()=>{
 const h=editorHarness(),mark={index:6,x:100,y:50,confidence:'auto',bounds:{x:80,y:30,w:40,h:35}};
 h.editor.index=6;h.editor.setData({...h.data,centers:[mark]});
 assert.deepEqual(h.rectangles.at(-1),{args:[80,30,40,35],color:'#52f0c9'});
 h.editor.setData({...h.data,centers:[{...mark,confidence:'uncertain'}]});assert.equal(h.rectangles.at(-1).color,'#ef9e35');
 h.rectangles.length=0;h.editor.setData({...h.data,centers:[{index:6,x:100,y:50,confidence:'manual',source:'manual'}]});assert.equal(h.rectangles.length,0);
 h.editor.setData({...h.data,trackingMode:'point',centers:[mark]});assert.equal(h.rectangles.length,0);
});
test('tap selection and center drag carry only the displayed frame and its coordinate space',()=>{const h=editorHarness();h.editor.select(1);assert.deepEqual(h.preview,[6]);h.editor.setBusy(false);h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointerup({clientX:60,clientY:45,pointerId:1});assert.deepEqual(h.anchors[0],{index:6,x:100,y:50,mode:'target',source:'manual',spaceWidth:400,spaceHeight:200});
 h.editor.setData(h.data);h.modes[1].onclick();h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointermove({clientX:70,clientY:55,pointerId:1});h.el('centerCanvas').onpointerup({clientX:70,clientY:55,pointerId:1});assert.equal(h.anchors[1].mode,'center');assert.equal(h.anchors[1].index,6);assert.equal(h.anchors[1].x,120);assert.equal(h.anchors[1].y,70);assert.equal(h.data.centers[1].x,100);
});
test('skip and reset address only the current frame and expose the skipped state',()=>{const h=editorHarness();h.editor.select(2);h.editor.setBusy(false);assert.equal(h.el('skipCenter')['aria-pressed'],'true');assert.match(h.el('centerStatus').textContent,/3\/3.*検出なし/);h.el('skipCenter').onclick();assert.deepEqual(h.skipped,[9]);h.editor.setData(h.data);h.el('resetCenters').onclick();assert.deepEqual(h.reset,[9]);});

test('automatic action accepts no hint, keeps a supplied seed and offers progress cancellation',()=>{
 const h=editorHarness();assert.equal(h.el('autoDetect').disabled,false);
 h.el('autoDetect').onclick();assert.deepEqual(h.automatic,[null]);assert(h.editor.pending);h.editor.setBusy(false);h.automatic.length=0;
 const data={...h.data,anchors:[{index:6,x:100,y:50,mode:'center',source:'object'},{index:9,x:150,y:60,mode:'center',source:'manual'}],seedIndex:9};h.editor.setData(data);h.editor.select(1);h.editor.setBusy(false);
 assert.equal(h.el('autoDetect').disabled,false);h.el('autoDetect').onclick();assert.deepEqual(h.automatic,[9]);assert.equal(h.editor.pending,true);assert.equal(h.el('detectionProgress').hidden,false);assert.equal(h.el('centerFrame').disabled,true);
 h.editor.progress({stage:'物体を検出中 2/3',value:2/3});assert.match(h.el('detectionTitle').textContent,/67%/);h.el('cancelDetection').onclick();assert.equal(h.cancelled.length,1);h.editor.setBusy(false);assert.equal(h.el('detectionProgress').hidden,true);
});

test('auto, manual and none have distinct instructions and none never writes a tapped position',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);assert.match(h.el('centerInstruction').textContent,/ヒント/);
 h.modes[1].onclick();assert.equal(h.el('centerInstruction').textContent,'画像をクリック／タップ、またはドラッグして位置を手動で決めます。');
 h.modes[2].onclick();assert.deepEqual(h.skipped,[6]);assert.equal(h.editor.mode,'none');h.editor.setBusy(false);assert.equal(h.el('centerInstruction').textContent,'このコマは検出しません。');
 h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointerup({clientX:60,clientY:45,pointerId:1});assert.equal(h.anchors.length,0);
 h.modes[0].onclick();assert.equal(h.editor.mode,'target');h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointerup({clientX:60,clientY:45,pointerId:1});assert.equal(h.anchors.length,1);assert.equal(h.anchors[0].index,6);
});

test('zoomed manual taps map to source pixels, pan never changes a center, and reset restores the whole image',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);h.modes[1].onclick();for(let i=0;i<2;i++)h.el('centerCanvas').onwheel({clientX:110,clientY:70,deltaY:-Math.log(1.5)/.005,preventDefault(){}});assert(Math.abs(h.editor.viewport.scale-2.25)<1e-9);
 h.el('centerCanvas').onpointerdown({clientX:85,clientY:57.5,pointerId:1});h.el('centerCanvas').onpointerup({clientX:85,clientY:57.5,pointerId:1});
 assert.equal(h.anchors.length,1);assert.equal(h.anchors[0].index,6);assert.equal(h.anchors[0].spaceWidth,400);assert.equal(h.anchors[0].spaceHeight,200);assert(Math.abs(h.anchors[0].x-(200-50/2.25))<1e-9);assert(Math.abs(h.anchors[0].y-(100-25/2.25))<1e-9);
 h.editor.setData(h.data);const before=h.editor.viewport.x;h.el('centerCanvas').onkeydown({code:'Space',key:' ',preventDefault(){}});h.el('centerCanvas').onpointerdown({clientX:110,clientY:70,pointerId:2});h.el('centerCanvas').onpointermove({clientX:130,clientY:70,pointerId:2});h.el('centerCanvas').onkeyup({code:'Space',key:' ',preventDefault(){}});h.el('centerCanvas').onpointerup({clientX:130,clientY:70,pointerId:2});assert(h.editor.viewport.x<before);assert.equal(h.anchors.length,1);
 for(let i=0;i<12;i++)h.el('centerCanvas').onwheel({clientX:110,clientY:70,deltaY:100,preventDefault(){}});assert.equal(h.editor.viewport.scale,1);assert.deepEqual(h.editor.point({clientX:60,clientY:45}),{x:100,y:50});
});
test('two-finger pinch and pan cannot accidentally place a center, including when one finger lifts first',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);h.modes[1].onclick();const canvas=h.el('centerCanvas');
 canvas.onpointerdown({clientX:85,clientY:70,pointerId:1});canvas.onpointerdown({clientX:135,clientY:70,pointerId:2});canvas.onpointermove({clientX:185,clientY:70,pointerId:2});assert.equal(h.editor.viewport.scale,2);
 canvas.onpointerup({clientX:185,clientY:70,pointerId:2});canvas.onpointermove({clientX:90,clientY:75,pointerId:1});canvas.onpointerup({clientX:90,clientY:75,pointerId:1});assert.equal(h.anchors.length,0);
 canvas.onpointerdown({clientX:110,clientY:70,pointerId:3});canvas.onpointerup({clientX:110,clientY:70,pointerId:3});assert.equal(h.anchors.length,1);
});
test('Space started during a drag and focus loss never leave a pending position edit',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);h.modes[1].onclick();const canvas=h.el('centerCanvas');
 canvas.onwheel({clientX:110,clientY:70,deltaY:-100,preventDefault(){}});const before=h.editor.viewport.x;
 canvas.onpointerdown({clientX:110,clientY:70,pointerId:1});
 canvas.onkeydown({code:'Space',key:' ',preventDefault(){}});
 canvas.onpointermove({clientX:135,clientY:70,pointerId:1});
 canvas.onkeyup({code:'Space',key:' ',preventDefault(){}});
 canvas.onpointerup({clientX:135,clientY:70,pointerId:1});
 assert(h.editor.viewport.x<before);assert.equal(h.anchors.length,0);assert.equal(h.editor.panPointer,null);
 canvas.onkeydown({code:'Space',key:' ',preventDefault(){}});canvas.onblur();assert.equal(h.editor.panMode,false);
 canvas.onpointerdown({clientX:110,clientY:70,pointerId:2});canvas.onpointerup({clientX:110,clientY:70,pointerId:2});
 assert.equal(h.anchors.length,1);assert.equal(h.anchors[0].mode,'center');
});
test('wheel zoom anchors the source point and skips zoom while processing; frame changes retain zoom',()=>{
 const h=editorHarness();h.editor.select(1);h.editor.setBusy(false);const point={clientX:110,clientY:70};const before=h.editor.point(point);let prevented=false;
 h.el('centerCanvas').onwheel({...point,deltaY:-100,preventDefault(){prevented=true;}});assert(prevented);assert(h.editor.viewport.scale>1);assert.deepEqual(h.editor.point(point),before);
 const scale=h.editor.viewport.scale;h.editor.select(0);assert.equal(h.editor.viewport.scale,scale);h.el('centerCanvas').onwheel({...point,deltaY:-100,preventDefault(){}});assert.equal(h.editor.viewport.scale,scale);
});

test('selected-point mode preserves the tapped coordinate, disables center snapping and survives object switches',()=>{
 const h=editorHarness(),data={...h.data,trackingMode:'point',objectId:0};h.editor.setData(data);h.editor.select(1);h.editor.setBusy(false);
 assert.equal(h.el('autoDetect').disabled,true);h.el('autoDetect').onclick();assert.deepEqual(h.automatic,[]);
 assert.equal(h.el('centerTrackingMode').value,'point');assert.equal(h.modes[0].hidden,true);assert.match(h.el('centerInstruction').textContent,/印や点/);
 h.el('centerCanvas').onpointerdown({clientX:60,clientY:45,pointerId:1});h.el('centerCanvas').onpointerup({clientX:60,clientY:45,pointerId:1});
 assert.equal(h.anchors[0].mode,'center');assert.equal(h.anchors[0].x,100);assert.equal(h.anchors[0].y,50);
 h.editor.setData({...h.data,objectId:1,trackingMode:'center'});assert.equal(h.modes[0].hidden,false);
 h.editor.setData(data);assert.equal(h.el('centerTrackingMode').value,'point');assert.equal(h.modes[0].hidden,true);
 h.editor.setBusy(true);assert(h.el('centerTrackingMode').disabled);
});

test('switching objects shows independent seeds and skipped frames without replacing the first object',()=>{
 const h=editorHarness(),first={...h.data,objectId:0,anchors:[{index:6,x:100,y:50,mode:'center',source:'manual'}],seedIndex:6};
 h.editor.setData(first);h.editor.select(1);h.editor.setBusy(false);h.modes[1].onclick();assert.equal(h.editor.seed().x,100);
 const second={...h.data,objectId:1,centers:[{index:3,confidence:'unset'},{index:6,confidence:'skipped'},{index:9,x:250,y:80,confidence:'manual'}],anchors:[{index:6,mode:'skip'},{index:9,x:250,y:80,mode:'center',source:'manual'}],seedIndex:9};
 h.editor.setData(second);h.editor.select(1);h.editor.setBusy(false);assert.equal(h.editor.mode,'none');assert.equal(h.editor.seed().x,250);
 h.editor.setData(first);h.editor.select(1);h.editor.setBusy(false);assert.equal(h.editor.mode,'target');assert.equal(h.editor.seed().x,100);assert.equal(h.editor.centers[1].x,100);assert.equal(first.anchors.length,1);
});

test('missing-frame button opens the first unresolved frame, wraps, and locks during preview',()=>{
 const h=editorHarness();assert.equal(h.el('centerNextMissing').disabled,false);
 h.el('centerNextMissing').onclick();assert.equal(h.editor.index,3);assert.equal(h.el('centerDialog').open,true);assert.equal(h.el('centerNextMissing').disabled,true);
 h.editor.setBusy(false);h.el('centerNextMissing').onclick();assert.equal(h.editor.index,3);assert(!h.preview.includes(9));
 h.editor.setData({...h.data,centers:h.data.centers.map(center=>center.index===3?{index:3,x:10,y:20,confidence:'manual'}:center)});
 assert.equal(h.el('centerNextMissing').disabled,true);
});

test('result popup offers direct review, and closing it never cancels or edits positions',()=>{
 const h=editorHarness(),summary={successful:1,total:3,missing:1,uncertain:0,skipped:1};
 h.editor.showDetectionResults([{objectId:0,summary}]);assert.equal(h.el('autoDetectionDialog').open,true);assert.equal(h.el('autoResultCount0').textContent,'1/3 コマ成功');assert.equal(h.el('autoResultObject1').hidden,true);assert.equal(h.el('reviewMissingFrames').disabled,false);
 h.el('closeDetectionResult').onclick();assert.equal(h.el('autoDetectionDialog').open,false);assert.equal(h.preview.length,0);assert.equal(h.cancelled.length,0);
 h.editor.showDetectionResults([{objectId:0,summary}]);h.el('reviewMissingFrames').onclick();assert.equal(h.el('autoDetectionDialog').open,false);assert.equal(h.editor.index,3);assert.equal(h.el('centerDialog').open,true);
 h.editor.setBusy(false);h.editor.showDetectionResults([{objectId:0,summary:{successful:2,total:3,missing:0,uncertain:0,skipped:1}}]);assert.equal(h.el('reviewMissingFrames').disabled,true);assert.equal(h.el('closeDetectionResult').focused,true);
});


test('completed automatic tracking keeps an off-grid manual seed available for another run',()=>{
 const h=editorHarness(),data={...h.data,anchors:[{index:4,x:100,y:50,mode:'center',source:'manual'}],seedIndex:4};
 h.editor.setData(data);assert.equal(h.el('autoDetect').disabled,false);
 h.editor.setData({...data,autoEnabled:true});assert.equal(h.el('autoDetect').disabled,false);h.el('autoDetect').onclick();assert.deepEqual(h.automatic,[4]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {GraphViewport,bindGraphNavigation} from '../src/graph-viewport.js';
import {graphTypes,fitGraph} from '../src/graph-data.js';
import {graphGeometry,drawGraph} from '../src/graph-panel.js';
const close=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const base={x:{min:-10,max:10},y:{min:-10,max:10},t:{min:0,max:2}};
const fraction=(range,f)=>range.min+(range.max-range.min)*f;
const span=range=>range.max-range.min;
function canvasEvents(){
 const handlers={},captures=[];
 const canvas={clientWidth:400,clientHeight:230,addEventListener(name,fn,options){handlers[name]={fn,options};},getBoundingClientRect:()=>({left:50,top:20}),focus(){},setPointerCapture(id){captures.push(id);}};
 const send=(name,values={})=>{const event={pointerType:'touch',button:0,preventDefault(){this.prevented=true;},...values};handlers[name].fn(event);return event;};
 return {canvas,send,handlers,captures};
}
test('zoom keeps focal coordinates fixed and changes only the displayed axes',()=>{
 const view=new GraphViewport(base),anchorX=fraction(view.ranges.x,.2),anchorY=fraction(view.ranges.y,.8);
 view.zoom(graphTypes[0],2,.2,.8);
 close(fraction(view.ranges.x,.2),anchorX);close(fraction(view.ranges.y,.8),anchorY);
 close(span(view.ranges.x),10);close(span(view.ranges.y),10);close(span(view.ranges.t),2);
 assert.deepEqual(base.x,{min:-10,max:10});
 const [yx,xt,yt]=graphTypes.map(type=>graphGeometry(280,250,type,view.ranges));
 assert.notEqual(yx.area.right-yx.area.left,yx.area.bottom-yx.area.top);
 close(xt.area.bottom-xt.area.top,yt.area.bottom-yt.area.top);
 assert.deepEqual(xt.xRange,yt.xRange);assert.deepEqual(yx.xRange,xt.yRange);assert.deepEqual(yx.yRange,yt.yRange);
});
test('time-plot zoom and pan update matching axes without altering measured values or the other center',()=>{
 const view=new GraphViewport(base);view.zoom(graphTypes[1],4,.25,.75);
 const yBefore={...view.ranges.y},tBefore={...view.ranges.t},xBefore={...view.ranges.x};
 view.pan(graphTypes[1],.2,-.1);
 close(view.ranges.t.min,tBefore.min-span(tBefore)*.2);close(view.ranges.x.min,xBefore.min+span(xBefore)*.1);
 assert.deepEqual(view.ranges.y,yBefore);close(span(view.ranges.x),5);close(span(view.ranges.y),20);
 view.reset();assert.deepEqual(view.ranges,base);assert.deepEqual(view.scales,{x:1,y:1,t:1});
});
test('zoom limits, panning bounds, invalid inputs and empty graphs keep finite ranges',()=>{
 const view=new GraphViewport();view.zoom(graphTypes[0],2);view.pan(graphTypes[0],1,1);assert.equal(view.ranges,null);
 view.set(base);view.zoom(graphTypes[0],1e9);assert.equal(view.scales.x,64);assert.equal(view.scales.y,64);assert.equal(view.scales.t,1);
 view.zoom(graphTypes[0],1e-12);assert.equal(view.scales.x,.25);assert.equal(view.scales.y,.25);
 const old=JSON.stringify(view.ranges);view.zoom(graphTypes[0],NaN);view.pan(graphTypes[0],Infinity,0);assert.equal(JSON.stringify(view.ranges),old);
 view.pan(graphTypes[0],1e30,-1e30);for(const range of Object.values(view.ranges))assert(Number.isFinite(range.min)&&range.max>range.min);
 view.reset();assert.deepEqual(view.ranges,base);
});
test('wheel zoom uses the plot focal point, prevents scrolling and keyboard restores the shared viewport',()=>{
 const mock=canvasEvents(),view=new GraphViewport(base);let changes=0;
 const geometry=()=>graphGeometry(400,230,graphTypes[2],view.ranges);
 bindGraphNavigation(mock.canvas,{viewport:view,type:graphTypes[2],geometry,onChange:()=>changes++});
 const {area}=geometry(),clientX=50+area.left+(area.right-area.left)*.3,clientY=20+area.bottom-(area.bottom-area.top)*.7;
 const t=fraction(view.ranges.t,.3),y=fraction(view.ranges.y,.7);
 const event=mock.send('wheel',{clientX,clientY,deltaY:-100,deltaMode:0});assert(event.prevented);assert.equal(mock.handlers.wheel.options.passive,false);
 close(fraction(view.ranges.t,.3),t);close(fraction(view.ranges.y,.7),y);assert(view.scales.t>1);assert(view.scales.y>1);assert.equal(view.scales.x,1);
 mock.send('keydown',{key:'ArrowRight'});mock.send('keydown',{key:'0'});assert.deepEqual(view.ranges,base);assert.equal(changes,3);
});
test('horizontal two-pointer pinch doubles only x scale, pointer cancellation switches safely to drag, and close cleanup stops drag',()=>{
 const mock=canvasEvents(),view=new GraphViewport(base);let changes=0;
 const clear=bindGraphNavigation(mock.canvas,{viewport:view,type:graphTypes[0],geometry:()=>graphGeometry(400,230,graphTypes[0],view.ranges),onChange:()=>changes++});
 mock.send('pointerdown',{pointerId:1,clientX:200,clientY:100});mock.send('pointerdown',{pointerId:2,clientX:300,clientY:100});
 mock.send('pointermove',{pointerId:2,clientX:400,clientY:100});close(view.scales.x,2);close(view.scales.y,1);assert.deepEqual(mock.captures,[1,2]);
 mock.send('pointercancel',{pointerId:2});const x=view.ranges.x.min;
 mock.send('pointermove',{pointerId:1,clientX:210,clientY:100});assert(view.ranges.x.min<x);assert.equal(changes,2);
 clear();const saved=JSON.stringify(view.ranges);mock.send('pointermove',{pointerId:1,clientX:300,clientY:100});assert.equal(JSON.stringify(view.ranges),saved);
});
test('fit strokes are drawn after every measured point, and zoom samples the visible interval densely',()=>{
 const events=[],values=[];
 const ctx={scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){events.push(this.strokeStyle);},fillText(){},save(){},restore(){},translate(){},rotate(){},rect(){},clip(){},arc(){},fill(){events.push('point');}};
 const canvas={clientWidth:400,clientHeight:230,getContext:()=>ctx,setAttribute(){}};
 const points=Array.from({length:11},(_,i)=>({t:i/10,x:i/10,y:(i/10)**2})),fit=fitGraph(points.map(p=>({x:p.t,y:p.y})),'2');
 const predict=fit.predict;fit.predict=x=>{values.push(x);return predict(x);};
 drawGraph(canvas,points,graphTypes[2],'m',fit,{...base,t:{min:.4,max:.41}});
 assert(events.lastIndexOf('#dc8623')>events.lastIndexOf('point'));assert.equal(events.filter(e=>e==='point').length,11);
 close(values[0],.4);close(values.at(-1),.41);assert.equal(values.length,201);
});


test('individual axis zoom retains the other axes and independent limits; linked graphs use the updated coordinate window',()=>{
 const view=new GraphViewport(base),y={...view.ranges.y},t={...view.ranges.t},xAnchor=fraction(view.ranges.x,.3);
 view.zoom(graphTypes[0],4,.3,.8,'horizontal');
 close(fraction(view.ranges.x,.3),xAnchor);assert.deepEqual(view.ranges.y,y);assert.deepEqual(view.ranges.t,t);
 const x={...view.ranges.x};view.zoom(graphTypes[0],2,.3,.8,'vertical');assert.deepEqual(view.ranges.x,x);close(span(view.ranges.y),10);
 view.zoom(graphTypes[1],2,.5,.5,'horizontal');close(span(view.ranges.t),1);assert.deepEqual(view.ranges.x,x);
 const [yx,xt,yt]=graphTypes.map(type=>graphGeometry(400,230,type,view.ranges));assert.deepEqual(yx.xRange,xt.yRange);assert.deepEqual(yx.yRange,yt.yRange);assert.deepEqual(xt.xRange,yt.xRange);
 view.zoom(graphTypes[0],1e6,.5,.5,'vertical');assert.deepEqual(view.scales,{x:4,y:64,t:2});view.zoom(graphTypes[0],1e-12,.5,.5,'horizontal');assert.deepEqual(view.scales,{x:.25,y:64,t:2});
 const before=JSON.stringify(view.ranges);view.zoom(graphTypes[0],2,.5,.5,'invalid');assert.equal(JSON.stringify(view.ranges),before);
 view.reset();assert.deepEqual(view.ranges,base);
});

test('wheel over each axis and modifier keys change only that axis',()=>{
 const mock=canvasEvents(),view=new GraphViewport(base),type=graphTypes[1];
 const geometry=()=>graphGeometry(400,230,type,view.ranges);bindGraphNavigation(mock.canvas,{viewport:view,type,geometry,onChange(){}});
 let {area}=geometry();mock.send('wheel',{clientX:250,clientY:20+area.bottom+10,deltaY:-100,deltaMode:0});assert(view.scales.t>1);assert.equal(view.scales.x,1);
 view.reset();({area}=geometry());mock.send('wheel',{clientX:50+area.left-10,clientY:100,deltaY:-100,deltaMode:0});assert(view.scales.x>1);assert.equal(view.scales.t,1);assert.equal(view.scales.y,1);
 view.reset();mock.send('keydown',{key:'+',shiftKey:true});assert.equal(view.scales.t,1.25);assert.equal(view.scales.x,1);
 mock.send('keydown',{key:'+',altKey:true});assert.equal(view.scales.x,1.25);assert.equal(view.scales.t,1.25);
});

test('diagonal and vertical pinches use separate dimensions without collapsing a near-zero perpendicular span',()=>{
 const mock=canvasEvents(),view=new GraphViewport(base),type=graphTypes[0];bindGraphNavigation(mock.canvas,{viewport:view,type,geometry:()=>graphGeometry(400,230,type,view.ranges),onChange(){}});
 mock.send('pointerdown',{pointerId:1,clientX:150,clientY:80});mock.send('pointerdown',{pointerId:2,clientX:250,clientY:180});
 mock.send('pointermove',{pointerId:2,clientX:350,clientY:230});close(view.scales.x,2);close(view.scales.y,1.5);
 mock.send('pointercancel',{pointerId:1});mock.send('pointercancel',{pointerId:2});view.reset();
 mock.send('pointerdown',{pointerId:1,clientX:200,clientY:50});mock.send('pointerdown',{pointerId:2,clientX:201,clientY:150});
 mock.send('pointermove',{pointerId:2,clientX:202,clientY:250});close(view.scales.x,1);close(view.scales.y,2);
});

test('both objects draw distinct colors and every fitted curve follows all measured points',()=>{
 const events=[];const ctx={scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){events.push(`stroke:${this.strokeStyle}`);},fillText(){},save(){},restore(){},translate(){},rotate(){},rect(){},clip(){},arc(){},fill(){events.push(`point:${this.fillStyle}`);}};
 const canvas={clientWidth:400,clientHeight:230,getContext:()=>ctx,setAttribute(){}};
 const first=[{t:0,x:0,y:0},{t:1,x:1,y:2}],second=[{t:0,x:3,y:4},{t:1,x:4,y:6}];
 const plots=[{points:first,color:'#2359db',fit:fitGraph(first.map(p=>({x:p.t,y:p.y})),'1')},{points:second,color:'#e67819',fit:fitGraph(second.map(p=>({x:p.t,y:p.y})),'1')}];
 drawGraph(canvas,[...first,...second],graphTypes[2],'px',plots[0].fit,base,plots);
 assert.equal(events.filter(e=>e==='point:#2359db').length,2);assert.equal(events.filter(e=>e==='point:#e67819').length,2);
 const lastPoint=Math.max(events.lastIndexOf('point:#2359db'),events.lastIndexOf('point:#e67819'));assert(events.lastIndexOf('stroke:#2359db')>lastPoint);assert(events.lastIndexOf('stroke:#e67819')>lastPoint);
});

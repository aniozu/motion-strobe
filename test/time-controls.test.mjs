import test from 'node:test';import assert from 'node:assert/strict';
import {bindFrameNudges,applyTimePoint} from '../src/time-controls.js';import {Timeline,fitTimelineView} from '../src/timeline.js';
function controls(period=1/60){const state={count:301,start:60,end:240,background:54,reference:90,period};let auto=true;const video={currentTime:0,paused:0,pause(){this.paused++;}},buttons=['start','end','background','reference'].flatMap(point=>[-1,1].map(nudge=>({dataset:{timePoint:point,nudge:String(nudge)}})));const bound=bindFrameNudges({buttons,getState:()=>state,onChange:(point,value)=>{auto=applyTimePoint(state,point,value,auto,video);bound.update();}});bound.update();return {state,video,buttons,bound,button:(point,nudge)=>buttons.find(b=>b.dataset.timePoint===point&&Number(b.dataset.nudge)===nudge),auto:()=>auto};}
test('all four time controls move by exactly one source frame and seek the paused video to that frame',()=>{
 for(const period of [1/60,1/30,1001/60000])for(const point of ['start','end','background','reference']){
  const h=controls(period),index=h.state[point];h.button(point,1).onclick();assert.equal(h.state[point],index+1);assert.equal(h.video.currentTime,(index+1)*period);h.button(point,-1).onclick();assert.equal(h.state[point],index);assert.equal(h.video.currentTime,index*period);assert.equal(h.video.paused,2);
 }
});
test('time bounds retain a valid range and automatic background follows start until edited explicitly',()=>{
 const h=controls();h.button('start',1).onclick();assert.equal(h.state.background,55);assert.equal(h.auto(),true);h.button('background',1).onclick();assert.equal(h.auto(),false);h.button('start',1).onclick();assert.equal(h.state.background,56);
 h.state.reference=h.state.start;h.bound.update();assert.equal(h.button('reference',-1).disabled,true);const before=h.video.paused;h.button('reference',-1).onclick();assert.equal(h.video.paused,before);
 h.state.end=h.state.start+1;h.bound.update();assert.equal(h.button('start',1).disabled,true);assert.equal(h.button('end',-1).disabled,true);
 applyTimePoint(h.state,'end',0,false,h.video);assert.equal(h.state.end,h.state.start+1);assert.equal(h.video.currentTime,h.state.end*h.state.period);
 h.state.background=300;h.bound.update();assert.equal(h.button('background',1).disabled,true);assert.equal(h.state.background,300);
});
test('typed out-of-range times seek the actual clamped frame and retain an in-range reference',()=>{
 const h=controls();applyTimePoint(h.state,'reference',999,true,h.video);assert.equal(h.state.reference,240);assert.equal(h.video.currentTime,240/60);
 applyTimePoint(h.state,'start',239,true,h.video);assert.equal(h.state.start,239);assert.equal(h.state.reference,240);assert.equal(h.state.background,233);
 applyTimePoint(h.state,'background',-10,true,h.video);assert.equal(h.state.background,0);assert.equal(h.video.currentTime,0);
});
test('button zoom always keeps start, end and background visible even across repeated zooms and clip boundaries',()=>{
 for(const points of [[0,60,300],[80,100,120],[285,290,300],[0,1,1]]){
  let view={low:0,high:300};for(let i=0;i<12;i++){const center=points[0],span=(view.high-view.low)*.5;view=fitTimelineView(center-span/2,center+span/2,301,points);assert(view.low>=0);assert(view.high<=300);for(const p of points)assert(p>=view.low-1e-8&&p<=view.high+1e-8);}
 }
 const tiny=fitTimelineView(0,1,2,[0,1]);assert.deepEqual(tiny,{low:0,high:1});
});
test('timeline zoom uses all configured sampling points and keeps pinch/pan available',()=>{
 globalThis.ResizeObserver=class{observe(){}};globalThis.devicePixelRatio=1;
 const ctx={scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){}};
 const canvas={clientWidth:300,clientHeight:56,addEventListener(){},getContext:()=>ctx,setAttribute(){}};
 const state={count:301,stage:'sampling',start:90,end:150,background:60,reference:120,period:1/60},timeline=new Timeline(canvas,{getState:()=>state,onChange(){},onActive(){}});
 timeline.reset();timeline.setActive('reference');for(let i=0;i<10;i++)timeline.zoom(.5);
 for(const point of ['start','end','background','reference'])assert(timeline.x(state[point])>=16-1e-8&&timeline.x(state[point])<=284+1e-8);
 assert(timeline.high-timeline.low<300);timeline.low=115;timeline.high=125;timeline.bound();assert.equal(timeline.low,115);assert.equal(timeline.high,125); // Free gesture zoom can still inspect a smaller part.
 timeline.ensurePointsVisible();assert(timeline.low<=60&&timeline.high>=150);
});

test('sampling initially fits the selected start and end with a small margin, excluding a distant background',()=>{
 globalThis.ResizeObserver=class{observe(){}};globalThis.devicePixelRatio=1;const ctx={scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},arc(){},fill(){},fillText(){}};const canvas={clientWidth:320,clientHeight:56,addEventListener(){},getContext:()=>ctx,setAttribute(){}};const state={count:1001,stage:'sampling',start:600,end:720,reference:650,background:20,period:1/60};const timeline=new Timeline(canvas,{getState:()=>state,onChange(){},onActive(){}});timeline.reset();timeline.fitSelection();assert(timeline.low<600);assert(timeline.high>720);assert(timeline.high-timeline.low<150);assert(timeline.low>500);
});

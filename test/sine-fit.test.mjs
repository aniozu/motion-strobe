import test from 'node:test';
import assert from 'node:assert/strict';
import {fitSine,fitGraph,fitEquation,graphTypes} from '../src/graph-data.js';
import {drawGraph,sharedGraphRanges} from '../src/graph-panel.js';
const close=(a,b,tol=1e-7)=>assert(Math.abs(a-b)<=tol,`${a} != ${b}`);
const samples=(count,step,value,base=0)=>Array.from({length:count},(_,i)=>({x:base+i*step,y:value(i*step)}));
test('sin fit estimates a non-grid frequency, amplitude, phase and offset',()=>{
 const omega=2*Math.PI*1.37,phase=-.71,value=x=>2.4*Math.sin(omega*x+phase)-1.8;
 const fit=fitSine(samples(81,.04,value));
 close(fit.amplitude,2.4);close(fit.omega,omega);close(fit.period,1/1.37);close(fit.offset,-1.8);
 for(const x of [.013,.123,1.83,3.1])close(fit.predict(x),value(x));
 assert(fit.r2>1-1e-12);assert(fit.rmse<1e-8);
});
test('sin fit handles missing, irregular and unsorted samples without substituting equal spacing',()=>{
 const value=x=>.07*Math.sin(2*Math.PI*x/.81+.8)+.2;
 const points=samples(70,.04,value).filter((_,i)=>i%5!==0).map((p,i)=>{const x=p.x+(i%3)*.001;return {x,y:value(x)};}).reverse();
 const fit=fitSine(points);close(fit.period,.81);close(fit.amplitude,.07);close(fit.offset,.2);
 close(fit.predict(.321),value(.321));
});
test('noisy sinusoidal data recovers the period and improves over a constant fit',()=>{
 const value=x=>3*Math.sin(2*Math.PI*x/1.2+.4)+5;
 const points=samples(121,.04,value).map((p,i)=>({...p,y:p.y+.09*Math.cos(i*1.733)+.03*Math.sin(i*2.31)}));
 const fit=fitSine(points);close(fit.period,1.2,.002);close(fit.amplitude,3,.02);close(fit.offset,5,.02);assert(fit.rmse<.08);assert(fit.r2>.99);
});
test('sin predictions remain stable for large independent-variable offsets and metre-scale values',()=>{
 const value=x=>.002*Math.sin(2*Math.PI*x/.14+.9)-.007,base=1e6;
 const points=samples(81,.01,value,base),fit=fitSine(points);
 close(fit.period,.14,1e-8);close(fit.amplitude,.002,1e-9);
 for(const p of points)close(fit.predict(p.x),p.y,1e-9);
});
test('sin fit works on a partial period, all three variable mappings and six measured frames',()=>{
 const value=x=>2*Math.sin(2*Math.PI*x/3+.6)+1;
 const fit=fitSine(samples(16,.05,value));close(fit.period,3,1e-5);close(fit.predict(.311),value(.311));
 const short=fitSine(samples(6,.1,x=>Math.sin(2*Math.PI*x/.6+.2)));close(short.period,.6);
 for(const type of graphTypes){
  const selected=fitGraph(samples(31,.07,x=>Math.sin(2*Math.PI*x/.75)), 'sin');
  const equation=fitEquation(selected,type.vertical,type.horizontal);
  assert(equation.startsWith(`${type.vertical} = `));assert(equation.includes('sin('));assert(equation.includes(type.horizontal));assert(!equation.includes('NaN'));
 }
 assert(fitEquation(fitGraph([{x:0,y:1},{x:1,y:3}],'1'),'x','t').includes('t'));
});
test('invalid, flat and underdetermined sin data produces a useful error',()=>{
 assert.throws(()=>fitSine(samples(5,.1,x=>x)),/6点/);
 assert.throws(()=>fitSine(Array.from({length:10},()=>({x:1,y:2}))),/6点/);
 assert.throws(()=>fitSine(samples(10,.1,()=>2)),/変化/);
 assert.throws(()=>fitSine([{x:NaN,y:0}]),/有限/);
});
test('sin curve is densely drawn with unchanged coordinate limits and a correct accessible label',()=>{
 const points=samples(81,.025,x=>Math.sin(2*Math.PI*x*8)).map(p=>({t:p.x,x:p.x,y:p.y}));
 const fit=fitGraph(points.map(p=>({x:p.t,y:p.y})),'sin'),ranges=sharedGraphRanges(points),before=JSON.stringify(ranges);
 let segments=0;const ctx={scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){segments++;},stroke(){},fillText(){},save(){},restore(){},translate(){},rotate(){},rect(){},clip(){},arc(){},fill(){}};
 const canvas={clientWidth:400,clientHeight:230,getContext:()=>ctx,setAttribute(k,v){this[k]=v;}};
 drawGraph(canvas,points,graphTypes[2],'m',fit,ranges);assert(segments>500);assert(canvas['aria-label'].includes('sinフィット'));assert.equal(JSON.stringify(ranges),before);
});

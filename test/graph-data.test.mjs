import test from 'node:test';
import assert from 'node:assert/strict';
import {graphData,graphTypes,fitPolynomial,polynomialEquation,graphNumber} from '../src/graph-data.js';
import {drawGraph,sharedGraphRanges,graphGeometry} from '../src/graph-panel.js';

const close=(actual,expected,tolerance=1e-9)=>assert(Math.abs(actual-expected)<=tolerance,`${actual} != ${expected}`);
test('graphs use the same px origin and right/up directions as coordinate data, excluding unmeasured frames',()=>{
 const data={size:{width:200,height:100},centers:[{x:10,y:20,time:0,confidence:'manual'},{x:30,y:10,time:.1,confidence:'auto'},{x:40,y:5,time:.2,confidence:'uncertain'},{time:.3,confidence:'skipped'},{time:.4,confidence:'missing'}]};
 const graph=graphData(data);assert.equal(graph.unit,'px');assert.equal(graph.excluded,3);
 assert.deepEqual(graph.points.map(p=>[p.t,p.x,p.y]),[[0,0,-0],[.1,20,10]]);
 data.calibration={a:{x:0,y:0},b:{x:100,y:0},width:200,height:100,length:.5,axis:'x'};
 const meters=graphData(data);assert.equal(meters.unit,'m');close(meters.points[1].x,.1);close(meters.points[1].y,.05);
 data.calibration={...data.calibration,a:{x:0,y:100},b:{x:0,y:0},axis:'x'};
 const rotated=graphData(data);close(rotated.points[1].x,.05);close(rotated.points[1].y,-.1);
});
test('empty detection and a missing first-frame origin have distinct messages; NaN times are excluded',()=>{
 assert.equal(graphData({centers:[{confidence:'unset',time:0}]}).reason,'undetected');
 const later={centers:[{confidence:'unset',time:0},{x:2,y:3,time:.1,confidence:'manual'}]};
 assert.equal(graphData(later).reason,'origin-missing');
 later.originCenter={x:0,y:0,time:0,confidence:'manual'};
 assert.equal(graphData(later).points.length,1);
 later.centers.push({x:5,y:4,time:NaN,confidence:'auto'});assert.equal(graphData(later).points.length,1);
});
for(const [degree,coefficients] of [[0,[3]],[1,[-3,2]],[2,[4,-3,2]],[3,[1,.5,-2,1]]]){
 test(`${degree}-degree least squares recovers a known polynomial including signs and intercept`,()=>{
  const value=x=>coefficients.reduce((sum,c,j)=>sum+c*x**j,0);
  const points=Array.from({length:11},(_,i)=>({x:(i-5)/2,y:value((i-5)/2)}));
  const fit=fitPolynomial(points,degree);fit.coefficients.forEach((c,j)=>close(c,coefficients[j]));
  close(fit.predict(.73),value(.73));close(fit.r2,1);close(fit.rmse,0);
 });
}
test('least squares does not merely interpolate: noisy data retains the known best line and residual',()=>{
 const fit=fitPolynomial([{x:-1,y:0},{x:0,y:-1},{x:1,y:4}],1);
 close(fit.coefficients[0],1);close(fit.coefficients[1],2);close(fit.rmse,Math.sqrt(2));close(fit.r2,4/7);
});
test('centered QR evaluation stays precise with a large time offset and small time increments',()=>{
 const base=1e6,value=x=>{const u=x-base;return 2+3*u-2*u*u+u*u*u;};
 const points=Array.from({length:15},(_,i)=>({x:base+i*.01,y:value(base+i*.01)}));
 const fit=fitPolynomial(points,3);for(const p of points)close(fit.predict(p.x),p.y,1e-10);
 close(fit.predict(base+.037),value(base+.037),1e-10);assert(fit.r2>.9999999999);
});
test('insufficient points and rank deficient independent values give errors rather than fake curves',()=>{
 assert.throws(()=>fitPolynomial([{x:0,y:1}],1),/2点以上/);
 assert.throws(()=>fitPolynomial([{x:0,y:1},{x:0,y:2}],1),/横軸/);
 assert.throws(()=>fitPolynomial([{x:0,y:1},{x:1,y:2},{x:0,y:3},{x:1,y:4}],2),/横軸/);
 assert.throws(()=>fitPolynomial([{x:NaN,y:0}],0),/有限/);
 assert.throws(()=>fitPolynomial([{x:0,y:0}],4),/0〜3/);
 close(fitPolynomial([{x:0,y:1},{x:0,y:3}],0).predict(0),2);
});
test('polynomial equation displays the selected dependent and independent variables and function values',()=>{
 const fit=fitPolynomial([{x:0,y:1},{x:1,y:2},{x:2,y:7}],2),equation=polynomialEquation(fit,'y','t');
 assert(equation.startsWith('y = '));assert(equation.includes('t²'));assert(equation.includes('−'));close(fit.predict(.5),1);
 assert.equal(graphNumber(NaN),'—');assert.equal(graphNumber(Infinity),'—');
});
test('all three plots draw measured points, label the correct axes and overlay the requested fit',()=>{
 for(const type of graphTypes){
  const labels=[],arcs=[],paths=[];
  const ctx={scale(){},fillRect(){},beginPath(){},moveTo(...p){paths.push(p);},lineTo(){},stroke(){},fillText(t){labels.push(t);},save(){},restore(){},translate(){},rotate(){},rect(){},clip(){},arc(...p){arcs.push(p);},fill(){}};
  const canvas={clientWidth:400,clientHeight:230,getContext:()=>ctx,setAttribute(k,v){this[k]=v;}};
  const points=[{t:0,x:0,y:0},{t:.1,x:2,y:3},{t:.2,x:4,y:8}];
  const fit=fitPolynomial(points.map(p=>({x:p[type.horizontal],y:p[type.vertical]})),1);
  drawGraph(canvas,points,type,'m',fit);assert.equal(arcs.length,3);
  assert(labels.includes(`${type.horizontal} (${type.horizontal==='t'?'s':'m'})`));assert(labels.includes(`${type.vertical} (m)`));assert(paths.length>4);assert(canvas['aria-label'].includes('1次'));
 }
});

test('asymmetric coordinate data uses one spatial range across every graph and a common time range',()=>{
 const points=[{x:0,y:0,t:0},{x:100,y:-20,t:.1},{x:40,y:5,t:.2}],ranges=sharedGraphRanges(points);
 assert.deepEqual(ranges.x,ranges.y);assert(ranges.x.min<-20);assert(ranges.x.max>100);
 const [yx,xt,yt]=graphTypes.map(type=>graphGeometry(360,230,type,ranges));
 assert.deepEqual(yx.xRange,yx.yRange);assert.deepEqual(yx.xRange,xt.yRange);assert.deepEqual(xt.yRange,yt.yRange);
 assert.deepEqual(xt.xRange,yt.xRange);assert(xt.xRange.min<=0&&xt.xRange.max>=.2);
 assert.equal(sharedGraphRanges([]),null);
});
test('plots use available rectangular space and independent ranges after resize',()=>{
 const ranges=sharedGraphRanges([{x:0,y:0,t:0},{x:120,y:-80,t:.2}]);
 for(const [width,height] of [[400,230],[260,280],[240,190],[600,280]]){
  const [yx,xt,yt]=graphTypes.map(type=>graphGeometry(width,height,type,ranges)),span=ranges.x.max-ranges.x.min;
  const horizontal=(yx.area.right-yx.area.left)/span,vertical=(yx.area.bottom-yx.area.top)/span;
  assert.notEqual(horizontal,vertical);close(vertical,(xt.area.bottom-xt.area.top)/span);close(vertical,(yt.area.bottom-yt.area.top)/span);assert.equal(yx.area.top,18);assert.equal(yx.area.bottom,height-44);
  close(xt.area.right-xt.area.left,yt.area.right-yt.area.left);
 }
 const flat=sharedGraphRanges([{x:0,y:0,t:0}]);assert(flat.x.max>flat.x.min);assert(flat.t.max>flat.t.min);
});
test('rendered points follow independent axis ranges without forcing a one-unit square',()=>{
 const arcs=[];const ctx={scale(){},fillRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){},save(){},restore(){},translate(){},rotate(){},rect(){},clip(){},arc(...p){arcs.push(p);},fill(){}};
 const canvas={clientWidth:400,clientHeight:230,getContext:()=>ctx,setAttribute(){}};
 const ranges={x:{min:-1,max:3},y:{min:-2,max:2},t:{min:0,max:.2}};
 drawGraph(canvas,[{t:0,x:0,y:0},{t:.1,x:1,y:0},{t:.2,x:0,y:1}],graphTypes[0],'px',null,ranges);
 const {area}=graphGeometry(400,230,graphTypes[0],ranges);
 close(arcs[1][0]-arcs[0][0],(area.right-area.left)/4);close(arcs[0][1]-arcs[2][1],(area.bottom-area.top)/4);
 assert.notEqual(arcs[1][0]-arcs[0][0],arcs[0][1]-arcs[2][1]);
});

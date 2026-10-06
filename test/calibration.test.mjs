import test from 'node:test';import assert from 'node:assert/strict';import {calibrationBasis,physicalCoordinates,withCalibrationOrigin} from '../src/calibration.js';import {coordinateRows,coordinateText} from '../src/coordinates.js';import {drawAnnotations} from '../src/annotations.js';
const size={width:400,height:200},origin={index:3,x:80,y:100,confidence:'manual'},c={a:{x:50,y:150},b:{x:250,y:150},length:.5,axis:'x',width:400,height:200,axes:false};const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
test('two-point calibration gives meters with first-object origin, right positive and up positive',()=>{
 const basis=calibrationBasis(c,size);near(basis.metersPerPixel,.0025);const p=physicalCoordinates({x:120,y:80,confidence:'auto'},origin,basis);near(p.x,.1);near(p.y,.05);assert.deepEqual(physicalCoordinates(origin,origin,basis),{x:0,y:0});
 const data={size,calibration:c,originCenter:origin,centers:[{...origin,time:0},{x:120,y:80,confidence:'auto',time:.1},{x:150,y:90,confidence:'uncertain',time:.2}]};const rows=coordinateRows(data);assert.deepEqual(rows[1].slice(1,7),['0.1000','40.0000','20.0000','0.1000','0.0500','自動']);assert.deepEqual(coordinateRows({...data,calibration:null})[1].slice(2,4),rows[1].slice(2,4));assert.deepEqual(rows[2].slice(2,6),['','','','']);
 for(const separator of [',','\t']){const lines=coordinateText(data,separator).split('\r\n');assert(lines[0].includes('x(m)'));assert(lines[0].includes('校正長さ(m)'));assert.equal(lines[0].split(separator).length,rows[0].length);assert.deepEqual(lines[2].split(separator),rows[1]);}
});
test('axis endpoint order is immaterial; y-axis ruler and rotated x-axis define the same right/up basis',()=>{
 const original=calibrationBasis(c,size),reverse=calibrationBasis({...c,a:c.b,b:c.a},size);near(original.x.x,reverse.x.x);near(original.y.y,reverse.y.y);
 const vertical=calibrationBasis({...c,a:{x:50,y:150},b:{x:50,y:50},axis:'y',length:.25},size);near(vertical.x.x,1);near(vertical.y.y,-1);near(vertical.metersPerPixel,.0025);
 const diagonal={...c,a:{x:50,y:150},b:{x:150,y:50},length:Math.SQRT2};const b=calibrationBasis(diagonal,size),p=physicalCoordinates({x:180,y:0,confidence:'manual'},origin,b);near(p.x,Math.SQRT2);near(p.y,0);const exported=coordinateRows({size,calibration:diagonal,originCenter:origin,centers:[{...origin,time:0}]});assert.equal(exported[0][11],'45.0000');near(b.x.x*b.y.x+b.x.y*b.y.y,0);
});
test('resolution changes preserve physical coordinates and measurement metadata',()=>{
 const small={width:200,height:100},o={...origin,x:40,y:50},p={x:60,y:40,confidence:'manual'},basis=calibrationBasis(c,small);near(basis.distance,100);const result=physicalCoordinates(p,o,basis);near(result.x,.1);near(result.y,.05);
 for(const bad of [{...c,length:0},{...c,length:NaN},{...c,a:c.b},{...c,width:0}])assert.equal(calibrationBasis(bad,size),null);
});
test('no origin is invented for an unmeasured first frame; thinning does not replace the base origin',()=>{
 const unmeasured={...origin,confidence:'unset'},calibration=withCalibrationOrigin(c,[unmeasured,origin],size);assert.equal(calibration.origin,null);
 const data={size,calibration:c,originCenter:unmeasured,centers:[{...origin,time:.1}]};assert.deepEqual(coordinateRows(data)[0].slice(2,4),['','']);
 const later={index:9,x:120,y:80,confidence:'manual',time:.2};const stable={size,calibration:c,originCenter:origin,centers:[later]};assert.deepEqual(coordinateRows(stable)[0].slice(2,6),['40.0000','20.0000','0.1000','0.0500']);assert.equal(withCalibrationOrigin(c,[origin,later],size).origin.index,3);
});
test('grid directions use the exact calibrated basis, independent of old angle preferences',()=>{
 const paths=[],ctx={save(){},restore(){},beginPath(){},moveTo(x,y){paths.push([x,y]);},lineTo(x,y){paths.push([x,y]);},stroke(){}};
 const cal={...c,a:{x:0,y:0},b:{x:100,y:100}},p={x:200,y:100,confidence:'manual'};drawAnnotations(ctx,[p],400,200,{calibration:cal,grid:{enabled:true,points:false,angle:0},labels:false});assert.equal(paths.length,4);
 const d1={x:paths[1][0]-paths[0][0],y:paths[1][1]-paths[0][1]},d2={x:paths[3][0]-paths[2][0],y:paths[3][1]-paths[2][1]};near(d1.x*d2.x+d1.y*d2.y,0);near(Math.abs(d1.x),Math.abs(d1.y));near(Math.abs(d2.x),Math.abs(d2.y));
});

test('calibration rulers and meter labels never leak into the exported photo or video annotations',()=>{
 const texts=[],paths=[],ctx={save(){},restore(){},beginPath(){},moveTo(x,y){paths.push([x,y]);},lineTo(x,y){paths.push([x,y]);},stroke(){},strokeText(text){texts.push(text);},fillText(text){texts.push(text);}};
 drawAnnotations(ctx,[origin],400,200,{calibration:{...c,axes:true,origin:{...origin,width:400,height:200}},grid:{enabled:true,points:false},labels:false});assert.equal(paths.length,4);assert.deepEqual(texts,[]);
});

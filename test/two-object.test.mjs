import test from 'node:test';import assert from 'node:assert/strict';
import {coordinateTable,coordinateText} from '../src/coordinates.js';
import {graphSeries,fitGraph} from '../src/graph-data.js';
import {objectView,allObjectCenters} from '../src/object-data.js';
const origin={index:2,time:0,x:20,y:80,confidence:'manual'};
const object1=[origin,{index:8,time:.1,x:30,y:70,confidence:'auto'},{index:14,time:.2,confidence:'skipped'}];
const object2=[{...origin,x:60,y:60},{index:8,time:.1,confidence:'missing'},{index:14,time:.2,x:80,y:40,confidence:'manual'}];
const data={size:{width:200,height:100},originCenter:origin,objects:[{id:0,centers:object1},{id:1,centers:object2}]};
test('two-object table uses a shared origin, aligned times and independent status; CSV omits metadata',()=>{
 const {header,rows}=coordinateTable(data);
 assert.deepEqual(header,['コマ','時刻(s)','物体1 x(px)','物体1 y(px)','物体1 状態','物体2 x(px)','物体2 y(px)','物体2 状態']);
 assert.deepEqual(rows[0].slice(2),['0.0000','0.0000','手動','40.0000','20.0000','手動']);
 assert.deepEqual(rows[1].slice(2),['10.0000','10.0000','自動','','','未検出']);
 assert.deepEqual(rows[2].slice(2),['','','打たない','60.0000','40.0000','手動']);
 const csv=coordinateText(data,',');assert.equal(csv.split('\r\n').length,4);assert(!/画像幅|画像高|校正長さ|校正距離|x軸角度|原点x|原点y/.test(csv));
 assert.deepEqual(allObjectCenters(data).map(p=>p.objectId),[0,0,0,1,1,1]);assert.equal(objectView(data,1).originCenter,origin);assert.equal(objectView({...data,originCenter:undefined},1).originCenter,origin);
});
test('calibration adds meter columns for both objects without changing pixel columns',()=>{
 const calibration={a:{x:0,y:0},b:{x:100,y:0},width:200,height:100,axis:'x',length:.5};
 const table=coordinateTable({...data,calibration});assert.equal(table.header.length,12);
 assert.deepEqual(table.rows[0].slice(7,11),['40.0000','20.0000','0.2000','0.1000']);
 assert.deepEqual(table.rows[1].slice(7,11),['','','','']);
});
test('unused object 2 preserves the single-object table; marking only object 2 does not invent an origin',()=>{
 const empty=object2.map(p=>({index:p.index,time:p.time,confidence:'unset'}));
 assert.equal(coordinateTable({...data,objects:[data.objects[0],{id:1,centers:empty}]}).header.length,5);
 const absent={...data,originCenter:{index:2,confidence:'unset'}};
 assert.deepEqual(coordinateTable(absent).rows[0].slice(5,7),['','']);assert(graphSeries(absent).every(s=>s.points.length===0&&s.reason==='origin-missing'));
});
test('graph selection keeps two trajectories separate in shared coordinates and fits each independently',()=>{
 const both=graphSeries(data);assert.equal(both.length,2);assert.deepEqual(both.map(s=>s.points.length),[2,2]);
 assert.deepEqual(both[1].points[0],{frame:1,t:0,x:40,y:20});
 const slopes=both.map(s=>fitGraph(s.points.map(p=>({x:p.t,y:p.x})),'1').coefficients[1]);
 assert(Math.abs(slopes[0]-100)<1e-8);assert(Math.abs(slopes[1]-100)<1e-8);
 assert.deepEqual(graphSeries(data,1).map(s=>s.id),[1]);assert.notEqual(both[0].color,both[1].color);
});

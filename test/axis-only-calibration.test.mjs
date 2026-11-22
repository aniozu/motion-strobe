import test from 'node:test';
import assert from 'node:assert/strict';
import {calibrationBasis,physicalCoordinates} from '../src/calibration.js';
import {coordinateTable,coordinateText} from '../src/coordinates.js';
import {graphData,graphSeries} from '../src/graph-data.js';
import {drawAnnotations} from '../src/annotations.js';

const near=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const size={width:400,height:200};
const axes={a:{x:50,y:150},b:{x:150,y:50},length:null,axis:'x',...size};
const origin={x:80,y:100,time:0,confidence:'manual'};
const end={x:120,y:60,time:.1,confidence:'auto'};
const data={size,calibration:axes,centers:[origin,end]};

test('axes without a distance rotate graphs, coordinate tables and CSV in pixels without meter columns',()=>{
 const basis=calibrationBasis(axes,size);assert.equal(basis.unit,'px');assert.equal(basis.length,null);assert.equal(basis.unitsPerPixel,1);assert.equal(basis.metersPerPixel,null);
 const graph=graphData(data);assert.equal(graph.unit,'px');near(graph.points[1].x,Math.sqrt(3200));near(graph.points[1].y,0);
 const table=coordinateTable(data);assert.deepEqual(table.header,['コマ','時刻(s)','x(px)','y(px)','状態']);assert.equal(table.rows[1][2],'56.5685');assert.equal(table.rows[1][3],'0.0000');
 const csv=coordinateText(data,',');assert(!csv.includes('(m)'));assert.equal(csv.split('\r\n')[2].split(',')[2],'56.568542');
 for(const length of [0,-1,NaN,Infinity,''])assert.equal(calibrationBasis({...axes,length},size),null);
 assert.equal(calibrationBasis({...axes,length:undefined},size).unit,'px');
});

test('adding or removing a physical distance preserves orientation and switches the graph unit and scale',()=>{
 const metric={...axes,length:.5},meters=calibrationBasis(metric,size),pixels=calibrationBasis(axes,size);
 near(meters.angle,pixels.angle);near(meters.x.x,pixels.x.x);near(meters.y.y,pixels.y.y);
 const graph=graphData({...data,calibration:metric});assert.equal(graph.unit,'m');near(graph.points[1].x,.2);near(graph.points[1].y,0);
 const pixelPoint=physicalCoordinates(end,origin,pixels),small=calibrationBasis(axes,{width:200,height:100});
 const smallPoint=physicalCoordinates({...end,x:end.x/2,y:end.y/2},{...origin,x:origin.x/2,y:origin.y/2},small);near(smallPoint.x,pixelPoint.x/2);
});

test('two objects share the same rotated pixel origin, including a separately motion-aligned direction',()=>{
 const calibration={...axes,axisAngle:-45},other={x:160,y:20,time:.1,confidence:'manual'};
 const combined={size,calibration,objects:[{id:0,centers:[origin,end]},{id:1,centers:[origin,other]}]};
 const series=graphSeries(combined);assert(series.every(s=>s.unit==='px'));near(series[0].points[1].x,Math.sqrt(3200));near(series[1].points[1].x,Math.sqrt(12800));
 const table=coordinateTable(combined);assert(table.header.includes('物体1 x(px)'));assert(!table.header.some(h=>h.includes('(m)')));assert.equal(table.rows[1][5],'113.1371');
});

test('photo and video annotations follow the pixel axes instead of the previous guide angle',()=>{
 const paths=[],ctx={save(){},restore(){},beginPath(){},moveTo(x,y){paths.push({x,y});},lineTo(x,y){paths.push({x,y});},stroke(){}};
 drawAnnotations(ctx,[end],400,200,{calibration:axes,grid:{enabled:true,points:false,angle:0},labels:false});assert.equal(paths.length,4);
 const basis=calibrationBasis(axes,size),vertical={x:paths[1].x-paths[0].x,y:paths[1].y-paths[0].y},horizontal={x:paths[3].x-paths[2].x,y:paths[3].y-paths[2].y};
 near(vertical.x*basis.x.x+vertical.y*basis.x.y,0);near(horizontal.x*basis.y.x+horizontal.y*basis.y.y,0);
});

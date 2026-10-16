import test from 'node:test';import assert from 'node:assert/strict';
import {fitMotionAngle} from '../src/motion-angle.js';
const center=(x,y,extra={})=>({x,y,confidence:'manual',...extra});
test('first-degree fit follows a noisy trajectory, is translation invariant, and leaves measurements intact',()=>{
 const points=[center(0,1),center(1,2),center(2,2)],before=structuredClone(points);
 assert.deepEqual(fitMotionAngle(points),{angle:26.6,count:3});
 assert.deepEqual(fitMotionAngle(points.map(p=>({...p,x:p.x+1000,y:p.y-500}))),{angle:26.6,count:3});assert.deepEqual(points,before);
 assert.equal(fitMotionAngle([...points].reverse()).angle,26.6);
});
test('horizontal, vertical and steep paths are fitted without a singular slope',()=>{
 assert.equal(fitMotionAngle([center(0,5),center(10,5)]).angle,0);
 assert.equal(fitMotionAngle([center(5,0),center(5,10),center(5,20)]).angle,90);
 assert.equal(fitMotionAngle([center(0,10),center(1,8),center(2,6)]).angle,-63.4);
 assert.equal(fitMotionAngle([center(0,0),center(1,2),center(2,4)]).angle,63.4);
});
test('object selection excludes other trajectories, uncertain positions, missing frames, skips and invalid coordinates',()=>{
 const points=[center(0,0),center(10,10),center(0,10,{objectId:1}),center(10,0,{objectId:1}),center(80,5,{confidence:'uncertain'}),center(70,20,{confidence:'skipped'}),center(30,90,{confidence:'missing'}),center(NaN,10)];
 assert.deepEqual(fitMotionAngle(points,0),{angle:45,count:2});assert.deepEqual(fitMotionAngle(points,1),{angle:-45,count:2});
 assert.equal(fitMotionAngle([]),null);assert.equal(fitMotionAngle([center(2,3)]),null);assert.equal(fitMotionAngle([center(2,3),center(2,3)]),null);
});

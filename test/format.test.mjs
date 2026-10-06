import test from 'node:test';import assert from 'node:assert/strict';import {formatSeconds,setTimeDecimals} from '../src/format.js';import {coordinateText} from '../src/coordinates.js';import {framePlan} from '../src/sampling.js';
test('time decimal preferences affect display and CSV only and default to four places',()=>{
 assert.equal(formatSeconds(.1),'0.1000');const frames=framePlan(1,50,13,6),data={size:{width:400,height:200},centers:[{x:0,y:0,confidence:'manual',time:1/60}]};
 for(const digits of [0,1,2,3,4,5,6]){assert.equal(setTimeDecimals(digits),digits);assert.equal(formatSeconds(1/60),(1/60).toFixed(digits));assert.equal(coordinateText(data).split('\r\n')[1].split('\t')[1],(1/60).toFixed(digits));assert.deepEqual(framePlan(1,50,13,6),frames);assert.equal(data.centers[0].time,1/60);}
 assert.equal(setTimeDecimals(99),6);assert.equal(setTimeDecimals(-1),6);assert.equal(setTimeDecimals('2'),6);setTimeDecimals(4);
});

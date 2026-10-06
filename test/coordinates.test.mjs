import test from 'node:test';import assert from 'node:assert/strict';import {coordinateRows,coordinateText} from '../src/coordinates.js';
test('coordinate table and export agree, retaining zero coordinates and leaving unmeasured rows blank',()=>{
 const data={size:{width:960,height:540},centers:[{time:0,x:0,y:0,confidence:'manual'},{time:1/30,x:120.123456,y:240.987654,confidence:'auto'},{time:.1,x:99,y:88,confidence:'uncertain'},{time:.2,confidence:'skipped'},{time:.3,confidence:'missing'},{time:.4,confidence:'unset'}]};
 const rows=coordinateRows(data);assert.deepEqual(rows[0],['1','0.0000','0.0000','0.0000','手動','960','540']);assert.deepEqual(rows[1].slice(1,5),['0.0333','120.1235','-240.9877','自動']);
 for(const row of rows.slice(2))assert.deepEqual(row.slice(2,4),['','']);
 assert.deepEqual(rows.slice(2).map(r=>r[4]),['要確認','打たない','未検出','未指定']);
 for(const separator of ['\t',',']){const text=coordinateText(data,separator),lines=text.split('\r\n');assert.equal(lines.length,7);assert.deepEqual(lines[1].split(separator),rows[0]);assert.equal(lines[0].split(separator).length,7);assert(!text.includes('undefined'));assert(!text.includes('NaN'));}
});

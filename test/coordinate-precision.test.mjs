import test from 'node:test';
import assert from 'node:assert/strict';
import {coordinateRows,coordinateTable,coordinateText} from '../src/coordinates.js';
import {setTimeDecimals} from '../src/format.js';

const data={size:{width:400,height:200},centers:[
 {index:0,x:10,y:110,time:.025,confidence:'manual'},
 {index:5,x:70.12345678,y:79.25,time:1/15,confidence:'auto'},
 {index:10,x:129.4444444,y:55.5,time:13/120,confidence:'manual'},
]};

test('CSV outputs six decimals for timestamps and positions, irrespective of UI settings',()=>{
 for(const display of [0,2,4,6]){
  setTimeDecimals(display);
  const rows=coordinateText(data,',').split('\r\n').slice(1).map(line=>line.split(','));
  assert.deepEqual(rows.map(r=>r[1]),['0.025000','0.066667','0.108333']);
  assert.match(rows[1][2],/^\d+\.\d{6}$/);
  assert.match(rows[1][3],/^\d+\.\d{6}$/);
  assert.equal(rows[1][2],'60.123457');
  assert.equal(rows[1][3],'30.750000');
 }
});

test('on-screen table and clipboard remain configurable and preserve their older formats',()=>{
 setTimeDecimals(2);
 assert.equal(coordinateTable(data).rows[1][1],'0.07');
 assert.equal(coordinateRows(data)[1][2],'60.1235');
 assert.equal(coordinateText(data).split('\r\n')[2].split('\t')[1],'0.07');
 setTimeDecimals(4);
 assert.equal(coordinateTable(data).rows[1][1],'0.0667');
 assert.equal(coordinateText(data,',').split('\r\n')[2].split(',')[1],'0.066667');
 setTimeDecimals(2);
});

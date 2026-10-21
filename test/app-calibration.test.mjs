import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
const source=await readFile('src/app.js','utf8');
const entry=source.slice(source.indexOf('function openCalibration('),source.indexOf("$('showCoordinates').onclick="));
function harness(){return new Function(`
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{});return nodes.get(id);};
 let activeObject=0,task=null,centerData={centers:['active only']},resultBlob={},calibration={length:1};
 const allData={objects:[{id:0,centers:['object 1']},{id:1,centers:['object 2']}]},analysisData=()=>allData,opened=[],posts=[],calibrationEditor={open:x=>opened.push(x)},graphPanel={objectId:'both'},post=x=>posts.push(x);
 ${entry}
 return {$,opened,posts,allData,setObject:id=>activeObject=id,setGraph:id=>graphPanel.objectId=id,setTask:value=>task=value,getTask:()=>task,clearResult:()=>resultBlob=null};
 `)();}
test('graph and data calibration entries use both complete tracks and the selected object',()=>{
 const h=harness();h.setObject(1);h.$('calibrateCoordinates').onclick();assert.equal(h.opened[0].data,h.allData);assert.equal(h.opened[0].objectId,1);assert.equal(h.getTask(),'guide-preview');assert.deepEqual(h.posts,[{type:'guide-preview'}]);
 h.setTask(null);h.setGraph(0);h.$('calibrateGraphs').onclick();assert.equal(h.opened[1].objectId,0);assert.equal(h.opened[1].data,h.allData);
 h.setTask(null);h.setGraph('both');h.$('calibrateGraphs').onclick();assert.equal(h.opened[2].objectId,1);
});
test('calibration entry blocks duplicate preview work and cannot open without a result',()=>{
 const h=harness();h.setTask('compose');h.$('calibrateGraphs').onclick();h.$('calibrateCoordinates').onclick();assert.equal(h.opened.length,0);assert.equal(h.posts.length,0);
 h.setTask(null);h.clearResult();h.$('calibrateGraphs').onclick();h.$('calibrateCoordinates').onclick();assert.equal(h.opened.length,0);
});

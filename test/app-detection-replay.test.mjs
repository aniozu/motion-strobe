// Exercise the real app message handlers with DOM/worker edges substituted.
import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {automaticReplayPlan} from '../src/automatic-replay.js';import {detectionSummary} from '../src/detection-summary.js';
const source=await readFile('src/app.js','utf8');
function harness(objects){
 const extract=source.slice(source.indexOf('function extraction(){'),source.indexOf('\nasync function handleWorkerMessage('));
 const handler=source.slice(source.indexOf('async function handleWorkerMessage('),source.indexOf('\nfunction handleWorkerError('));
 return new Function('automaticReplayPlan','detectionSummary','objects',`
  const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,open:false,value:30,checked:false});return nodes.get(id);};
  let state={count:100,start:2,end:20,reference:2,step:4,period:1/60,background:0,backgroundMode:'auto',factor:1,stage:'sampling'},objectTracks=structuredClone(objects),activeObject=0,anchors=objectTracks[0].anchors,seedIndex=objectTracks[0].seedIndex,centerData,resultData,task,requestId=0,resultBlob,resultUrl,debounce;
  let pendingDetectionResults=[],replayQueue=[],replayActive=false,extracted=false;
  const posts=[],popups=[],preferences={resolution:960},guide={},calibration=null,URL={createObjectURL:()=> 'blob:result',revokeObjectURL(){}};
  const centerEditor={setBusy(){},showDetectionResults:results=>popups.push(results)};
  const post=m=>posts.push({...m,id:++requestId}),hideError=()=>{},clearExport=()=>{},suspendPreview=()=>{},setActions=()=>{},trackUsage=()=>{};
  const busy=(name,kind)=>{task=kind;},finishBusy=()=>{task=null;},stage=next=>{state.stage=next;};
  const showStabilization=summary=>{state.stabilizationSummary=summary;},refreshObject=()=>stashObject();
  function stashObject(){objectTracks[activeObject].anchors=anchors;objectTracks[activeObject].seedIndex=seedIndex;}
  function clearDetectionRun(){pendingDetectionResults=[];replayQueue=[];replayActive=false;}
  function invalidateResult(){clearDetectionRun();resultBlob=null;requestId++;}
  function resetPositionData(){throw Error('Automatic replay lost its tracking data');}
  const annotationSettings=()=>{stashObject();return {objects:objectTracks.map(o=>({id:o.id,anchors:o.anchors}))};};
  ${extract}
  ${handler}
  return {extraction,posts,popups,nodes,getObjects:()=>objectTracks,receive:m=>handleWorkerMessage({data:{...m,id:requestId}})};
 `)(automaticReplayPlan,detectionSummary,objects);
}
const seed=index=>({index,x:40,y:30,mode:'center',source:'manual'});
const auto=index=>({index,x:50,y:30,mode:'center',source:'auto'});
test('photo rebuild waits for both opted-in objects before composing and shows one combined result',async()=>{
 const manual=seed(10),skip={index:14,mode:'skip'};
 const app=harness([{id:0,autoEnabled:true,seedIndex:8,anchors:[seed(8),manual,skip,auto(18)]},{id:1,autoEnabled:true,seedIndex:9,trackingMode:'point',anchors:[seed(9),auto(18)]}]);
 app.extraction();assert.equal(app.posts.at(-1).type,'extract');assert.deepEqual(app.posts.at(-1).trackingSeeds,[8,9]);assert.equal(app.posts.at(-1).reuseTrackingCoordinates,true);
 assert.deepEqual(app.getObjects()[0].anchors,[seed(8),manual,skip]);
 await app.receive({type:'extracted',stabilization:null});assert.equal(app.posts.at(-1).type,'auto-detect');assert.equal(app.posts.at(-1).objectId,0);assert.equal(app.posts.at(-1).replay,true);assert.equal(app.popups.length,0);
 await app.receive({type:'auto-detected',objectId:0,marks:[auto(2),{index:6,mode:'missing',source:'auto'},manual,skip,auto(18)]});assert.equal(app.posts.at(-1).type,'auto-detect');assert.equal(app.posts.at(-1).objectId,1);assert.equal(app.posts.at(-1).trackingMode,'point');
 await app.receive({type:'auto-detected',objectId:1,marks:[auto(2),auto(6),auto(10),auto(14),auto(18)]});assert.equal(app.posts.at(-1).type,'compose');assert.equal(app.popups.length,0);assert.equal(app.posts.filter(m=>m.type==='compose').length,1);
 await app.receive({type:'composed',indices:[2,6,10,14,18],centers:[],size:{width:640,height:360},count:5,blob:new Blob()});
 assert.equal(app.popups.length,1);assert.deepEqual(app.popups[0].map(r=>[r.objectId,r.summary.successful,r.summary.total]),[[0,3,5],[1,5,5]]);assert.equal(app.getObjects()[0].seedIndex,8);assert.deepEqual(app.getObjects()[0].anchors.find(a=>a.index===10),manual);assert.deepEqual(app.getObjects()[0].anchors.find(a=>a.index===14),skip);
});
test('manual-only objects do not opt in, and a replacement seed survives composing',async()=>{
 const app=harness([{id:0,autoEnabled:true,seedIndex:8,anchors:[{index:8,mode:'skip'},seed(10),auto(18)]},{id:1,seedIndex:9,anchors:[seed(9)]}]);
 app.extraction();assert.deepEqual(app.posts.at(-1).trackingSeeds,[10]);await app.receive({type:'extracted'});assert.equal(app.posts.at(-1).seedIndex,10);
 await app.receive({type:'auto-detected',objectId:0,marks:[auto(2),auto(6),seed(10),auto(14),auto(18)]});assert.equal(app.posts.at(-1).type,'compose');assert.equal(app.getObjects()[0].seedIndex,10);assert.deepEqual(app.getObjects()[1].anchors,[seed(9)]);
 const fresh=harness([{id:0,anchors:[],seedIndex:null},{id:1,anchors:[seed(9)],seedIndex:9}]);fresh.extraction();assert.deepEqual(fresh.posts.at(-1).trackingSeeds,[]);await fresh.receive({type:'extracted'});assert.equal(fresh.posts.at(-1).type,'compose');assert.equal(fresh.popups.length,0);
});

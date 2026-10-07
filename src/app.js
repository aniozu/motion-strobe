import {objectView,allObjectCenters} from './object-data.js';
import {downloadSample} from './sample-download.js';
import {detectionSummary} from './detection-summary.js';
import {safeVideoBlob,probeVideoBlob} from './media-source.js';
import {frameTime,indexAtTime,analysisClock} from './frame-clock.js';
import {GraphPanel} from './graph-panel.js';
import {CalibrationEditor} from './calibration-editor.js';import {calibrationBasis,coordinateOrigin} from './calibration.js';import {installSamples} from './samples.js';import {framePlan} from './sampling.js';import {formatSeconds as fmt,setTimeDecimals} from './format.js';import {Timeline} from './timeline.js';import {bindFrameNudges,bindFrameInput,samplingLimits,applyTimePoint} from './time-controls.js';import {installContextHelp} from './context-help.js';import {CenterEditor} from './center-editor.js';import {gridOptions} from './annotations.js';import {GuideEditor} from './guide-editor.js';import {replaceFrameMark} from './tracking.js';import {coordinateTable,coordinateText} from './coordinates.js';
const $=id=>document.getElementById(id);const workerUrl=new URL('worker.js?v=1.17.3',import.meta.url);let worker=new Worker(workerUrl,{type:'module'});
let preferences={interval:.1,resolution:960,timeDecimals:2,openingAnimation:true};try{preferences={...preferences,...JSON.parse(localStorage.getItem('motion-strobe-preferences')||'{}')};}catch{}
if(!Number.isFinite(preferences.interval)||preferences.interval<=0)preferences.interval=.1;if(![720,960,1280].includes(preferences.resolution))preferences.resolution=960;
preferences.timeDecimals=setTimeDecimals(preferences.timeDecimals);preferences.openingAnimation=preferences.openingAnimation!==false;
let state={stage:'range',count:2,period:1/60,fps:60,start:0,end:1,background:0,reference:0,step:6,factor:1},videoUrl,resultUrl,resultBlob,sourceFile,extracted=false,task=null,debounce,toastTimer,lastFocus,requestId=0,demoAbort,exportBlob,exportUrl,exportSettings,activeView='photo',sampleSelection=false,backgroundAuto=true,loadStallTimer;
let sourceClock=null,previewDetached=false,lastDiagnostics=null,lastFailedOperation=null,sampleProgress=false;
const appVersion='1.17.3';
let guide=gridOptions(preferences.grid),anchors=[],centerData=null,seedIndex=null,calibration=null;
let activeObject=0,objectTracks=[{id:0,anchors:[],seedIndex:null,summary:null},{id:1,anchors:[],seedIndex:null,summary:null}],resultData=null;
function stashObject(){objectTracks[activeObject].anchors=anchors;objectTracks[activeObject].seedIndex=seedIndex;}
function analysisData(){return {...resultData,calibration};}
function syncObjects(){
 for(const button of document.querySelectorAll('[data-detect-object]')){const active=Number(button.dataset.detectObject)===activeObject;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));button.disabled=!!task;}
 const summary=objectTracks[activeObject].summary;$('autoDetectionResult').textContent=summary?`${summary.successful}/${summary.total}`:'';$('autoDetectionResult').hidden=!summary;
}
function refreshObject(){
 if(!resultData)return;stashObject();centerData={...objectView(analysisData(),activeObject),anchors,seedIndex,objectId:activeObject,otherCenters:allObjectCenters(resultData).filter(p=>p.objectId!==activeObject)};centerEditor.setData(centerData);syncObjects();
}
function selectObject(id){
 if(task||!resultData||![0,1].includes(id)||id===activeObject)return;
 stashObject();activeObject=id;anchors=objectTracks[id].anchors;seedIndex=objectTracks[id].seedIndex;refreshObject();
 if($('centerDialog').open)centerEditor.select(centerEditor.position||0);
}
for(const button of document.querySelectorAll('[data-detect-object]'))button.onclick=()=>selectObject(Number(button.dataset.detectObject));
$('showGuides').checked=guide.enabled;
const annotationSettings=()=>{stashObject();return {grid:guide,anchors,objects:objectTracks.map(o=>({id:o.id,anchors:o.anchors})),calibration,photoRate:$('photoRate').checked,samplingRate:1/(state.step*state.period*state.factor)};};
function storeFrameMark(mark){
 objectTracks[activeObject].summary=null;
 const firstPoint=mark.mode!=='skip'&&!anchors.some(a=>a.mode!=='skip'&&Number.isFinite(a.x));
 anchors=replaceFrameMark(anchors,mark);
 if(firstPoint)seedIndex=mark.index;
 if(firstPoint&&!guide.enabled){guide={...guide,enabled:true};$('showGuides').checked=true;saveGuide();}
 compose();
}
const centerEditor=new CenterEditor({preview:index=>{task='preview';post({type:'tracking-preview',index});},onAnchor:mark=>{
 if(mark.mode==='target'){task='select-center';setActions(false);post({type:'select-center',index:mark.index,x:mark.x,y:mark.y,sensitivity:Number($('sensitivity').value)});}
 else storeFrameMark(mark);
},onReset:index=>{objectTracks[activeObject].summary=null;anchors=anchors.filter(a=>a.index!==index);compose();},onSkip:index=>storeFrameMark({index,mode:'skip'}),onAuto:seedIndex=>{hideError();task='auto-detect';setActions(false);syncObjects();post({type:'auto-detect',objectId:activeObject,first:state.start,last:state.end,reference:state.reference,step:state.step,seedIndex,anchors,sensitivity:Number($('sensitivity').value)});},onCancel:()=>post({type:'cancel'})});
const calibrationEditor=new CalibrationEditor({onApply:value=>{calibration=value;guide={...guide,enabled:true};$('showGuides').checked=true;saveGuide();compose();},onClear:()=>{calibration=null;compose();}});
const guideEditor=new GuideEditor({onApply:settings=>{guide=settings;$('showGuides').checked=guide.enabled;saveGuide();compose();}});
const graphPanel=new GraphPanel({onDetect:id=>{if(centerData&&!task){if(Number.isInteger(id))selectObject(id);centerEditor.open();}}});
const post=message=>{worker.postMessage({...message,captureFps:state.captureFps||null,timeDecimals:preferences.timeDecimals,id:++requestId});};
const toast=message=>{$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,3500);};
const showError=message=>{$('errorBox').textContent=message;$('errorBox').hidden=false;if($('editor').hidden){$('supportNote').textContent=message;$('supportNote').hidden=false;}};
const hideError=()=>{$('errorBox').hidden=true;$('retryDecode').hidden=true;};
function suspendPreview(){const video=$('video');if(video.getAttribute('src')){video.pause();video.removeAttribute('src');video.load();previewDetached=true;}}
function restorePreview(){if(previewDetached&&videoUrl){previewDetached=false;$('video').src=videoUrl;}}
function diagnosticText(report){
 const seconds=p=>p?`${Number(p.mediaTime).toFixed(6)} s`:'なし';
 const lines=[`Motion Strobe ${appVersion}`,`ブラウザー: ${navigator.userAgent}`,`処理: ${report.operation}`];
 for(const d of report.attempts){
  lines.push('',`試行 ${d.attempt}: ${d.strategy} — ${d.status}`,`形式: ${d.codec} / ${d.width} × ${d.height}`,`指定: 開始 ${d.requested?.first??'—'}コマ / 終了 ${d.requested?.last??'—'}コマ${d.requested?.background?` / 背景 ${d.requested.background}コマ`:''}${d.requested?.frames?` / 抽出 ${d.requested.frames}枚`:''}`,`段階: ${d.phase}`,`入力範囲: 圧縮コマ ${d.packetStart??'—'}〜${d.packetEnd??'—'}`,
   `直前の投入: 圧縮コマ ${d.lastSubmitted?.packet??'—'} / 表示コマ ${d.lastSubmitted?.frame||'対象範囲外'} / 媒体時刻 ${seconds(d.lastSubmitted)}`,
   `最後の復元: 表示コマ ${d.lastOutput?.frame??'—'} / 媒体時刻 ${seconds(d.lastOutput)}`,`復元コマ数: ${d.outputCount??0}`);
  if(d.missingFrames?.length)lines.push(`未取得の表示コマ: ${d.missingFrames.join(', ')}`);
  if(d.error)lines.push(`エラー: ${d.errorName}: ${d.error}`);
 }
 lines.push('','媒体時刻は動画に記録されたPTSです。デコードは非同期なので、直前の投入コマが原因とは限りません。動画の内容・ファイル名は記録しません。');
 return lines.join('\n');
}
function showDiagnostics(report){
 if(!report)return;lastDiagnostics=report;
 const last=report.attempts.at(-1),success=last?.status==='成功';
 $('decodeReport').hidden=false;if(!success)$('decodeReport').open=true;$('decodeReportTitle').textContent=`処理の詳細 · ${success?(report.recovered?'再試行で成功':'成功'):'失敗・再試行の記録'}`;
 $('decodeReportText').textContent=diagnosticText(report);
}
$('copyDecodeReport').onclick=async()=>{if(!lastDiagnostics)return;const text=diagnosticText(lastDiagnostics);try{await navigator.clipboard.writeText(text);toast('処理の詳細をコピーしました。');}catch{const area=$('decodeReportText');const range=document.createRange();range.selectNodeContents(area);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);toast('詳細を選択しました。コピーしてください。');}};
$('retryDecode').onclick=()=>{if(task)return;if(lastFailedOperation==='extract')extraction();else if(lastFailedOperation==='export-video')createVideo();};
const busy=(name,kind)=>{lastFocus=document.activeElement;task=kind;$('progressTitle').textContent=name;$('progress').value=0;$('progressNumber').textContent='0%';$('progressOverlay').hidden=false;$('cancelProcessing').focus();};
const setProgress=(title,value)=>{$('progressTitle').textContent=title;if(value===null){$('progress').removeAttribute('value');$('progressNumber').textContent='';}else{$('progress').value=value;$('progressNumber').textContent=`${Math.round(value*100)}%`;}};
const finishBusy=()=>{if(task==='load')clearTimeout(loadStallTimer);$('progressOverlay').hidden=true;task=null;if(state.stage!=='result')restorePreview();lastFocus?.focus?.();};
const syncVideoSpeed=()=>{$('videoSpeedValue').textContent=`×${$('videoSpeed').value}`;$('videoSettings').hidden=activeView!=='video';const disabled=activeView!=='video'||!!task||!resultBlob;$('videoSpeed').disabled=disabled;$('shutterSound').disabled=disabled||state.canShutterSound===false;$('shutterSound').closest('.shutter-option').classList.toggle('is-disabled',disabled);$('photoRate').disabled=activeView!=='photo'||!!task;$('videoSpeed').closest('.video-speed-row').classList.toggle('is-disabled',disabled);};
const setActions=enabled=>{for(const id of ['saveImage','shareImage','viewVideo','editCenters','showCoordinates','showGraphs','guideSettings'])$(id).disabled=!enabled;for(const id of ['saveVideo','shareVideo'])$(id).disabled=!enabled||!exportBlob;syncVideoSpeed();syncObjects();};
const timeline=new Timeline($('timeline'),{getState:()=>({...state,indices:framePlan(state.start,state.end,state.reference,state.step,1,{...state,variable:state.variableTiming})}),onChange:setPoint,onActive:point=>{document.querySelectorAll('[data-point]').forEach(b=>{b.classList.toggle('active',b.dataset.point===point);b.setAttribute('aria-pressed',String(b.dataset.point===point));});if(state.stage!=='result')seekTo(state[point]);}});
const frameNudges=bindFrameNudges({buttons:document.querySelectorAll('[data-time-point]'),getState:()=>state,onChange:(point,value)=>{timeline.setActive(point);setPoint(point,value);}});
function clearExport(){if(state.stage==='result')showResultView('photo');exportBlob=null;exportSettings=null;if(exportUrl){$('exportPreview').pause();$('exportPreview').removeAttribute('src');$('exportPreview').load();URL.revokeObjectURL(exportUrl);exportUrl=null;}activeView='photo';$('saveVideo').disabled=true;$('shareVideo').disabled=true;}
function showResultView(view){activeView=view;$('photoSaveActions').hidden=view!=='photo';$('videoSaveActions').hidden=view!=='video';$('video').hidden=true;$('resultImage').hidden=view!=='photo';$('exportPreview').hidden=view!=='video';$('viewPhoto').classList.toggle('active',view==='photo');$('viewVideo').classList.toggle('active',view==='video');syncVideoSpeed();if(view==='photo')$('exportPreview').pause();}
function videoSettingsKey(){return JSON.stringify([state.start,state.end,state.reference,state.step,state.factor,Number($('sensitivity').value),$('resultLabels').checked,guide,(stashObject(),objectTracks.map(o=>o.anchors)),calibration,preferences.timeDecimals,Number($('videoSpeed').value),$('shutterSound').checked]);}
function createVideo(){if(!resultBlob||task)return;if(exportBlob&&exportSettings===videoSettingsKey()){showResultView('video');return;}hideError();suspendPreview();busy('動画を準備中','export-video');setActions(false);post({type:'export-video',first:state.start,last:state.end,reference:state.reference,step:state.step,factor:state.factor,sensitivity:Number($('sensitivity').value),labels:$('resultLabels').checked,playbackSpeed:Number($('videoSpeed').value),shutterSound:$('shutterSound').checked,...annotationSettings()});}
function invalidateResult(){clearExport();clearTimeout(debounce);requestId++;if(task==='quick-compose'){worker.postMessage({type:'cancel',id:-1});task=null;}resultBlob=null;setActions(false);document.querySelector('.steps [data-stage="result"]').disabled=true;}
function setPoint(point,value){invalidateResult();backgroundAuto=applyTimePoint(state,point,value,backgroundAuto,$('video'));extracted=false;updateFields();if(state.stage==='range')timeline.ensurePointsVisible();timeline.draw();}
function seekTo(index){restorePreview();$('video').pause();$('video').currentTime=frameTime(state,index,true);}
function updateFields(){state.step=Math.max(1,Math.min(samplingLimits(state).frames,state.step));for(const [id,key] of [['startTime','start'],['endTime','end'],['backgroundTime','background'],['referenceTime','reference']]){$(id).value=fmt(frameTime(state,state[key]));$(id).max=String(frameTime(state,state.count-1));}
 $('referenceTime').value=fmt(frameTime(state,state.reference));$('referenceTime').min=String(frameTime(state,state.start));$('referenceTime').max=String(frameTime(state,state.end));$('intervalSeconds').max=String(samplingLimits(state).seconds);$('intervalSeconds').min=String(state.period);$('intervalSeconds').value=fmt(state.step*state.period);$('samplingPanel').style.setProperty('--interval-width',`${Math.max(5.8,$('intervalSeconds').value.length+.8)}ch`);$('samplingRate').value=(1/(state.step*state.period)).toFixed(1);$('frameStep').max=samplingLimits(state).frames;$('frameStep').value=state.step;$('actualInterval').textContent=`${state.step}コマごと`;$('fpsBadge').textContent=`動画のフレームレート: ${Number(state.fps.toFixed(3))} fps`;
 $('actualInterval').textContent+=state.variableTiming?' · 実際の時刻を使用':'';
 const indices=framePlan(state.start,state.end,state.reference,state.step,1,{...state,variable:state.variableTiming});$('frameCount').value=String(indices.length);$('frameCount').classList.toggle('over-limit',indices.length>240);$('generate').disabled=indices.length>240||indices.length<1;$('frameSummary').hidden=indices.length<=240;$('frameSummary').textContent=indices.length>240?'最大240枚です。時間間隔を広げてください。':'';frameNudges.update();}
function stage(next){const previous=state.stage;if(next!=='result'&&task==='quick-compose')invalidateResult();state.stage=next;if(next!=='result')restorePreview();$('editor').dataset.editorStage=next;if(next!=='result')$(next==='range'?'rangeTimeline':'samplingTimeline').append($('timelineArea'));$('exportPreview').pause();$('exportPreview').hidden=true;$('resultViewTabs').hidden=next!=='result';$('video').hidden=next==='result';$('resultImage').hidden=next!=='result';$('timelineArea').hidden=next==='result';for(const s of ['range','sampling','result']){$(`${s}Panel`).hidden=s!==next;const button=document.querySelector(`.steps [data-stage="${s}"]`);button.classList.toggle('active',s===next);if(s===next)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');}
 document.querySelector('.steps [data-stage="result"]').disabled=!resultBlob;
 for(const button of document.querySelectorAll('[data-point]'))button.hidden=next==='sampling';$('timelineArea').classList.toggle('sampling-timeline',next==='sampling');timeline.setActive(next==='sampling'?'reference':'start');if(next==='sampling'&&previous!=='sampling')timeline.fitSelection();else if(next==='range')timeline.ensurePointsVisible();if(next==='result')showResultView(activeView);updateFields();requestAnimationFrame(()=>timeline.draw());}
async function load(file,isSample=null,fromSample=false){if(!file)return;if(file.size>400*1024*1024){showError('動画が大きすぎます。400 MB以下の動画か、短く切り取った動画を選んでください。');return;}hideError();if(fromSample){task='load';setProgress('サンプルの動画情報を確認中',.7);}else busy('動画を読み込み中','load');sampleProgress=fromSample;sampleSelection=isSample;try{const blob=safeVideoBlob(file);await probeVideoBlob(blob);if(task!=='load')return;if(fromSample)setProgress('サンプルの動画情報を読み込み中',.75);sourceFile=blob;post({type:'load',file:blob});armLoadStall();}catch{finishBusy();showError('動画ファイルを読み出せませんでした。もう一度選び直すか、写真アプリから端末内に保存してお試しください。');}}
function setStep(frames){invalidateResult();state.step=Math.max(1,Math.min(samplingLimits(state).frames,Math.round(frames)));state.factor=1;extracted=false;updateFields();timeline.draw();}
function extraction(){hideError();suspendPreview();busy('画像を抽出中','extract');state.factor=1;centerData=null;resultData=null;$('sensitivity').value=30;$('sensitivityValue').textContent='30';post({type:'extract',first:state.start,last:state.end,reference:state.reference,step:state.step,background:state.background,maxDimension:preferences.resolution});}
function compose(showModal=false){centerEditor.setBusy(true);clearExport();clearTimeout(debounce);setActions(false);if(showModal)busy('写真を合成中','compose');else{$('resultCount').textContent='更新中…';task='quick-compose';}hideError();post({type:'compose',first:state.start,last:state.end,reference:state.reference,step:state.step,factor:state.factor,sensitivity:Number($('sensitivity').value),labels:$('resultLabels').checked,...annotationSettings()});}
async function handleWorkerMessage({data:m}){
 if(m.id!==requestId)return;
 if(m.type==='diagnostic'){showDiagnostics(m.diagnostics);return;}
 if(m.type==='progress'){if(task==='load')armLoadStall();if(task==='auto-detect')centerEditor.progress(m);else if(task!=='quick-compose'){setProgress(m.stage,task==='load'&&sampleProgress ? .75+m.value*.25 : m.value);}}
 if(m.type==='loaded'){
  clearExport();lastDiagnostics=null;$('decodeReport').hidden=true;previewDetached=false;anchors=[];centerData=null;seedIndex=null;calibration=null;activeObject=0;objectTracks=[{id:0,anchors,seedIndex:null,summary:null},{id:1,anchors:[],seedIndex:null,summary:null}];resultData=null;$('resultLabels').checked=false;$('photoRate').checked=false;$('shutterSound').checked=false;$('referenceDetails').open=false;const x=m.metadata;sourceClock={...x,variable:x.variableTiming};state={stage:'range',...x,start:0,end:x.count-1,background:0,reference:0,step:Math.max(1,Math.round(preferences.interval/x.period)),factor:1};if(sampleSelection){state.start=Math.min(x.count-2,indexAtTime(state,sampleSelection.start));state.end=Math.min(x.count-1,Math.max(state.start+1,indexAtTime(state,sampleSelection.end)));state.background=Math.min(state.start,indexAtTime(state,sampleSelection.background));state.reference=state.start;backgroundAuto=false;}else backgroundAuto=true;extracted=false;resultBlob=null;setActions(false);if(videoUrl)URL.revokeObjectURL(videoUrl);videoUrl=URL.createObjectURL(sourceFile);$('video').onloadedmetadata=()=>seekTo(state.start);$('video').src=videoUrl;$('home').hidden=true;$('editor').hidden=false;document.body.classList.add('is-editing');finishBusy();stage('range');timeline.reset();$('goSampling').focus();
 }else if(m.type==='extracted'){extracted=true;compose(true);
 }else if(m.type==='composed'){
  resultData={centers:m.centers,objects:m.objects||[{id:0,centers:m.centers},{id:1,centers:m.centers.map(p=>({index:p.index,time:p.time,confidence:'unset'}))}],indices:m.indices,size:m.size,period:state.period,first:state.start,timeSource:state.captureFps?'capture-fps':'recorded-pts',captureFps:state.captureFps,hasRateEdits:state.hasRateEdits,calibration,originCenter:m.originCenter};refreshObject();$('editCenters').textContent='位置を検出';if(resultUrl)URL.revokeObjectURL(resultUrl);resultBlob=m.blob;resultUrl=URL.createObjectURL(m.blob);$('resultImage').src=resultUrl;$('resultCount').textContent=`${m.count}枚`;stage('result');finishBusy();setActions(true);if($('coordinatesDialog').open)renderCoordinates();if($('graphsDialog').open)graphPanel.update(analysisData());

 }else if(m.type==='guide-preview'){
  task=null;if($('calibrationDialog').open)calibrationEditor.accept(m);else guideEditor.accept(m);setActions(!!resultBlob);
 }else if(m.type==='auto-detected'){
  const object=objectTracks[m.objectId??activeObject],indices=new Set(m.marks.map(a=>a.index));object.anchors=[...object.anchors.filter(a=>!indices.has(a.index)),...m.marks].sort((a,b)=>a.index-b.index);object.summary=detectionSummary(m.marks);if(object.id===activeObject)anchors=object.anchors;compose();

 }else if(m.type==='center-selected'){storeFrameMark(m.mark);
 }else if(m.type==='tracking-preview'){task=null;centerEditor.accept(m);
 }else if(m.type==='video-exported'){
  exportBlob=m.blob;exportSettings=videoSettingsKey();if(exportUrl)URL.revokeObjectURL(exportUrl);exportUrl=URL.createObjectURL(m.blob);$('exportPreview').src=exportUrl;finishBusy();setActions(true);showResultView('video');toast('合成動画を作成しました。再生して確認できます。');
 }else if(m.type==='error'){const failedTask=task;centerEditor.setBusy(false);if(task==='load'){$('home').hidden=false;$('editor').hidden=true;document.body.classList.remove('is-editing');$('video').pause();}finishBusy();setActions(!['compose','quick-compose'].includes(failedTask)&&!!resultBlob);if($('centerDialog').open){$('centerStatus').textContent=m.message;}if($('guideDialog').open)guideEditor.error(m.message);if($('calibrationDialog').open)calibrationEditor.error(m.message);if(state.stage==='result'&&!resultBlob)$('resultCount').textContent='更新失敗';showError(m.message);showDiagnostics(m.diagnostics);lastFailedOperation=failedTask;$('retryDecode').hidden=!['extract','export-video'].includes(failedTask);
 }else if(m.type==='cancelled'){centerEditor.setBusy(false);finishBusy();setActions(!!resultBlob);toast('処理をキャンセルしました。');}
}
function handleWorkerError(){centerEditor.setBusy(false);finishBusy();setActions(!!resultBlob);const message='処理を開始できませんでした。動画を選び直してお試しください。';$('centerStatus').textContent=message;showError(message);resetWorker();}
function bindWorker(){worker.onmessage=handleWorkerMessage;worker.onerror=handleWorkerError;worker.onmessageerror=handleWorkerError;}
function resetWorker(){try{worker.terminate();}catch{}worker=new Worker(workerUrl,{type:'module'});bindWorker();}
function armLoadStall(){clearTimeout(loadStallTimer);loadStallTimer=setTimeout(()=>{if(task!=='load')return;resetWorker();finishBusy();$('home').hidden=false;$('editor').hidden=true;document.body.classList.remove('is-editing');showError('動画の読み込みが停止しました。もう一度選び直してください。iPadでは写真・ファイル選択後の一時ファイルを安全なBlobに変換して再試行できます。');},20000);}
bindWorker();
$('chooseVideo').onclick=()=>$('fileInput').click();$('captureVideo').onclick=()=>$('cameraInput').click();for(const id of ['fileInput','cameraInput'])$(id).onchange=e=>{load(e.target.files[0]);e.target.value='';};
installSamples({onChoose:async sample=>{try{busy('サンプルを読み込み中','demo');demoAbort=new AbortController();const blob=await downloadSample(sample.video,{signal:demoAbort.signal,expectedSize:sample.bytes,onProgress:p=>{if(task==='demo')setProgress('サンプルを読み込み中',p.value===null?null:p.value*.7);}});if(task!=='demo'||demoAbort.signal.aborted)return;await load(new File([blob],`${sample.title}.mp4`,{type:'video/mp4'}),sample.range,true);}catch(e){finishBusy();if(e.name!=='AbortError')showError('サンプルを読み込めませんでした。');}}});

$('cancelProcessing').onclick=()=>{if(task==='demo'){demoAbort?.abort();finishBusy();toast('処理をキャンセルしました。');}else post({type:'cancel'});};
$('goSampling').onclick=()=>{state.reference=Math.max(state.start,Math.min(state.end,state.reference));stage('sampling');seekTo(state.reference);};$('backRange').onclick=()=>stage('range');document.querySelector('.steps [data-stage="range"]').onclick=()=>stage('range');document.querySelector('.steps [data-stage="sampling"]').onclick=()=>stage('sampling');document.querySelector('.steps [data-stage="result"]').onclick=()=>{if(resultBlob)stage('result');};
for(const [id,key] of [['startTime','start'],['endTime','end'],['backgroundTime','background'],['referenceTime','reference']])$(id).onchange=()=>{const v=Number($(id).value);if(Number.isFinite(v)){timeline.setActive(key);setPoint(key,indexAtTime(state,v));}};
$('intervalSeconds').onchange=()=>{const value=Number($('intervalSeconds').value);if(Number.isFinite(value)&&value>0){setStep(value/state.period);const actual=state.step*state.period;if(Math.abs(actual-value)>1e-6)toast(`${state.step}コマ分の${fmt(actual)}秒に合わせました。`);}else updateFields();};$('frameStep').oninput=()=>setStep(Number($('frameStep').value));$('minusFrame').onclick=()=>setStep(state.step-1);$('plusFrame').onclick=()=>setStep(state.step+1);$('generate').onclick=extraction;
for(const button of document.querySelectorAll('[data-point]'))button.onclick=()=>timeline.setActive(button.dataset.point);$('zoomIn').onclick=()=>timeline.zoom(.5);$('zoomOut').onclick=()=>timeline.zoom(2);$('zoomReset').onclick=()=>timeline.reset();
$('sensitivity').oninput=()=>{centerEditor.setBusy(true);clearExport();showResultView('photo');requestId++;$('sensitivityValue').textContent=$('sensitivity').value;setActions(false);clearTimeout(debounce);debounce=setTimeout(()=>compose(),140);};$('resultLabels').onchange=()=>compose();$('photoRate').onchange=()=>compose();
bindFrameInput($('referenceTime'),{point:'reference',getState:()=>state,onChange:(point,value)=>{timeline.setActive(point);setPoint(point,value);}});
$('referenceDetails').ontoggle=()=>{if(state.stage==='sampling')requestAnimationFrame(()=>timeline.draw());};
$('editCenters').onclick=()=>{if(centerData&&!task)centerEditor.open();};
function renderCoordinates(){
 if(!resultData)return;const data=analysisData();$('coordinateFeedback').textContent='';const body=$('coordinateBody'),head=$('coordinateHeader');body.replaceChildren();head.replaceChildren();
 const {header,rows}=coordinateTable(data);for(const value of header){const cell=document.createElement('th');cell.scope='col';cell.textContent=value;head.append(cell);}
 for(const values of rows){const row=document.createElement('tr');for(const value of values){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}body.append(row);}
 const basis=calibrationBasis(calibration,data.size),origin=coordinateOrigin(data);
 $('coordinateNote').textContent=origin?`原点は物体1の最初の抽出コマの中心。2物体で共通です。pxは画像の横・縦方向、右・上が正。${basis?'mは校正した軸に沿った座標。':''}時刻は時間範囲の開始から。`:'物体1の最初の抽出コマで位置を指定すると、共通の原点と座標が表示されます。';
 $('coordinateTiming').hidden=false;$('coordinateTiming').textContent=state.captureFps?`時刻は撮影fps（${state.captureFps} fps）で補正。`:'時刻は各コマに記録された時刻から計算。スロー再生の時間とは分けています。';
}

function showCoordinates(){if(!centerData||task)return;renderCoordinates();$('coordinatesDialog').showModal();}
$('calibrateCoordinates').onclick=()=>{if(!centerData||task||!resultBlob)return;calibrationEditor.open({calibration,data:centerData});task='guide-preview';post({type:'guide-preview'});};
$('showCoordinates').onclick=showCoordinates;$('centerCoordinates').onclick=showCoordinates;
$('showGraphs').onclick=()=>{if(centerData&&!task){centerData.calibration=calibration;graphPanel.open(analysisData());}};
$('copyCoordinates').onclick=async()=>{try{
 const text=coordinateText(analysisData());
 if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(text);
 else {const field=document.createElement('textarea');field.value=text;field.setAttribute('aria-label','コピーする座標');$('coordinatesDialog').append(field);field.select();const copied=document.execCommand('copy');field.remove();if(!copied)throw Error();}
 $('coordinateFeedback').textContent='コピーしました。表計算ソフトに貼り付けられます。';
 }catch{$('coordinateFeedback').textContent='コピーできませんでした。CSVを保存してください。';}};
$('saveCoordinates').onclick=()=>{if(!centerData)return;const blob=new Blob(['\uFEFF',coordinateText(analysisData(),',')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='Motion-Strobe-coordinates.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('coordinateFeedback').textContent='座標データをCSVで保存します。';};

function saveGuide(){preferences.grid=guide;try{localStorage.setItem('motion-strobe-preferences',JSON.stringify(preferences));}catch{}}
$('showGuides').onchange=()=>{guide={...guide,enabled:$('showGuides').checked};saveGuide();compose();};
$('guideSettings').onclick=()=>{if(!centerData||task||!resultBlob)return;guideEditor.open({guide,centers:allObjectCenters(analysisData()),labels:$('resultLabels').checked,calibration:calibration?{...calibration,origin:coordinateOrigin(centerData)?{...coordinateOrigin(centerData),width:centerData.size.width,height:centerData.size.height}:null}:null});task='guide-preview';setActions(false);post({type:'guide-preview'});};
$('saveImage').onclick=()=>{if(!resultBlob)return;const a=document.createElement('a');a.href=resultUrl;a.download='Motion-Strobe.png';a.click();toast('写真を保存します。');};
$('viewPhoto').onclick=()=>showResultView('photo');$('viewVideo').onclick=createVideo;
$('shutterSound').onchange=()=>{if(activeView==='video'&&resultBlob&&!task){clearExport();createVideo();}};
$('videoSpeed').onchange=()=>{$('videoSpeedValue').textContent=`×${$('videoSpeed').value}`;if(activeView==='video'&&resultBlob&&!task){clearExport();createVideo();}else if(exportBlob&&exportSettings!==videoSettingsKey())clearExport();};
$('saveVideo').onclick=()=>{if(!exportBlob)return;const a=document.createElement('a');a.href=exportUrl;a.download='Motion-Strobe.mp4';a.click();toast('動画を保存します。');};
$('shareVideo').onclick=async()=>{if(!exportBlob)return;const file=new File([exportBlob],'Motion-Strobe.mp4',{type:'video/mp4'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Motion Strobe'});}catch(e){if(e.name!=='AbortError')toast('共有できませんでした。「動画を保存」をお使いください。');}}else{$('saveVideo').click();toast('動画を保存して共有してください。');}};
$('shareImage').onclick=async()=>{if(!resultBlob)return;const file=new File([resultBlob],'Motion-Strobe.png',{type:'image/png'});if(navigator.canShare?.({files:[file]})){try{await navigator.share({files:[file],title:'Motion Strobe'});}catch(e){if(e.name!=='AbortError')toast('共有できませんでした。「写真を保存」をお使いください。');}}else{$('saveImage').click();toast('写真を保存して共有してください。');}};
function openDialog(id){$(id).showModal();}installContextHelp();$('settingsButton').onclick=()=>{$('defaultInterval').value=String(preferences.interval);$('resolution').value=preferences.resolution;$('timeDecimals').value=String(preferences.timeDecimals);$('openingAnimation').checked=preferences.openingAnimation;openDialog('settingsDialog');};document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());$('saveSettings').onclick=()=>{const value=Number($('defaultInterval').value);if(!Number.isFinite(value)||value<=0||value>2){toast('0より大きく、2秒以下の間隔を入力してください。');return;}const precisionChanged=preferences.timeDecimals!==Number($('timeDecimals').value);const animationChanged=preferences.openingAnimation!==$('openingAnimation').checked;preferences={...preferences,interval:value,resolution:Number($('resolution').value),timeDecimals:setTimeDecimals(Number($('timeDecimals').value)),openingAnimation:$('openingAnimation').checked};document.documentElement.dataset.homeAnimation=preferences.openingAnimation?'on':'off';try{localStorage.setItem('motion-strobe-preferences',JSON.stringify(preferences));}catch{}$('settingsDialog').close();if(animationChanged&&!$('home').hidden)$('home').dispatchEvent(new Event('motion-strobe:home'));if(precisionChanged){updateFields();timeline.draw();centerEditor.update();if($('coordinatesDialog').open)renderCoordinates();if(resultBlob)compose();}toast('設定を保存しました。');};
function requestHome(){if(task||$('returnHomeDialog').open)return;$('returnHomeDialog').showModal();}
$('homeStep').onclick=requestHome;
$('cancelReturnHome').onclick=()=>$('returnHomeDialog').close();
$('confirmReturnHome').onclick=()=>{if(task)return;$('returnHomeDialog').close();clearTimeout(debounce);$('editor').hidden=true;$('home').hidden=false;document.body.classList.remove('is-editing');$('video').pause();$('exportPreview').pause();hideError();$('home').dispatchEvent(new Event('motion-strobe:home'));$('chooseVideo').focus({preventScroll:true});};
document.querySelector('.brand').onclick=e=>{e.preventDefault();if(task)return;if(!$('editor').hidden)requestHome();else $('home').dispatchEvent(new Event('motion-strobe:home'));};
if(!('VideoDecoder' in window)||!('OffscreenCanvas' in window)){$('supportNote').textContent='このブラウザーはコマ抽出に未対応です。Chrome、Edge、Safariを最新にしてお試しください。';$('supportNote').hidden=false;}


// Progressive agent access; uses the same visible settings and never receives local files.
if(document.modelContext?.registerTool){
 const lifecycle=new AbortController();
 const tool={name:'read_strobe_settings',title:'ストロボ設定を確認',description:'Read the currently selected range, frame interval and result settings. Does not access or upload video data.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:false},execute:()=>({videoLoaded:!!sourceFile,stage:state.stage,frames:state.count,fps:state.fps,startSeconds:frameTime(state,state.start),endSeconds:frameTime(state,state.end),backgroundSeconds:frameTime(state,state.background),referenceSeconds:frameTime(state,state.reference),intervalFrames:state.step,intervalSeconds:state.step*state.period,timeSource:state.captureFps?'capture-fps':'recorded-pts',captureFps:state.captureFps||null,thinningFactor:state.factor,sensitivity:Number($('sensitivity').value),processing:!!task})};
 try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
 window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
}

$('fpsBadge').onclick=()=>{
 if(!sourceClock||task)return;
 $('recordedClockInfo').textContent=`ファイルのコマ間隔から ${Number(sourceClock.fps.toFixed(3))} fps${state.hasRateEdits?' · スロー再生の編集情報あり':''}。解析はコマごとの記録時刻、映像表示は再生時刻を使います。`;
 $('clockMode').value=state.captureFps?'capture':'recorded';$('captureFps').value=state.captureFps?String(state.captureFps):'';
 $('captureFpsField').hidden=!state.captureFps;$('clockError').hidden=true;$('clockDialog').showModal();
};
$('clockMode').onchange=()=>{$('captureFpsField').hidden=$('clockMode').value!=='capture';};
$('applyClock').onclick=()=>{
 const fps=$('clockMode').value==='capture'?Number($('captureFps').value):null;
 if(fps!==null&&(!Number.isFinite(fps)||fps<1||fps>2000)){$('clockError').textContent='撮影fpsを1〜2000で入力してください。';$('clockError').hidden=false;return;}
 const requestedInterval=state.step*state.period,clock=analysisClock(sourceClock,fps);
 invalidateResult();Object.assign(state,{times:clock.times,period:clock.period,fps:clock.fps,captureFps:fps,variableTiming:clock.variable});
 state.step=Math.max(1,Math.round(requestedInterval/state.period));state.factor=1;extracted=false;centerData=null;
 $('clockDialog').close();updateFields();timeline.draw();seekTo(state.reference);
};

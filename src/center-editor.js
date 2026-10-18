import {formatSeconds} from './format.js';
import {ImageViewport} from './image-viewport.js';
import {reviewFramePositions,nextReviewPosition} from './detection-summary.js';
export class CenterEditor{
 constructor({preview,onAnchor,onReset,onSkip,onAuto,onCancel,onTrackingMode=()=>{},onReviewObject=()=>{}}){
  this.dialog=document.getElementById('centerDialog');this.canvas=document.getElementById('centerCanvas');this.preview=preview;this.onAnchor=onAnchor;this.mode='target';this.centers=[];this.indices=[];this.index=null;this.image=null;this.url=null;this.pending=false;
  const $=id=>document.getElementById(id);
  this.$=$;this.trackingMode='center';
  this.resultDialog=$('autoDetectionDialog');this.detectionResults=[];
  $('centerNextMissing').onclick=()=>this.jumpToMissing();
  $('closeDetectionResult').onclick=()=>this.resultDialog.close();
  $('reviewMissingFrames').onclick=()=>{
   const unresolved=result=>result.summary.missing+result.summary.uncertain>0;
   const result=this.detectionResults.find(result=>result.objectId===this.objectId&&unresolved(result))||this.detectionResults.find(unresolved);
   if(!result)return;this.resultDialog.close();onReviewObject(result.objectId);this.jumpToMissing(true);
  };
  $('centerTrackingMode').onchange=()=>{if(this.pending)return;this.trackingMode=$('centerTrackingMode').value==='point'?'point':'center';this.mode=this.trackingMode==='point'?'center':'target';onTrackingMode(this.trackingMode);this.update();};this.onCancel=onCancel;this.automatic=false;this.viewport=new ImageViewport();this.pointers=new Map();this.panMode=false;this.panPointer=null;
  $('autoDetect').onclick=()=>{const seed=this.seed();if(!this.pending&&(seed||this.trackingMode!=='point')){this.automatic=true;this.progress({stage:'自動検出を準備中',value:0});this.setBusy(true);onAuto(seed?.index??null);}};
  $('cancelDetection').onclick=()=>onCancel?.();
  this.dialog.addEventListener('cancel',e=>{if(this.automatic){e.preventDefault();onCancel?.();}});
  for(const button of this.dialog.querySelectorAll('[data-center-mode]'))button.onclick=()=>{this.mode=button.dataset.centerMode;this.update();};
  $('centerFrame').oninput=()=>this.select(Number($('centerFrame').value));$('centerPrevious').onclick=()=>this.select(this.position-1);$('centerNext').onclick=()=>this.select(this.position+1);
  $('resetCenters').onclick=()=>{if(!this.pending&&Number.isInteger(this.index)){if(this.mode==='none')this.mode='target';this.setBusy(true);onReset(this.index);}};
  $('skipCenter').onclick=()=>{if(!this.pending&&Number.isInteger(this.index)){this.mode='none';this.setBusy(true);onSkip(this.index);}};
  this.canvas.onwheel=e=>{if(this.pending||!this.image)return;e.preventDefault();const p=this.displayPoint(e);this.zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.005),p);};
  this.canvas.onpointerdown=e=>{
   if(this.pending||!this.image||e.button>0)return;this.canvas.focus?.({preventScroll:true});this.canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,this.displayPoint(e));
   if(this.pointers.size>1){this.gestureBlocked=true;this.drag=null;this.pinch=this.pinchState();this.draw();return;}
   this.gestureBlocked=false;this.panLast=this.displayPoint(e);if(this.panMode){this.panPointer=e.pointerId;this.drag=null;}else if(this.mode!=='none')this.drag=this.point(e);this.draw();
  };
  this.canvas.onpointermove=e=>{
   if(!this.pointers.has(e.pointerId)||this.pending)return;this.pointers.set(e.pointerId,this.displayPoint(e));
   if(this.pointers.size>1){const now=this.pinchState();if(this.pinch)this.viewport.gesture(this.pinch,now);this.pinch=now;this.draw();this.updateZoom();}
   else if(this.panPointer===e.pointerId&&!this.gestureBlocked){const now=this.displayPoint(e);this.viewport.pan(now.x-this.panLast.x,now.y-this.panLast.y);this.panLast=now;this.draw();}
   else if(this.drag&&!this.gestureBlocked&&this.mode==='center'){this.drag=this.point(e);this.draw();}
  };
  this.canvas.onpointerup=e=>{
   if(!this.pointers.has(e.pointerId))return;const panning=this.panPointer===e.pointerId;this.pointers.delete(e.pointerId);this.pinch=null;if(panning)this.panPointer=null;this.updateZoom();
   if(this.gestureBlocked||panning||!this.drag){this.drag=null;if(!this.pointers.size)this.gestureBlocked=false;this.draw();return;}
   const p=this.point(e);this.drag=null;this.setBusy(true);this.onAnchor({index:this.index,...p,mode:this.trackingMode==='point'&&this.mode==='target'?'center':this.mode,source:'manual',spaceWidth:this.canvas.width,spaceHeight:this.canvas.height});
  };
  this.canvas.onpointercancel=e=>{this.pointers.delete(e.pointerId);if(this.panPointer===e.pointerId)this.panPointer=null;this.gestureBlocked=this.pointers.size>0;this.pinch=null;this.drag=null;this.updateZoom();this.draw();};
  this.canvas.onkeydown=e=>{
   if(e.code==='Space'||e.key===' '){if(this.pending)return;e.preventDefault();this.panMode=true;this.drag=null;if(this.pointers.size===1){const [id,point]=this.pointers.entries().next().value;this.panPointer=id;this.panLast=point;}this.updateZoom();return;}
   if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||this.pending||this.mode!=='center')return;e.preventDefault();const center=this.centers.find(p=>p.index===this.index);if(!center||!Number.isFinite(center.x))return;const d=e.shiftKey?5:1;this.setBusy(true);this.onAnchor({index:this.index,x:Math.max(0,Math.min(this.canvas.width-1,center.x+(e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0))),y:Math.max(0,Math.min(this.canvas.height-1,center.y+(e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0))),mode:'center',source:'manual',spaceWidth:this.canvas.width,spaceHeight:this.canvas.height});
  };
  this.canvas.onkeyup=e=>{if(e.code==='Space'||e.key===' '){e.preventDefault();this.panMode=false;this.updateZoom();}};
  this.canvas.onblur=()=>this.releaseGesture();globalThis.addEventListener?.('blur',()=>this.releaseGesture());
  this.dialog.addEventListener('close',()=>{this.releaseGesture();if(this.automatic)onCancel?.();});
 }
 displayPoint(e){const r=this.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*this.canvas.width/r.width,y:(e.clientY-r.top)*this.canvas.height/r.height};}
 point(e){const p=this.displayPoint(e),source=this.viewport.point(p.x,p.y);return {x:Math.max(0,Math.min(this.canvas.width-1,source.x)),y:Math.max(0,Math.min(this.canvas.height-1,source.y))};}
 pinchState(){const [a,b]=[...this.pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};}
 zoom(factor,point){if(this.pending||!this.image)return;this.viewport.zoom(factor,point?.x,point?.y);this.draw();this.updateZoom();}
 updateZoom(){this.canvas.setAttribute('data-pan',String(this.panMode||this.panPointer!==null));}
 releaseGesture(){this.panMode=false;this.panPointer=null;this.drag=null;this.pointers.clear();this.pinch=null;this.gestureBlocked=false;this.updateZoom();this.draw();}
 seed(){const valid=a=>(this.autoEnabled||this.indices.includes(a.index))&&a.mode==='center'&&a.source!=='auto'&&[a.x,a.y].every(Number.isFinite);return (this.anchors||[]).find(a=>a.index===this.seedIndex&&valid(a))||(this.anchors||[]).find(valid);}
 progress({stage,value}){this.$('detectionProgress').hidden=false;this.$('detectionTitle').textContent=`${stage} · ${Math.round(value*100)}%`;this.$('detectionBar').value=value;}
 setData({centers,indices,size,period,first,anchors,seedIndex,objectId=0,otherCenters=[],trackingMode='center',autoEnabled=false}){this.autoEnabled=autoEnabled;this.trackingMode=trackingMode;this.$('centerTrackingMode').value=trackingMode;if(this.objectId!==undefined&&this.objectId!==objectId)this.mode='target';this.objectId=objectId;this.otherCenters=otherCenters;this.seedIndex=seedIndex;this.centers=centers;this.indices=indices;if(this.viewport.width!==size.width||this.viewport.height!==size.height)this.viewport.reset(size.width,size.height);this.size=size;this.period=period;this.first=first;this.anchors=anchors;this.setBusy(false);this.update();this.draw();}
 open(position){if(!this.indices.length)return;this.dialog.showModal();this.viewport.reset(this.size.width,this.size.height);this.releaseGesture();const wanted=this.indices.findIndex(n=>n===this.index);this.select(Number.isInteger(position)?position:wanted<0?0:wanted);}
 jumpToMissing(fromStart=false){
  if(this.pending)return false;
  const position=nextReviewPosition(this.indices,this.centers,fromStart?-1:this.position??-1);
  if(position===null)return false;
  if(this.dialog.open)this.select(position);else this.open(position);
  this.canvas.focus?.({preventScroll:true});return true;
 }
 showDetectionResults(results){
  this.detectionResults=results;
  for(const id of [0,1]){
   const result=results.find(result=>result.objectId===id);this.$(`autoResultObject${id}`).hidden=!result;
   if(!result)continue;const {summary}=result;
   this.$(`autoResultCount${id}`).textContent=`${summary.successful}/${summary.total} コマ成功`;
   this.$(`autoResultDetails${id}`).textContent=`未検出 ${summary.missing} · 要確認 ${summary.uncertain} · なし ${summary.skipped}`;
  }
  const missing=results.some(result=>result.summary.missing+result.summary.uncertain>0);
  this.$('reviewMissingFrames').disabled=!missing;
  if(!this.resultDialog.open)this.resultDialog.showModal();
  this.$(missing?'reviewMissingFrames':'closeDetectionResult').focus?.();
 }
 select(position){if(this.pending||!this.indices.length)return;this.position=Math.max(0,Math.min(this.indices.length-1,position));this.index=this.indices[this.position];const current=this.centers.find(p=>p.index===this.index);if(current?.confidence==='skipped')this.mode='none';else if(this.mode==='none')this.mode='target';this.setBusy(true);this.preview(this.index);this.update();}
 accept({blob,index,size}){if(index!==this.index)return;const image=new Image(),url=URL.createObjectURL(blob);image.onload=()=>{if(index!==this.index){URL.revokeObjectURL(url);return;}if(this.url)URL.revokeObjectURL(this.url);this.url=url;this.image=image;this.canvas.width=size.width;this.canvas.height=size.height;this.setBusy(false);this.draw();};image.onerror=()=>{URL.revokeObjectURL(url);this.setBusy(false);this.$('centerStatus').textContent='画像を表示できませんでした。';};image.src=url;}
 setBusy(pending){this.pending=pending;if(pending)this.releaseGesture();if(!pending){this.automatic=false;this.$('detectionProgress').hidden=true;}for(const id of ['centerFrame','centerPrevious','centerNext','resetCenters','skipCenter'])this.$(id).disabled=pending;this.canvas.setAttribute('aria-busy',String(pending));this.update();this.updateZoom();}
 update(){
  if(this.trackingMode==='point'&&this.mode==='target')this.mode='center';
  const $=this.$;for(const b of this.dialog.querySelectorAll('[data-center-mode]')){b.hidden=this.trackingMode==='point'&&b.dataset.centerMode==='target';b.disabled=this.pending;b.classList.toggle('active',b.dataset.centerMode===this.mode);b.setAttribute('aria-pressed',String(b.dataset.centerMode===this.mode));}
  $('autoDetect').disabled=this.pending||!this.indices.length||this.trackingMode==='point'&&!this.seed();$('autoDetect').textContent=this.automatic?'自動検出中…':'全コマを自動検出';
  $('centerTrackingMode').disabled=this.pending;
  $('centerNextMissing').disabled=this.pending||!reviewFramePositions(this.indices,this.centers).length;
  $('centerInstruction').textContent=this.mode==='none'?'このコマは検出しません。':this.trackingMode==='point'?'追いかける印や点をクリック／タップして指定します。':this.mode==='target'?this.seed()?'画像の物体をクリック／タップしてください。近くの中心を検出します。':'「全コマを自動検出」で動く物体を探せます。タップすると追いかける物体のヒントになります。':'画像をクリック／タップ、またはドラッグして位置を手動で決めます。';
  $('centerFrame').max=Math.max(0,this.indices.length-1);$('centerFrame').value=this.position||0;
  const center=this.centers.find(p=>p.index===this.index);
  $('centerTime').textContent=`${Number.isInteger(this.index)?formatSeconds(center?.time??(this.index-this.first)*this.period):'—'} s`;
  const status=!center||center.confidence==='unset'?'未指定':center.confidence==='skipped'?'検出なし':center.confidence==='missing'?'未検出':center.confidence==='uncertain'?'要確認':center.confidence==='auto'?'自動検出':center.source==='object'?'物体の中心':center.source==='tap'?'タップした位置':'位置を調整済み';
  $('centerStatus').textContent=this.pending?'更新中…':`${(this.position||0)+1}/${this.indices.length} · ${status}`;
  $('skipCenter').setAttribute('aria-pressed',String(this.mode==='none'));
  $('resetCenters').disabled=this.pending||!center||center.confidence==='unset';
  $('centerPrevious').disabled=this.pending||this.position===0;$('centerNext').disabled=this.pending||this.position===this.indices.length-1;
 }
 draw(){if(!this.image)return;const ctx=this.canvas.getContext('2d'),v=this.viewport;ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.save();ctx.translate(this.canvas.width/2,this.canvas.height/2);ctx.scale(v.scale,v.scale);ctx.translate(-v.x,-v.y);ctx.drawImage(this.image,0,0,this.canvas.width,this.canvas.height);const center=this.drag||this.centers.find(p=>p.index===this.index);if(center&&Number.isFinite(center.x)){
  ctx.strokeStyle=center.confidence==='uncertain'?'#ef9e35':this.objectId===1?'#ffad45':'#52f0c9';ctx.lineWidth=Math.max(1.5,this.canvas.width/500)/v.scale;ctx.setLineDash(center.confidence==='uncertain'?[6/v.scale,4/v.scale]:[]);
  if(center.contours?.length&&this.trackingMode!=='point'){
   ctx.beginPath();for(const loop of center.contours){ctx.moveTo(loop[0],loop[1]);for(let i=2;i<loop.length;i+=2)ctx.lineTo(loop[i],loop[i+1]);ctx.closePath();}
   ctx.fillStyle=ctx.strokeStyle;ctx.globalAlpha=.12;ctx.fill('evenodd');ctx.globalAlpha=1;const color=ctx.strokeStyle,lineWidth=ctx.lineWidth;ctx.strokeStyle='rgba(8,24,32,.75)';ctx.lineWidth=lineWidth+2/v.scale;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=lineWidth;ctx.stroke();
  }
  ctx.beginPath();ctx.moveTo(center.x,0);ctx.lineTo(center.x,this.canvas.height);ctx.moveTo(0,center.y);ctx.lineTo(this.canvas.width,center.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(center.x,center.y,5/v.scale,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();
  }
  for(const other of this.otherCenters||[]){if(other.index!==this.index||!['manual','auto'].includes(other.confidence)||![other.x,other.y].every(Number.isFinite))continue;ctx.strokeStyle=other.objectId===1?'#ffad45':'#52f0c9';ctx.lineWidth=2/v.scale;ctx.beginPath();ctx.arc(other.x,other.y,7/v.scale,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
 }
}

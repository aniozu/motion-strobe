import {formatSeconds} from './format.js';
import {ImageViewport} from './image-viewport.js';
export class CenterEditor{
 constructor({preview,onAnchor,onReset,onSkip,onAuto,onCancel}){
  this.dialog=document.getElementById('centerDialog');this.canvas=document.getElementById('centerCanvas');this.preview=preview;this.onAnchor=onAnchor;this.mode='target';this.centers=[];this.indices=[];this.index=null;this.image=null;this.url=null;this.pending=false;
  const $=id=>document.getElementById(id);
  this.$=$;this.onCancel=onCancel;this.automatic=false;this.viewport=new ImageViewport();this.pointers=new Map();this.panMode=false;
  $('autoDetect').onclick=()=>{const seed=this.seed();if(!this.pending&&seed){this.automatic=true;this.progress({stage:'自動検出を準備中',value:0});this.setBusy(true);onAuto(seed.index);}};
  $('cancelDetection').onclick=()=>onCancel?.();
  this.dialog.addEventListener('cancel',e=>{if(this.automatic){e.preventDefault();onCancel?.();}});
  for(const button of this.dialog.querySelectorAll('[data-center-mode]'))button.onclick=()=>{this.mode=button.dataset.centerMode;this.update();};
  $('centerFrame').oninput=()=>this.select(Number($('centerFrame').value));$('centerPrevious').onclick=()=>this.select(this.position-1);$('centerNext').onclick=()=>this.select(this.position+1);
  $('resetCenters').onclick=()=>{if(!this.pending&&Number.isInteger(this.index)){if(this.mode==='none')this.mode='target';this.setBusy(true);onReset(this.index);}};
  $('skipCenter').onclick=()=>{if(!this.pending&&Number.isInteger(this.index)){this.mode='none';this.setBusy(true);onSkip(this.index);}};
  $('centerZoomIn').onclick=()=>this.zoom(1.5);$('centerZoomOut').onclick=()=>this.zoom(1/1.5);$('centerZoomReset').onclick=()=>{this.viewport.reset();this.draw();this.updateZoom();};
  $('centerPan').onclick=()=>{this.panMode=!this.panMode;this.updateZoom();};
  this.canvas.onwheel=e=>{if(this.pending||!this.image)return;e.preventDefault();const p=this.displayPoint(e);this.zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.005),p);};
  this.canvas.onpointerdown=e=>{
   if(this.pending||!this.image||e.button>0)return;this.canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,this.displayPoint(e));
   if(this.pointers.size>1){this.gestureBlocked=true;this.drag=null;this.pinch=this.pinchState();this.draw();return;}
   this.gestureBlocked=false;this.panLast=this.displayPoint(e);if(!this.panMode&&this.mode!=='none')this.drag=this.point(e);this.draw();
  };
  this.canvas.onpointermove=e=>{
   if(!this.pointers.has(e.pointerId)||this.pending)return;this.pointers.set(e.pointerId,this.displayPoint(e));
   if(this.pointers.size>1){const now=this.pinchState();if(this.pinch)this.viewport.gesture(this.pinch,now);this.pinch=now;this.draw();this.updateZoom();}
   else if(this.panMode&&!this.gestureBlocked){const now=this.displayPoint(e);this.viewport.pan(now.x-this.panLast.x,now.y-this.panLast.y);this.panLast=now;this.draw();}
   else if(this.drag&&!this.gestureBlocked&&this.mode==='center'){this.drag=this.point(e);this.draw();}
  };
  this.canvas.onpointerup=e=>{
   if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);this.pinch=null;
   if(this.gestureBlocked||this.panMode||!this.drag){this.drag=null;if(!this.pointers.size)this.gestureBlocked=false;this.draw();return;}
   const p=this.point(e);this.drag=null;this.setBusy(true);this.onAnchor({index:this.index,...p,mode:this.mode,source:'manual',spaceWidth:this.canvas.width,spaceHeight:this.canvas.height});
  };
  this.canvas.onpointercancel=e=>{this.pointers.delete(e.pointerId);this.gestureBlocked=this.pointers.size>0;this.pinch=null;this.drag=null;this.draw();};
  this.canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)||this.pending||this.mode!=='center')return;e.preventDefault();const center=this.centers.find(p=>p.index===this.index);if(!center||!Number.isFinite(center.x))return;const d=e.shiftKey?5:1;this.setBusy(true);this.onAnchor({index:this.index,x:Math.max(0,Math.min(this.canvas.width-1,center.x+(e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0))),y:Math.max(0,Math.min(this.canvas.height-1,center.y+(e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0))),mode:'center',source:'manual',spaceWidth:this.canvas.width,spaceHeight:this.canvas.height});};
  this.dialog.addEventListener('close',()=>{this.drag=null;this.pointers.clear();this.pinch=null;if(this.automatic)onCancel?.();});
 }
 displayPoint(e){const r=this.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*this.canvas.width/r.width,y:(e.clientY-r.top)*this.canvas.height/r.height};}
 point(e){const p=this.displayPoint(e),source=this.viewport.point(p.x,p.y);return {x:Math.max(0,Math.min(this.canvas.width-1,source.x)),y:Math.max(0,Math.min(this.canvas.height-1,source.y))};}
 pinchState(){const [a,b]=[...this.pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};}
 zoom(factor,point){if(this.pending||!this.image)return;this.viewport.zoom(factor,point?.x,point?.y);this.draw();this.updateZoom();}
 updateZoom(){const $=this.$;$('centerZoomLevel').textContent=`${Math.round(this.viewport.scale*100)}%`;$('centerZoomOut').disabled=this.pending||this.viewport.scale<=1;$('centerZoomIn').disabled=this.pending||this.viewport.scale>=8;$('centerZoomReset').disabled=this.pending;$('centerPan').disabled=this.pending;$('centerPan').classList.toggle('active',this.panMode);$('centerPan').setAttribute('aria-pressed',String(this.panMode));this.canvas.setAttribute('data-pan',String(this.panMode));}
 seed(){return (this.anchors||[]).find(a=>a.index===this.seedIndex&&this.indices.includes(a.index)&&a.mode==='center'&&a.source!=='auto')||(this.anchors||[]).find(a=>this.indices.includes(a.index)&&a.mode==='center'&&a.source!=='auto');}
 progress({stage,value}){this.$('detectionProgress').hidden=false;this.$('detectionTitle').textContent=`${stage} · ${Math.round(value*100)}%`;this.$('detectionBar').value=value;}
 setData({centers,indices,size,period,first,anchors,seedIndex,objectId=0,otherCenters=[]}){if(this.objectId!==undefined&&this.objectId!==objectId)this.mode='target';this.objectId=objectId;this.otherCenters=otherCenters;this.seedIndex=seedIndex;this.centers=centers;this.indices=indices;if(this.viewport.width!==size.width||this.viewport.height!==size.height)this.viewport.reset(size.width,size.height);this.size=size;this.period=period;this.first=first;this.anchors=anchors;this.setBusy(false);this.update();this.draw();}
 open(){if(!this.indices.length)return;this.dialog.showModal();this.viewport.reset(this.size.width,this.size.height);this.panMode=false;const wanted=this.indices.findIndex(n=>n===this.index);this.select(wanted<0?0:wanted);}
 select(position){if(this.pending||!this.indices.length)return;this.position=Math.max(0,Math.min(this.indices.length-1,position));this.index=this.indices[this.position];const current=this.centers.find(p=>p.index===this.index);if(current?.confidence==='skipped')this.mode='none';else if(this.mode==='none')this.mode='target';this.setBusy(true);this.preview(this.index);this.update();}
 accept({blob,index,size}){if(index!==this.index)return;const image=new Image(),url=URL.createObjectURL(blob);image.onload=()=>{if(index!==this.index){URL.revokeObjectURL(url);return;}if(this.url)URL.revokeObjectURL(this.url);this.url=url;this.image=image;this.canvas.width=size.width;this.canvas.height=size.height;this.setBusy(false);this.draw();};image.onerror=()=>{URL.revokeObjectURL(url);this.setBusy(false);this.$('centerStatus').textContent='画像を表示できませんでした。';};image.src=url;}
 setBusy(pending){this.pending=pending;if(pending){this.drag=null;this.pointers.clear();this.pinch=null;}if(!pending){this.automatic=false;this.$('detectionProgress').hidden=true;}for(const id of ['centerFrame','centerPrevious','centerNext','resetCenters','skipCenter'])this.$(id).disabled=pending;this.canvas.setAttribute('aria-busy',String(pending));this.update();this.updateZoom();}
 update(){
  const $=this.$;for(const b of this.dialog.querySelectorAll('[data-center-mode]')){b.disabled=this.pending;b.classList.toggle('active',b.dataset.centerMode===this.mode);b.setAttribute('aria-pressed',String(b.dataset.centerMode===this.mode));}
  $('autoDetect').disabled=this.pending||!this.seed();$('autoDetect').textContent=this.automatic?'自動検出中…':'全コマを自動検出';
  $('centerInstruction').textContent=this.mode==='target'?'検出する物体をタップすると、位置を自動で決定します。':this.mode==='center'?'タップ・ドラッグで物体の中心を決めます。':'このコマでは物体の位置を検出しません。';
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
  ctx.strokeStyle=center.confidence==='uncertain'?'#ef9e35':this.objectId===1?'#ffad45':'#52f0c9';ctx.lineWidth=Math.max(1.5,this.canvas.width/500)/v.scale;ctx.setLineDash(center.confidence==='uncertain'?[6/v.scale,4/v.scale]:[]);ctx.beginPath();ctx.moveTo(center.x,0);ctx.lineTo(center.x,this.canvas.height);ctx.moveTo(0,center.y);ctx.lineTo(this.canvas.width,center.y);ctx.stroke();ctx.setLineDash([]);ctx.beginPath();ctx.arc(center.x,center.y,5/v.scale,0,Math.PI*2);ctx.fillStyle='#fff';ctx.fill();ctx.stroke();
  }
  for(const other of this.otherCenters||[]){if(other.index!==this.index||!['manual','auto'].includes(other.confidence)||![other.x,other.y].every(Number.isFinite))continue;ctx.strokeStyle=other.objectId===1?'#ffad45':'#52f0c9';ctx.lineWidth=2/v.scale;ctx.beginPath();ctx.arc(other.x,other.y,7/v.scale,0,Math.PI*2);ctx.stroke();}
  ctx.restore();
 }
}

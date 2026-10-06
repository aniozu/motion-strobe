import {calibrationBasis} from './calibration.js';
import {drawAnnotations,gridOptions,measuredCenters,normalizeGuideAngle} from './annotations.js';

export function angleFromStroke(start,end){
 if(Math.hypot(end.x-start.x,end.y-start.y)<3)return null;
 return normalizeGuideAngle(Math.atan2(end.y-start.y,end.x-start.x)*180/Math.PI);
}
export class GuideEditor{
 constructor({onApply}){
  this.$=id=>document.getElementById(id);this.dialog=this.$('guideDialog');this.canvas=this.$('guideCanvas');this.onApply=onApply;this.token=0;this.frame=null;
  this.buttons=[...this.dialog.querySelectorAll('[data-guide-lines]')];
  for(const b of this.buttons)b.onclick=()=>{const mode=b.dataset.guideLines;this.draft={...this.draft,vertical:mode==='both'||mode==='vertical',horizontal:mode==='both'||mode==='horizontal'};this.update();};
  this.$('guideAngle').oninput=()=>this.setAngle(this.$('guideAngle').value);
  this.$('guideAngleNumber').oninput=()=>{const input=this.$('guideAngleNumber');if(input.value!==''&&Number.isFinite(input.valueAsNumber))this.setAngle(input.valueAsNumber,true);};
  this.$('guideAngleNumber').onchange=()=>this.update();
  this.$('resetGuideAngle').onclick=()=>this.setAngle(0);
  for(const id of ['guidePoints','guideColor','guideThickness','guideOpacity'])this.$(id).oninput=()=>{
   this.draft=gridOptions({...this.draft,points:this.$('guidePoints').checked,color:this.$('guideColor').value,thickness:Number(this.$('guideThickness').value),opacity:Number(this.$('guideOpacity').value)/100});this.update();
  };
  this.$('applyGuides').onclick=()=>{const settings={...this.draft};this.dialog.close();this.onApply(settings);};
  this.canvas.onpointerdown=e=>{if(!this.image||this.calibration||e.isPrimary===false)return;this.canvas.setPointerCapture(e.pointerId);this.drag={start:this.point(e),end:this.point(e),pointerId:e.pointerId};this.schedule();};
  this.canvas.onpointermove=e=>{if(this.drag?.pointerId!==e.pointerId)return;this.drag.end=this.point(e);const angle=angleFromStroke(this.drag.start,this.drag.end);if(angle!==null)this.setAngle(angle);};
  this.canvas.onpointerup=e=>{if(this.drag?.pointerId!==e.pointerId)return;const angle=angleFromStroke(this.drag.start,this.point(e));this.drag=null;if(angle!==null)this.setAngle(angle);else this.schedule();};
  this.canvas.onpointercancel=()=>{this.drag=null;this.schedule();};
  this.canvas.onlostpointercapture=()=>{this.drag=null;this.schedule();};
  this.canvas.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home'].includes(e.key))return;e.preventDefault();this.setAngle(e.key==='Home'?0:this.draft.angle+(e.key==='ArrowLeft'?-1:1)*(e.shiftKey?5:1));};
  this.dialog.addEventListener('close',()=>{this.token++;this.drag=null;this.image=null;if(this.frame!==null)cancelAnimationFrame(this.frame);this.frame=null;});
 }
 open({guide,centers,labels,calibration=null}){
  this.token++;this.image=null;this.centers=centers;this.labels=labels;this.drag=null;
  this.calibration=calibration;this.draft=gridOptions({...guide,enabled:true,angle:calibrationBasis(calibration,{width:calibration?.width,height:calibration?.height})?.angle??guide.angle});
  for(const id of ['guideAngle','guideAngleNumber','resetGuideAngle'])this.$(id).disabled=!!calibration;this.$('guideCalibrationNote').hidden=!calibration;this.$('guidePreviewStatus').textContent='画像を準備中…';this.$('guidePreviewStatus').hidden=false;this.canvas.setAttribute('aria-busy','true');
  this.canvas.getContext('2d').clearRect(0,0,this.canvas.width,this.canvas.height);this.update();this.dialog.showModal();
 }
 accept({blob,size}){
  if(!this.dialog.open)return;const token=this.token,image=new Image(),url=URL.createObjectURL(blob);
  image.onload=()=>{URL.revokeObjectURL(url);if(token!==this.token||!this.dialog.open)return;this.image=image;this.canvas.width=size.width;this.canvas.height=size.height;this.canvas.setAttribute('aria-busy','false');
   const status=this.$('guidePreviewStatus');status.hidden=measuredCenters(this.centers).length>0;status.textContent='角度の目安です。線は検出した中心に表示します。';this.schedule();
  };
  image.onerror=()=>{URL.revokeObjectURL(url);if(token===this.token)this.error('画像を表示できませんでした。');};image.src=url;
 }
 error(message){this.$('guidePreviewStatus').hidden=false;this.$('guidePreviewStatus').textContent=message;this.canvas.setAttribute('aria-busy','false');}
 point(e){const r=this.canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(this.canvas.width,(e.clientX-r.left)*this.canvas.width/r.width)),y:Math.max(0,Math.min(this.canvas.height,(e.clientY-r.top)*this.canvas.height/r.height))};}
 setAngle(value,keepInput=false){if(this.calibration)return;const angle=Number(value);if(!Number.isFinite(angle))return;this.draft={...this.draft,angle:normalizeGuideAngle(Math.max(-90,Math.min(90,angle)))};this.update(keepInput);}
 update(keepInput=false){
  for(const [id,key] of [['guidePoints','points'],['guideColor','color'],['guideThickness','thickness']]){if(key==='points')this.$(id).checked=this.draft[key];else this.$(id).value=this.draft[key];}
  this.$('guideAngle').value=this.draft.angle;if(!keepInput)this.$('guideAngleNumber').value=this.draft.angle;this.$('guideOpacity').value=Math.round(this.draft.opacity*100);this.$('guideOpacityValue').textContent=`${Math.round(this.draft.opacity*100)}%`;
  const mode=this.draft.vertical?(this.draft.horizontal?'both':'vertical'):(this.draft.horizontal?'horizontal':'none');
  for(const b of this.buttons){b.classList.toggle('active',b.dataset.guideLines===mode);b.setAttribute('aria-pressed',String(b.dataset.guideLines===mode));}this.schedule();
 }
 schedule(){if(this.frame!==null)return;this.frame=requestAnimationFrame(()=>{this.frame=null;this.draw();});}
 draw(){
  if(!this.image||!this.dialog.open)return;const ctx=this.canvas.getContext('2d'),width=this.canvas.width,height=this.canvas.height;ctx.clearRect(0,0,width,height);ctx.drawImage(this.image,0,0,width,height);
  const centers=measuredCenters(this.centers).length?this.centers:[{x:width/2,y:height/2,confidence:'manual'}];
  drawAnnotations(ctx,centers,width,height,{grid:this.draft,calibration:this.calibration,labels:this.labels&&measuredCenters(this.centers).length>0});
  if(this.drag){ctx.save();ctx.strokeStyle='#52f0c9';ctx.lineWidth=Math.max(2,width/400);ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(this.drag.start.x,this.drag.start.y);ctx.lineTo(this.drag.end.x,this.drag.end.y);ctx.stroke();ctx.restore();}
 }
}

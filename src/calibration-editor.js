import {ImageViewport} from './image-viewport.js';
import {calibrationBasis,coordinateOrigin} from './calibration.js';
export class CalibrationEditor{
 constructor({onApply,onClear}){
  this.$=id=>document.getElementById(id);this.dialog=this.$('calibrationDialog');this.canvas=this.$('calibrationCanvas');this.viewport=new ImageViewport();this.pointers=new Map();this.active='a';this.pan=false;this.token=0;this.image=null;
  for(const b of this.dialog.querySelectorAll('[data-calibration-point]'))b.onclick=()=>{this.active=b.dataset.calibrationPoint;this.pan=false;this.update();};
  this.$('calibrationAxis').onchange=()=>{this.draft.axis=this.$('calibrationAxis').value;this.update();};
  this.$('calibrationLength').oninput=()=>{this.draft.length=Number(this.$('calibrationLength').value);this.update(false);};
  this.$('calibrationAngle').oninput=()=>this.geometry(Number(this.$('calibrationAngle').value),this.distance());
  this.$('calibrationAngleNumber').oninput=()=>{
   const value=this.$('calibrationAngleNumber').value,angle=Number(value);
   if(value.trim()===''||!Number.isFinite(angle)||angle< -90||angle>90){this.update(false);return;}
   this.geometry(angle,this.distance(),false);
  };
  this.$('calibrationAngleNumber').onblur=()=>this.update();
  this.$('calibrationSpan').oninput=()=>this.geometry(this.angle(),Number(this.$('calibrationSpan').value));
  this.$('calibrationZoomIn').onclick=()=>this.zoom(1.5);this.$('calibrationZoomOut').onclick=()=>this.zoom(1/1.5);this.$('calibrationZoomReset').onclick=()=>{this.viewport.reset();this.update();};
  this.$('calibrationPan').onclick=()=>{this.pan=!this.pan;this.update();};
  this.$('applyCalibration').onclick=()=>{if(!this.basis())return;const result=structuredClone(this.draft);this.dialog.close();onApply(result);};
  this.$('clearCalibration').onclick=()=>{this.dialog.close();onClear();};
  this.canvas.onwheel=e=>{if(!this.image)return;e.preventDefault();this.zoom(Math.exp(-Math.max(-100,Math.min(100,e.deltaY))*.005),this.displayPoint(e));};
  this.canvas.onpointerdown=e=>{
   if(!this.image||e.button>0)return;this.canvas.setPointerCapture(e.pointerId);this.pointers.set(e.pointerId,this.displayPoint(e));
   if(this.pointers.size>1){if(this.beforeGesture)this.draft=structuredClone(this.beforeGesture);this.blocked=true;this.drag=null;this.pinch=this.pinchState();this.update();return;}
   this.blocked=false;this.beforeGesture=structuredClone(this.draft);this.last=this.displayPoint(e);
   if(this.pan){this.drag='pan';return;}
   const point=this.point(e),nearest=['a','b'].map(key=>({key,d:Math.hypot(point.x-this.draft[key].x,point.y-this.draft[key].y)*this.viewport.scale*this.canvas.getBoundingClientRect().width/this.canvas.width})).sort((a,b)=>a.d-b.d)[0];
   if(nearest.d<24)this.active=nearest.key;this.drag=this.active;this.draft[this.active]=point;this.update();
  };
  this.canvas.onpointermove=e=>{
   if(!this.pointers.has(e.pointerId))return;const now=this.displayPoint(e);this.pointers.set(e.pointerId,now);
   if(this.pointers.size>1){const next=this.pinchState();if(this.pinch)this.viewport.gesture(this.pinch,next);this.pinch=next;this.update();}
   else if(!this.blocked&&this.drag==='pan'){this.viewport.pan(now.x-this.last.x,now.y-this.last.y);this.last=now;this.update();}
   else if(!this.blocked&&this.drag){this.draft[this.drag]=this.point(e);this.update();}
  };
  this.canvas.onpointerup=e=>{if(!this.pointers.has(e.pointerId))return;this.pointers.delete(e.pointerId);this.pinch=null;if(!this.blocked&&this.drag&&this.drag!=='pan'){this.draft[this.drag]=this.point(e);if(this.drag==='a')this.active='b';}this.drag=null;if(!this.pointers.size){this.blocked=false;this.beforeGesture=null;}this.update();};
  this.canvas.onpointercancel=e=>{this.pointers.delete(e.pointerId);if(this.beforeGesture)this.draft=structuredClone(this.beforeGesture);this.drag=null;this.pinch=null;this.blocked=this.pointers.size>0;this.update();};
  this.canvas.onkeydown=e=>{if(!this.image||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const p=this.draft[this.active],d=e.shiftKey?5:1;p.x=Math.max(0,Math.min(this.canvas.width,p.x+(e.key==='ArrowLeft'?-d:e.key==='ArrowRight'?d:0)));p.y=Math.max(0,Math.min(this.canvas.height,p.y+(e.key==='ArrowUp'?-d:e.key==='ArrowDown'?d:0)));this.update();};
  this.dialog.addEventListener('close',()=>{this.token++;this.image=null;this.pointers.clear();this.drag=null;});
 }
 open({calibration,data}){
  this.token++;this.image=null;this.data=data;this.size=data.size;this.origin=coordinateOrigin(data);this.active='a';this.pan=false;this.viewport.reset(data.size.width,data.size.height);this.pointers.clear();
  const existing=calibrationBasis(calibration,this.size),w=this.size.width,h=this.size.height;
  this.draft=existing?{a:existing.a,b:existing.b,length:existing.length,axis:calibration.axis,width:w,height:h}:{a:{x:w*.35,y:h*.6},b:{x:w*.65,y:h*.6},length:0,axis:'x',width:w,height:h};
  this.$('calibrationStatus').textContent='画像を準備中…';this.$('calibrationCanvas').setAttribute('aria-busy','true');this.$('calibrationLength').value=existing?String(existing.length):'';this.$('clearCalibration').disabled=!calibration;this.dialog.showModal();this.update();
 }
 accept({blob,size}){
  if(!this.dialog.open)return;const token=this.token,url=URL.createObjectURL(blob),image=new Image();
  image.onload=()=>{URL.revokeObjectURL(url);if(token!==this.token||!this.dialog.open)return;this.image=image;this.canvas.width=size.width;this.canvas.height=size.height;this.canvas.setAttribute('aria-busy','false');this.update();};
  image.onerror=()=>{URL.revokeObjectURL(url);if(token===this.token)this.error('画像を表示できませんでした。');};image.src=url;
 }
 error(message){this.$('calibrationStatus').textContent=message;this.canvas.setAttribute('aria-busy','false');}
 basis(){return calibrationBasis(this.draft,this.size);}
 distance(){return Math.hypot(this.draft.b.x-this.draft.a.x,this.draft.b.y-this.draft.a.y);}
 angle(){const b=calibrationBasis({...this.draft,length:1},this.size);return b?-b.angle:0;}
 geometry(angle,distance,syncAngle=true){
  const radians=angle*Math.PI/180,x={x:Math.cos(radians),y:-Math.sin(radians)},d=this.draft.axis==='y'?{x:x.y,y:-x.x}:x,center={x:(this.draft.a.x+this.draft.b.x)/2,y:(this.draft.a.y+this.draft.b.y)/2};
  const limit=Math.min(Math.abs(d.x)>1e-9?2*Math.min(center.x,this.size.width-center.x)/Math.abs(d.x):Infinity,Math.abs(d.y)>1e-9?2*Math.min(center.y,this.size.height-center.y)/Math.abs(d.y):Infinity);distance=Math.min(distance,limit);
  this.draft.a={x:center.x-d.x*distance/2,y:center.y-d.y*distance/2};this.draft.b={x:center.x+d.x*distance/2,y:center.y+d.y*distance/2};this.update(syncAngle);
 }
 displayPoint(e){const r=this.canvas.getBoundingClientRect();return {x:(e.clientX-r.left)*this.canvas.width/r.width,y:(e.clientY-r.top)*this.canvas.height/r.height};}
 point(e){const p=this.displayPoint(e),s=this.viewport.point(p.x,p.y);return {x:Math.max(0,Math.min(this.canvas.width,s.x)),y:Math.max(0,Math.min(this.canvas.height,s.y))};}
 pinchState(){const [a,b]=[...this.pointers.values()];return {x:(a.x+b.x)/2,y:(a.y+b.y)/2,distance:Math.hypot(a.x-b.x,a.y-b.y)};}
 zoom(factor,p){if(!this.image)return;this.viewport.zoom(factor,p?.x,p?.y);this.update();}
 update(syncAngle=true){
  if(!this.draft)return;const $=this.$,basis=this.basis();$('calibrationAxis').value=this.draft.axis;$('applyCalibration').disabled=!basis||!this.image;$('calibrationZoomLevel').textContent=`${Math.round(this.viewport.scale*100)}%`;$('calibrationZoomOut').disabled=this.viewport.scale<=1;$('calibrationZoomIn').disabled=this.viewport.scale>=8;$('calibrationPan').classList.toggle('active',this.pan);$('calibrationPan').setAttribute('aria-pressed',String(this.pan));
  for(const b of this.dialog.querySelectorAll('[data-calibration-point]')){b.classList.toggle('active',b.dataset.calibrationPoint===this.active);b.setAttribute('aria-pressed',String(b.dataset.calibrationPoint===this.active));}
  const angleNumber=$('calibrationAngleNumber');if(syncAngle)angleNumber.value=String(Number(this.angle().toFixed(4)));
  const inputAngle=Number(angleNumber.value);if(angleNumber.value.trim()===''||!Number.isFinite(inputAngle)||inputAngle< -90||inputAngle>90)$('applyCalibration').disabled=true;
  $('calibrationAngle').value=this.angle();$('calibrationSpan').max=Math.ceil(Math.hypot(this.size.width,this.size.height));$('calibrationSpan').value=this.distance();
  if(this.image)$('calibrationStatus').textContent=basis?`2点間 ${basis.distance.toFixed(1)} px = ${basis.length} m${this.origin?'':' · 最初のコマの物体位置を指定すると原点が決まります。'}`:'2点を合わせ、実際の距離をmで入力してください。';
  this.draw();
 }
 draw(){
  if(!this.image)return;const ctx=this.canvas.getContext('2d'),w=this.canvas.width,h=this.canvas.height,v=this.viewport;ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.scale(v.scale,v.scale);ctx.translate(-v.x,-v.y);ctx.drawImage(this.image,0,0,w,h);
  ctx.lineWidth=Math.max(2,w/350)/v.scale;ctx.strokeStyle='#52f0c9';ctx.setLineDash([6/v.scale,4/v.scale]);ctx.beginPath();ctx.moveTo(this.draft.a.x,this.draft.a.y);ctx.lineTo(this.draft.b.x,this.draft.b.y);ctx.stroke();ctx.setLineDash([]);ctx.font=`600 ${Math.max(14,w/45)/v.scale}px sans-serif`;ctx.textBaseline='middle';
  for(const key of ['a','b']){const p=this.draft[key];ctx.beginPath();ctx.arc(p.x,p.y,(this.active===key?8:6)/v.scale,0,Math.PI*2);ctx.fillStyle=this.active===key?'#52f0c9':'#fff';ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.fillText(key.toUpperCase(),p.x+12/v.scale,p.y);}
  const basis=calibrationBasis({...this.draft,length:1},this.size),origin=this.origin||{x:w/2,y:h/2};
  if(basis){for(const [name,d,color] of [['x',basis.x,'#76abff'],['y',basis.y,'#e3aaff']]){const end={x:origin.x+d.x*basis.distance,y:origin.y+d.y*basis.distance};ctx.strokeStyle=color;ctx.beginPath();ctx.moveTo(origin.x,origin.y);ctx.lineTo(end.x,end.y);ctx.stroke();ctx.fillStyle=color;ctx.fillText(name,end.x+8/v.scale,end.y);}
   ctx.fillStyle='#fff';ctx.fillText(this.origin?'O':'軸の向きの目安',origin.x+8/v.scale,origin.y+18/v.scale);
  }ctx.restore();
 }
}

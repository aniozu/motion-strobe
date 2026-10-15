import {seekPreviewFrame} from './sampling-preview.js';

// Two small canvases at most: the displayed image and one prepared image. The
// source player does the seeking behind the displayed canvas, using one decoder.
export class SamplingPreviewSurface{
 constructor(video,{createCanvas=()=>document.createElement('canvas'),seek=seekPreviewFrame,maxSize=960}={}){
  Object.assign(this,{video,createCanvas,seek,maxSize});
  this.canvas=createCanvas();this.canvas.className='sampling-preview-image';
  this.canvas.hidden=true;this.canvas.setAttribute('aria-hidden','true');
  video.insertAdjacentElement('afterend',this.canvas);this.frame=null;this.heldTime=null;
 }
 get active(){return !this.canvas.hidden;}
 get time(){return this.active?(this.frame?.time??this.heldTime):null;}
 size(){
  const {videoWidth:width,videoHeight:height}=this.video;
  if(!(width>0&&height>0))return null;
  const scale=Math.min(1,this.maxSize/Math.max(width,height));
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
 }
 draw(source,size){
  if(this.canvas.width!==size.width||this.canvas.height!==size.height){this.canvas.width=size.width;this.canvas.height=size.height;}
  this.canvas.getContext('2d',{alpha:false}).drawImage(source,0,0,size.width,size.height);
  this.canvas.hidden=false;
 }
 hold(){
  if(this.active||this.video.readyState<2)return;
  const size=this.size();if(!size)return;
  try{this.draw(this.video,size);this.heldTime=this.video.currentTime;}catch{}
 }
 async prepare(index,target,{signal}={}){
  this.hold();
  if(!await this.seek(this.video,target,{signal})||signal?.aborted)return null;
  const size=this.size();if(!size)return null;
  const buffer=this.createCanvas();buffer.width=size.width;buffer.height=size.height;
  const dispose=()=>{buffer.width=buffer.height=0;};
  try{buffer.getContext('2d',{alpha:false}).drawImage(this.video,0,0,size.width,size.height);}
  catch{dispose();return null;}
  return {present:()=>{this.draw(buffer,size);this.frame={index,time:target.time};},dispose};
 }
 hide({restore=false}={}){
  const time=this.time;this.canvas.hidden=true;this.frame=null;this.heldTime=null;
  this.canvas.width=this.canvas.height=0;
  if(restore&&Number.isFinite(time)&&Math.abs(this.video.currentTime-time)>.0001){try{this.video.currentTime=time;}catch{}}
 }
}

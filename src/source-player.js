export function playbackTime(seconds){
 const value=Math.max(0,Math.floor(Number.isFinite(seconds)?seconds:0)),s=String(value%60).padStart(2,'0'),minutes=Math.floor(value/60);
 return minutes>=60?`${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}:${s}`:`${minutes}:${s}`;
}

// Use the browser's media engine, with controls outside its native overlay.
export class SourcePlayer{
 constructor({video,button,seek,readout,onManual=()=>{},onError=()=>{},canUse=()=>true,getTime=()=>video.currentTime,labels}){
  Object.assign(this,{video,button,seek,readout,onManual,onError,canUse,getTime,labels,scrubbing:false});
  video.controls=false;
  button.addEventListener('click',()=>this.toggle());
  seek.addEventListener('pointerdown',()=>this.beginScrub());
  seek.addEventListener('input',()=>this.scrub());
  for(const event of ['change','pointerup','pointercancel','blur'])seek.addEventListener(event,()=>{this.scrubbing=false;this.update();});
  for(const event of ['loadedmetadata','durationchange','timeupdate','play','pause','ended','seeked','emptied'])video.addEventListener(event,()=>this.update());
  this.update();
 }
 async toggle(){
  if(!this.canUse()||!this.video.getAttribute('src'))return;
  this.onManual();
  if(this.video.paused){try{await this.video.play();}catch{this.onError();}}
  else this.video.pause();
  this.update();
 }
 beginScrub(){if(!this.canUse())return;this.scrubbing=true;this.onManual();this.video.pause();}
 scrub(){
  if(!this.canUse())return;
  const duration=this.video.duration,value=Number(this.seek.value);
  if(!Number.isFinite(duration)||duration<=0||!Number.isFinite(value))return;
  this.onManual();this.video.pause();
  this.video.currentTime=Math.max(0,Math.min(duration,value));this.update();
 }
 update(){
  const duration=Number.isFinite(this.video.duration)?Math.max(0,this.video.duration):0,current=Math.max(0,this.getTime()||0),enabled=this.canUse()&&!!this.video.getAttribute('src');
  this.button.disabled=!enabled;this.button.textContent=this.video.paused?'▶':'❚❚';this.button.setAttribute('aria-label',this.video.paused?this.labels.play:this.labels.pause);
  this.seek.disabled=!enabled||duration<=0;this.seek.max=String(duration);
  if(!this.scrubbing)this.seek.value=String(Math.min(duration,current));
  this.readout.textContent=`${playbackTime(current)} / ${playbackTime(duration)}`;
  this.seek.setAttribute('aria-valuetext',this.readout.textContent);
 }
}

// Preview requests share the loaded media worker. IDs belong to the preview
// channel, so a late preview cannot replace a finished photo.
export class LivePhotoPreview {
 constructor({post,onPresent,onStatus,onProgress=()=>{},delay=40,setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}){
  Object.assign(this,{post,onPresent,onStatus,onProgress,delay,setTimer,clearTimer});
  this.sequence=0;
  this.key=null;
  this.presentedKey=null;
  this.activeId=null;
 }
 setSource(ready){this.cancel();this.presentedKey=null;this.ready=ready;}
 cancel({keepFrames=false}={}){
  this.clearTimer(this.timer);
  this.clearTimer(this.watchdog);
  this.timer=null;
  if(this.key!==null)this.post({type:'cancel',keepFrames,id:++this.sequence});
  this.activeId=null;
  this.key=null;
 }
 request(settings,{onStart=()=>{}}={}){
  if(!this.ready)return;
  const key=JSON.stringify(settings);
  if(key===this.key)return;
  this.cancel({keepFrames:true});
  if(key===this.presentedKey){
   // The view still owns the last image URL, even after worker frames were released.
   this.onStatus('ready');
   return;
  }
  this.key=key;
  onStart();
  this.onStatus('updating');
  this.timer=this.setTimer(()=>{
   this.timer=null;
   this.activeId=++this.sequence;
   this.watchdog=this.setTimer(()=>this.fail(),60000);
   this.post({type:'render',...settings,id:this.activeId});
  },this.delay);
 }
 accept(message){
  if(message.id!==this.activeId)return;
  if(message.type==='progress'){this.onProgress(message.value);return;}
  if(message.type==='error'){this.fail();return;}
  if(message.type!=='composed')return;
  this.clearTimer(this.watchdog);
  this.activeId=null;
  this.onPresent(message);
  this.presentedKey=this.key;
  this.onStatus('ready');
 }
 fail(){this.cancel();this.onStatus('error');}
}

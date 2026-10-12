// Editing options never starts an encoder; only confirmation creates a video.
export function installVideoOptions({dialog,speed,sound,confirm,cancel,canOpen=()=>true,canUseSound=()=>true,onUpdate=()=>{},onConfirm=()=>{}}){
 let previous=null,accepted=false;
 function open(){
  if(dialog.open||!canOpen())return;
  previous={speed:speed.value,sound:sound.checked};accepted=false;
  if(!canUseSound())sound.checked=false;
  dialog.showModal();onUpdate();speed.focus?.();
 }
 function restore(){
  if(previous&&!accepted){speed.value=previous.speed;sound.checked=previous.sound;}
  previous=null;onUpdate();
 }
 dialog.addEventListener('close',restore);
 speed.onchange=onUpdate;sound.onchange=onUpdate;
 cancel.onclick=()=>dialog.close();
 confirm.onclick=()=>{
  if(!dialog.open||!canOpen())return;
  if(!canUseSound())sound.checked=false;
  accepted=true;dialog.close();onConfirm();
 };
 return {open};
}

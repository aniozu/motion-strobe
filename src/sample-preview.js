// One small, on-demand video for the whole picker. No sources exist before interaction.
export function installSamplePreviews(dialog,{doc=document,win=window,delay=180}={}){
 let timer=null,autoTimer=null,candidate=null,active=null,suppressed=null;
 const thumbnails=[];
 const stop=()=>{
  clearTimeout(timer);clearTimeout(autoTimer);timer=null;autoTimer=null;
  candidate?.setAttribute('aria-pressed','false');candidate=null;
  if(!active)return;
  const video=active.video;active=null;
  video.pause();video.removeAttribute('src');video.load();video.remove();
 };
 const start=(thumbnail,url,mode)=>{
  stop();if(!dialog.open||doc.hidden)return;
  candidate=thumbnail;
  const play=()=>{
   timer=null;
   if(candidate!==thumbnail||!dialog.open||doc.hidden)return;
   const video=doc.createElement('video');
   video.className='sample-preview';video.preload='none';video.muted=true;video.defaultMuted=true;
   video.loop=true;video.playsInline=true;video.autoplay=true;video.tabIndex=-1;video.setAttribute('aria-hidden','true');
   const session={thumbnail,video,mode};active=session;thumbnail.setAttribute('aria-pressed','true');
   video.addEventListener('playing',()=>{if(active===session)video.classList.add('is-playing');});
   video.addEventListener('error',()=>{if(active===session)stop();});
   thumbnail.append(video);video.src=url;
   try{Promise.resolve(video.play()).catch(()=>{if(active===session)stop();});}
   catch{if(active===session)stop();}
  };
  // A tap calls play synchronously inside the user gesture, including on iOS.
  if(mode==='hover')timer=setTimeout(play,delay);else play();
 };
 const refresh=()=>{
  clearTimeout(autoTimer);
  if(!win.matchMedia?.('(hover: none)').matches||!dialog.open||doc.hidden||active)return;
  autoTimer=setTimeout(()=>{
   autoTimer=null;if(!dialog.open||doc.hidden||active)return;
   const view=dialog.getBoundingClientRect(),cx=(view.left+view.right)/2,cy=(view.top+view.bottom)/2;
   const choices=thumbnails.map(item=>{
    const box=item.thumbnail.getBoundingClientRect();
    const area=Math.max(0,Math.min(view.right,box.right)-Math.max(view.left,box.left))*Math.max(0,Math.min(view.bottom,box.bottom)-Math.max(view.top,box.top));
    return {...item,visible:area/Math.max(1,(box.right-box.left)*(box.bottom-box.top)),distance:Math.hypot((box.left+box.right)/2-cx,(box.top+box.bottom)/2-cy)};
   }).filter(item=>item.visible>=.7).sort((a,b)=>a.distance-b.distance);
   const chosen=choices[0];if(!chosen||chosen.thumbnail===suppressed)return;
   suppressed=null;start(chosen.thumbnail,chosen.url,'auto');
  },400);
 };
 const attach=(thumbnail,url)=>{
  thumbnails.push({thumbnail,url});
  thumbnail.setAttribute('aria-pressed','false');
  thumbnail.addEventListener('pointerenter',event=>{
   if(event.pointerType==='touch'||active?.thumbnail===thumbnail)return;
   start(thumbnail,url,'hover');
  });
  thumbnail.addEventListener('click',()=>{
   if(active?.thumbnail===thumbnail&&active.mode!=='hover'){suppressed=thumbnail;stop();}else{suppressed=null;start(thumbnail,url,'tap');}
  });
  thumbnail.addEventListener('pointerleave',()=>{if(candidate===thumbnail&&(!active||active.mode==='hover'))stop();});
  thumbnail.addEventListener('pointercancel',()=>{if(candidate===thumbnail)stop();});
 };
 dialog.addEventListener('close',stop);dialog.addEventListener('cancel',stop);dialog.addEventListener('scroll',()=>{stop();refresh();},{passive:true});
 doc.addEventListener?.('visibilitychange',()=>{if(doc.hidden)stop();else refresh();});
 win.addEventListener('blur',stop);win.addEventListener('pagehide',stop);win.addEventListener('resize',()=>{stop();refresh();});win.addEventListener('focus',refresh);
 return {attach,stop,refresh};
}

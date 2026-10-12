import {openingAnimationEnabled} from './opening-preference.js';
export const homeExamples=[{
 id:'soccer',
 video:'opening-soccer.mp4?v=1.21.9',
 poster:'opening-soccer-poster.webp?v=1.21.9'
}];
const installed=new WeakMap();
export function installHomeExample(home,example=homeExamples[0]){
 const video=home.querySelector('#homeExampleVideo');
 video.poster=example.poster;
 video.playbackRate=2;video.defaultPlaybackRate=2;
 video.muted=true;video.defaultMuted=true;video.playsInline=true;
 const state={example,video,started:false,sequence:0};installed.set(home,state);
 const visible=()=>!home.hidden&&home.ownerDocument.visibilityState!=='hidden';
 const play=()=>{if(state.started&&visible()&&openingAnimationEnabled(home.ownerDocument))video.play()?.catch(()=>{});else video.pause();};
 home.ownerDocument.addEventListener('visibilitychange',play);
 if(typeof MutationObserver!=='undefined')new MutationObserver(play).observe(home,{attributes:true,attributeFilter:['hidden']});
 video.addEventListener('error',()=>{state.started=false;video.pause();video.removeAttribute('src');video.load();});
 // The intro never waits for the movie to load.
 return Promise.resolve();
}
export async function restartHomeExample(home,{signal,isVisible=()=>!home.hidden&&home.ownerDocument.visibilityState!=='hidden'}={}){
 const state=installed.get(home);if(!state)return;
 const {video,example}=state;const sequence=++state.sequence;
 video.pause();state.started=false;
 if(signal?.aborted||!isVisible())return;
 if(!openingAnimationEnabled(home.ownerDocument)){
  video.removeAttribute('src');video.load();return;
 }
 if(video.getAttribute('src')!==example.video)video.src=example.video;
 video.playbackRate=2;video.muted=true;video.currentTime=0;state.started=true;
 signal?.addEventListener('abort',()=>{if(state.sequence===sequence)video.pause();},{once:true});
 try{await video.play();}catch{/* Poster remains visible if autoplay is blocked. */}
 if(state.sequence!==sequence)return;
 if(signal?.aborted||!isVisible()||!openingAnimationEnabled(home.ownerDocument)){state.started=false;video.pause();}
}

import {openingAnimationEnabled} from './opening-preference.js';
export const homeExamples=[
 {id:'soccer',video:'opening-soccer.mp4?v=1.23.6',poster:'opening-soccer-poster.webp?v=1.23.6',caption:'解析例：サッカーボールの放物運動'},
 {id:'bouncing-ball',video:'opening-bouncing-ball.mp4?v=1.23.6',poster:'opening-bouncing-ball-poster.webp?v=1.23.6',caption:'解析例：スーパーボールのバウンド'},
 {id:'hammer',video:'opening-hammer.mp4?v=1.23.6',poster:'opening-hammer-poster.webp?v=1.23.6',caption:'解析例：ハンマーの放物運動'}
];
const installed=new WeakMap();
export function installHomeExample(home,example=homeExamples[0]){
 const video=home.querySelector('#homeExampleVideo');
 const figure=home.querySelector('.home-example'),caption=home.querySelector('#homeExampleCaption');
 const examples=example===homeExamples[0]?homeExamples:[example];
 video.playbackRate=2;video.defaultPlaybackRate=2;
 video.muted=true;video.defaultMuted=true;video.playsInline=true;
 video.loop=false;
 const state={home,example,examples,index:0,video,figure,caption,started:false,sequence:0,frameSequence:0};installed.set(home,state);
 setExample(state,0);
 const visible=()=>!home.hidden&&home.ownerDocument.visibilityState!=='hidden';
 const play=()=>{if(state.started&&visible()&&openingAnimationEnabled(home.ownerDocument)){
  if(video.ended)advance();else video.play()?.catch(()=>{});
 }else video.pause();};
 const advance=()=>{if(!state.started||!visible()||!openingAnimationEnabled(home.ownerDocument))return;
  setExample(state,(state.index+1)%examples.length);video.src=state.example.video;video.currentTime=0;
  video.playbackRate=2;video.muted=true;video.play()?.catch(()=>{});
 };
 video.addEventListener('ended',advance);
 video.addEventListener('playing',()=>{
  if(!state.started||!state.fadePending||video.seeking||!visible()||!openingAnimationEnabled(home.ownerDocument))return;
  const sequence=state.sequence,frameSequence=state.frameSequence;
  const reveal=()=>{
   if(sequence!==state.sequence||frameSequence!==state.frameSequence||!state.started||!state.fadePending||video.seeking||video.readyState<2||!visible()||!openingAnimationEnabled(home.ownerDocument))return;
   state.fadePending=false;
   figure?.classList.remove('is-example-loading');
   figure?.classList.remove('is-example-entering');
   // Show the decoded movie frame and its caption together, never the previous ending.
   if(figure){void figure.offsetWidth;figure.classList.add('is-example-entering');}
  };
  if(typeof video.requestVideoFrameCallback==='function')video.requestVideoFrameCallback(reveal);
  else requestAnimationFrame(reveal);
 });
 home.ownerDocument.addEventListener('visibilitychange',play);
 if(typeof MutationObserver!=='undefined')new MutationObserver(play).observe(home,{attributes:true,attributeFilter:['hidden']});
 video.addEventListener('error',()=>{state.started=false;figure?.classList.add('is-example-loading');video.pause();video.removeAttribute('src');video.load();});
 // The intro never waits for the movie to load.
 return Promise.resolve();
}
function setExample(state,index){
 state.frameSequence++;
 state.index=index;state.example=state.examples[index];
 state.fadePending=true;
 state.figure?.classList.remove('is-example-entering');
 if(openingAnimationEnabled(state.home.ownerDocument)){
  state.figure?.classList.add('is-example-loading');state.video.removeAttribute('poster');
 }else{
  state.video.poster=state.example.poster;state.figure?.classList.remove('is-example-loading');
 }
 if(state.caption)state.caption.textContent=state.example.caption||'';
 state.video.setAttribute('aria-label',state.example.caption||'');
}
export async function restartHomeExample(home,{signal,isVisible=()=>!home.hidden&&home.ownerDocument.visibilityState!=='hidden'}={}){
 const state=installed.get(home);if(!state)return;
 const {video}=state;const sequence=++state.sequence;
 video.pause();state.started=false;
 if(signal?.aborted||!isVisible())return;
 setExample(state,0);const {example}=state;
 if(!openingAnimationEnabled(home.ownerDocument)){
  video.removeAttribute('src');video.load();return;
 }
 if(video.getAttribute('src')!==example.video)video.src=example.video;
 video.playbackRate=2;video.muted=true;video.currentTime=0;state.started=true;
 signal?.addEventListener('abort',()=>{if(state.sequence===sequence){state.started=false;video.pause();}},{once:true});
 try{await video.play();}catch{/* Keep controls available without showing the composite poster. */}
 if(state.sequence!==sequence)return;
 if(signal?.aborted||!isVisible()||!openingAnimationEnabled(home.ownerDocument)){state.started=false;video.pause();}
}

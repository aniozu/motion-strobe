// Only fixed usage categories are sent. No files, filenames, coordinates,
// input values, or error messages are accepted as event parameters.
export const measurementId='G-3BCPMT58JK';
const stateKey='__motionStrobeAnalytics';
const sampleIds=new Set(['constant-speed','constant-speed-top','inclined-plane','soccer-free-fall','parabolic-motion','soccer-projectile','hammer','bouncing-ball','two-body-collision','pendulum']);
const eventParameters={
 sample_select:{sample_id:sampleIds},
 video_load:{input_source:new Set(['file','camera','sample'])},
 photo_create:{},video_create:{},
 result_save:{result_kind:new Set(['photo','video','coordinates'])},
 share:{result_kind:new Set(['photo','video'])},
 view_graphs:{},view_coordinates:{}
};
function publishedLocation(href){
 const url=new URL(href);
 const sites=url.origin==='https://motion-strobe-lab.workspace-552571.chatgpt.site';
 const github=url.origin==='https://aniozu.github.io'&&/^\/motion-strobe(?:\/|$)/.test(url.pathname);
 return sites||github?url.origin+url.pathname:null;
}
function referrerOrigin(value){try{return new URL(value).origin;}catch{return '';}}
export function installAnalytics({win=globalThis.window,doc=globalThis.document}={}){
 try{
  if(!win||!doc||win[`ga-disable-${measurementId}`])return false;
  if(win[stateKey])return !win[stateKey].failed;
  const location=publishedLocation(win.location.href);if(!location)return false;
  const state={loaded:false,failed:false,queuedEvents:0};
  win[stateKey]=state;win.dataLayer=win.dataLayer||[];
  win.gtag=win.gtag||function(){win.dataLayer.push(arguments);};
  win.gtag('js',new Date());
  win.gtag('config',measurementId,{
   send_page_view:true,page_location:location,page_referrer:referrerOrigin(doc.referrer),page_title:doc.title,
   allow_google_signals:false,allow_ad_personalization_signals:false
  });
  const script=doc.createElement('script');script.async=true;
  script.src=`https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  script.onload=()=>{state.loaded=true;};script.onerror=()=>{state.failed=true;};
  doc.head.append(script);return true;
 }catch{if(win?.[stateKey])win[stateKey].failed=true;return false;}
}
export function trackUsage(name,parameters={},win=globalThis.window){
 try{
  const state=win?.[stateKey],allowed=Object.hasOwn(eventParameters,name)?eventParameters[name]:null;
  if(!state||state.failed||!allowed||win[`ga-disable-${measurementId}`]||typeof win.gtag!=='function')return false;
  // Blocked or slow third-party loading never holds up app work or grows a queue indefinitely.
  if(!state.loaded&&state.queuedEvents>=50)return false;
  const payload={send_to:measurementId};
  for(const [key,values] of Object.entries(allowed))if(values.has(parameters[key]))payload[key]=parameters[key];
  win.gtag('event',name,payload);if(!state.loaded)state.queuedEvents++;return true;
 }catch{return false;}
}

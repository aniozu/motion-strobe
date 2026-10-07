export async function downloadSample(url,{signal,expectedSize=0,onProgress=()=>{},fetcher=fetch,yieldTurn=()=>new Promise(resolve=>setTimeout(resolve,0))}={}){
 const response=await fetcher(url,{signal});if(!response.ok)throw Error('サンプルを読み込めませんでした。');
 const total=Number(response.headers.get('content-length'))||expectedSize;
 if(!response.body){const blob=await response.blob();onProgress({received:blob.size,total:total||blob.size,value:1});return blob;}
 const reader=response.body.getReader(),chunks=[];let received=0;
 try{
  onProgress({received,total,value:total?0:null});
  while(true){
   if(signal?.aborted)throw new DOMException('Aborted','AbortError');
   const {done,value}=await reader.read();if(done)break;
   chunks.push(value);received+=value.byteLength;onProgress({received,total,value:total?Math.min(.99,received/total):null});await yieldTurn();
  }
  if(signal?.aborted)throw new DOMException('Aborted','AbortError');
  const blob=new Blob(chunks,{type:'video/mp4'});onProgress({received,total:total||received,value:1});return blob;
 }catch(error){await reader.cancel().catch(()=>{});throw error;}
 finally{reader.releaseLock();}
}

// File objects selected from iOS/iPadOS pickers can be backed by a sandboxed
// on-disk path.  WebKit 26 has regressions where passing such a File across a
// subsystem boundary can silently make its bytes unavailable.  File.slice()
// returns a Blob view and avoids the problematic File-backed path without
// eagerly copying a large video into memory.
export function safeVideoBlob(file){
 if(!file||typeof file.slice!=='function')return file;
 const name=String(file.name||'').toLowerCase();
 const inferred=name.endsWith('.mov')?'video/quicktime':name.endsWith('.mp4')||name.endsWith('.m4v')?'video/mp4':'';
 const type=file.type||inferred;
 return file.slice(0,file.size,type);
}

export async function probeVideoBlob(blob,bytes=64*1024){
 if(!blob||!blob.size)return blob;
 const end=Math.min(blob.size,bytes);
 await blob.slice(0,end,blob.type).arrayBuffer();
 return blob;
}

// Cache only original downscaled pixels. Corrected frames never enter this store.
export class PreviewFrameStore {
 constructor(budget=32*1024*1024){this.budget=budget;this.clear();}
 clear(){this.frames=new Map();this.bytes=0;this.format=null;}
 configure(format){if(this.format!==format){this.clear();this.format=format;}}
 get(index){const pixels=this.frames.get(index);if(pixels){this.frames.delete(index);this.frames.set(index,pixels);}return pixels;}
 set(index,pixels){if(pixels.byteLength>this.budget)return;const old=this.frames.get(index);if(old)this.bytes-=old.byteLength;this.frames.delete(index);this.frames.set(index,pixels);this.bytes+=pixels.byteLength;while(this.bytes>this.budget){const first=this.frames.keys().next().value;this.bytes-=this.frames.get(first).byteLength;this.frames.delete(first);}}
}

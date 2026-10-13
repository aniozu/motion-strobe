// Some AVC decoders guess too little B-frame delay when the SPS omits its
// bitstream restriction. Declare the delay recorded in the MP4 sample order.
// Only decoder metadata changes; coded pictures and their timestamps do not.
class Bits{
 constructor(bytes){this.bytes=bytes;this.position=0;}
 read(count=1){if(this.position+count>this.bytes.length*8)throw Error('Truncated SPS');let value=0;for(let n=0;n<count;n++){value=value*2+((this.bytes[this.position>>3]>>(7-(this.position&7)))&1);this.position++;}return value;}
 ue(){let zeros=0;while(!this.read()){if(++zeros>30)throw Error('Invalid SPS integer');}return 2**zeros-1+this.read(zeros);}
 se(){const n=this.ue();return n&1?(n+1)/2:-n/2;}
}
const unsigned=n=>{const bits=(n+1).toString(2);return '0'.repeat(bits.length-1)+bits;};
function skipScalingList(bits,size){let last=8,next=8;for(let n=0;n<size;n++){if(next)next=(last+bits.se()+256)%256;last=next||last;}}
function skipHrd(bits){const count=bits.ue()+1;if(count>32)throw Error('Invalid SPS HRD');bits.read(8);for(let n=0;n<count;n++){bits.ue();bits.ue();bits.read();}bits.read(20);}
function unescape(nal){const bytes=[];for(let n=0;n<nal.length;n++){if(n>1&&nal[n]===3&&nal[n-1]===0&&nal[n-2]===0)continue;bytes.push(nal[n]);}return new Uint8Array(bytes);}
function escape(bytes){const result=[];for(const byte of bytes){if(result.length>1&&result.at(-1)===0&&result.at(-2)===0&&byte<=3)result.push(3);result.push(byte);}return new Uint8Array(result);}
export function avcReorderDepth(samples){
 const ordered=samples.map((s,index)=>({cts:s.cts,index})).sort((a,b)=>a.cts-b.cts);
 return ordered.reduce((depth,s,position)=>Math.max(depth,position-s.index),0);
}
export function declareAvcReordering(nal,depth){
 if((nal[0]&31)!==7||!Number.isInteger(depth)||depth<1||depth>15)return nal;
 try{
  const rbsp=unescape(nal),bits=new Bits(rbsp);bits.read(8);const profile=bits.read(8);bits.read(16);bits.ue();
  if([100,110,122,244,44,83,86,118,128,138,139,134,135].includes(profile)){
   const chroma=bits.ue();if(chroma>3)return nal;if(chroma===3)bits.read();bits.ue();bits.ue();bits.read();
   if(bits.read())for(let n=0;n<(chroma===3?12:8);n++)if(bits.read())skipScalingList(bits,n<6?16:64);
  }
  bits.ue();const orderType=bits.ue();
  if(orderType===0)bits.ue();else if(orderType===1){bits.read();bits.se();bits.se();const count=bits.ue();if(count>256)return nal;for(let n=0;n<count;n++)bits.se();}else if(orderType!==2)return nal;
  const references=bits.ue();if(references>16)return nal;bits.read();bits.ue();bits.ue();const frameOnly=bits.read();if(!frameOnly)return nal;bits.read();
  if(bits.read())for(let n=0;n<4;n++)bits.ue();
  if(!bits.read())return nal; // Leave streams without VUI untouched.
  if(bits.read()&&bits.read(8)===255)bits.read(32);
  if(bits.read())bits.read();
  if(bits.read()){bits.read(4);if(bits.read())bits.read(24);}
  if(bits.read()){bits.ue();bits.ue();}
  if(bits.read()){bits.read(32);bits.read(32);bits.read();}
  const nalHrd=bits.read();if(nalHrd)skipHrd(bits);const vclHrd=bits.read();if(vclHrd)skipHrd(bits);if(nalHrd||vclHrd)bits.read();bits.read();
  const restrictionPosition=bits.position;if(bits.read())return nal; // Respect existing restrictions.
  const prefix=Array.from(rbsp,b=>b.toString(2).padStart(8,'0')).join('').slice(0,restrictionPosition);
  // Conservative size/vector bounds, exact reorder delay, and enough DPB slots
  // for both the stream's references and delayed output. Preserve all prior VUI.
  let output=prefix+'11'+[0,0,16,16,depth,Math.max(references,depth+1)].map(unsigned).join('')+'1';
  output=output.padEnd(Math.ceil(output.length/8)*8,'0');
  return escape(Uint8Array.from({length:output.length/8},(_,n)=>parseInt(output.slice(n*8,n*8+8),2)));
 }catch{return nal;}
}
export function normalizeAvcReordering(config,samples){
 if(!/^avc1\./.test(config.codec)||!config.description)return config;
 const depth=avcReorderDepth(samples);if(!depth||depth>15)return config;
 const source=config.description instanceof ArrayBuffer?new Uint8Array(config.description):new Uint8Array(config.description.buffer,config.description.byteOffset,config.description.byteLength);
 if(source.length<7||source[0]!==1)return config;
 try{
  const parts=[source.subarray(0,6)];let position=6,changed=false;
  for(let n=0;n<(source[5]&31);n++){
   if(position+2>source.length)return config;const size=source[position]*256+source[position+1];position+=2;if(position+size>source.length)return config;
   const original=source.subarray(position,position+size),fixed=declareAvcReordering(original,depth);position+=size;changed||=fixed!==original;
   if(fixed.length>65535)return config;parts.push(new Uint8Array([fixed.length>>8,fixed.length&255]),fixed);
  }
  if(!changed)return config;parts.push(source.subarray(position));
  const description=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const part of parts){description.set(part,offset);offset+=part.length;}
  return {...config,description};
 }catch{return config;}
}

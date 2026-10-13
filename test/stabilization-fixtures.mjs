import {warpPixels,identityTransform,transformPoint} from '../src/stabilization.js';
export const width=320,height=192;
export function cameraMatrix({dx=0,dy=0,angle=0,scale=1}={},w=width,h=height){const a=scale*Math.cos(angle),b=scale*Math.sin(angle);return [a,b,-b,a,w/2-a*w/2+b*h/2+dx,h/2-b*w/2-a*h/2+dy];}
export function texturedBackground(w=width,h=height){
 const result=new Uint8ClampedArray(w*h*4);let seed=98311;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const tiles=Array.from({length:Math.ceil(w/16)*Math.ceil(h/16)},()=>[50+random()*125,60+random()*120,70+random()*110]);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const tile=tiles[Math.floor(y/16)*Math.ceil(w/16)+Math.floor(x/16)],value=10*Math.sin(x*.31)+6*Math.cos(y*.43)+random()*3;result.set([...tile.map(c=>c+value),255],(y*w+x)*4);}
 return result;
}
export function movingObject(background,x,y,radius=12,w=width,h=height){const frame=new Uint8ClampedArray(background);for(let yy=Math.max(0,Math.floor(y-radius));yy<Math.min(h,y+radius+1);yy++)for(let xx=Math.max(0,Math.floor(x-radius));xx<Math.min(w,x+radius+1);xx++)if(Math.hypot(xx-x,yy-y)<=radius)frame.set([242,25,28,255],(yy*w+xx)*4);return frame;}
export function transformed(frame,m,w=width,h=height,brightness=0){const out=warpPixels(frame,w,h,m);for(let p=0;p<out.length;p+=4)if(out[p+3])for(let c=0;c<3;c++)out[p+c]+=brightness;return out;}
export function errorAtGrid(actual,expected,w=width,h=height){let sum=0,max=0,n=0;for(let y=h*.2;y<h*.9;y+=h*.2)for(let x=w*.15;x<w*.9;x+=w*.2){const a=transformPoint(actual,x,y),b=transformPoint(expected,x,y),error=Math.hypot(a.x-b.x,a.y-b.y);sum+=error;max=Math.max(max,error);n++;}return {mean:sum/n,max};}
export function series(count=12){const bg=texturedBackground(),frames=[],truth=[];for(let n=0;n<count;n++){const object={x:50+n*13,y:130-55*Math.sin(n/count*Math.PI)},matrix=n===0?identityTransform():cameraMatrix({dx:9*Math.sin(n*1.7),dy:6*Math.cos(n*1.3),angle:.02*Math.sin(n),scale:1+.006*Math.sin(n*.6)});frames.push(transformed(movingObject(bg,object.x,object.y),matrix,width,height,n%4));truth.push({object,matrix});}return {bg,frames,truth};}

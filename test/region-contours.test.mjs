import test from 'node:test';
import assert from 'node:assert/strict';
import {regionContours} from '../src/region-contours.js';

function includes(loops,x,y){
 let selected=false;
 for(const loop of loops)for(let i=0,j=loop.length-2;i<loop.length;j=i,i+=2){
  const ax=loop[i],ay=loop[i+1],bx=loop[j],by=loop[j+1];
  if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)selected=!selected;
 }
 return selected;
}
const area=loops=>loops.reduce((sum,loop)=>sum+loop.reduce((a,x,i)=>i%2?a:a+x*loop[(i+3)%loop.length]-loop[(i+2)%loop.length]*loop[i+1],0)/2,0);
function check(points,width,height){
 const pixels=Uint32Array.from(points.map(([x,y])=>y*width+x)),selected=new Set(pixels);
 const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);
 const loops=regionContours(pixels,width,{x,y,w:Math.max(...xs)-x+1,h:Math.max(...ys)-y+1});
 for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++)assert.equal(includes(loops,xx+.5,yy+.5),selected.has(yy*width+xx),`mask differs at ${xx},${yy}`);
 assert.equal(area(loops),pixels.length);return loops;
}
test('the outline preserves a concave L instead of filling its bounding rectangle or convex hull',()=>{
 const points=[];for(let y=2;y<9;y++)for(let x=3;x<11;x++)if(x<6||y>5)points.push([x,y]);
 const loops=check(points,16,12);assert.equal(loops.length,1);assert.equal(loops[0].length,12);
});
test('holes remain outside the recognized region',()=>{
 const points=[];for(let y=1;y<9;y++)for(let x=2;x<11;x++)if(!(x>=5&&x<=7&&y>=3&&y<=5))points.push([x,y]);
 assert.equal(check(points,15,12).length,2);
});
test('diagonally touching pixels form exact separate loops without a self-crossing fill',()=>{
 assert.equal(check([[1,1],[2,2],[3,1],[4,2],[1,3],[2,4]],7,7).length,6);
});
test('empty regions and image-edge pixels retain valid closed outlines',()=>{
 assert.deepEqual(regionContours([],10,{x:0,y:0,w:0,h:0}),[]);
 check([[0,0],[1,0],[0,1],[8,6],[9,6]],10,7);
});

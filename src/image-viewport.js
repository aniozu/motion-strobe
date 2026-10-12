const clamp=(v,low,high)=>Math.max(low,Math.min(high,v));
// Source-pixel coordinates stay independent of the displayed crop and CSS size.
export class ImageViewport{
 constructor(width=1,height=1){this.reset(width,height);}
 reset(width=this.width,height=this.height){this.width=width;this.height=height;this.scale=1;this.x=width/2;this.y=height/2;}
 point(x,y){return {x:(x-this.width/2)/this.scale+this.x,y:(y-this.height/2)/this.scale+this.y};}
 bound(){const halfW=this.width/(2*this.scale),halfH=this.height/(2*this.scale);this.x=clamp(this.x,halfW,this.width-halfW);this.y=clamp(this.y,halfH,this.height-halfH);}
 zoom(factor,px=this.width/2,py=this.height/2){const before=this.point(px,py);this.scale=clamp(this.scale*factor,1,8);this.x=before.x-(px-this.width/2)/this.scale;this.y=before.y-(py-this.height/2)/this.scale;this.bound();}
 pan(dx,dy){this.x-=dx/this.scale;this.y-=dy/this.scale;this.bound();}
 gesture(previous,current){const anchor=this.point(previous.x,previous.y);this.scale=clamp(this.scale*current.distance/Math.max(1,previous.distance),1,8);this.x=anchor.x-(current.x-this.width/2)/this.scale;this.y=anchor.y-(current.y-this.height/2)/this.scale;this.bound();}
}

let context;
export function bindTimeInputFit(input,maximum=16){
 function update(){
  input.style.fontSize=`${maximum}px`;
  if(!input.clientWidth)return;
  const style=getComputedStyle(input),available=input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)-1;
  context??=document.createElement('canvas').getContext('2d');if(!context||available<=0)return;
  context.font=`${style.fontStyle} ${style.fontWeight} ${maximum}px ${style.fontFamily}`;
  // All digits use the input's tabular width; the decimal point stays narrower.
  const width=context.measureText(input.value.replace(/\d/g,'0')).width;
  const size=width>available?Math.floor(maximum*available/width*10)/10:maximum;
  input.style.fontSize=`${Math.max(1,size)}px`;
 }
 input.addEventListener('input',update);
 if(typeof ResizeObserver!=='undefined')new ResizeObserver(update).observe(input);
 update();return {update};
}

// Completed automatic runs replay with the user's hint, or discover again when
// the run had no hint. Selected-point tracking still requires a marked point.
export function automaticReplayPlan(objects,count){
 return objects.flatMap(object=>{
  if(!object.autoEnabled)return [];
  const anchors=object.anchors.filter(mark=>mark.source!=='auto');
  const valid=mark=>Number.isInteger(mark.index)&&mark.index>=0&&mark.index<count&&mark.mode==='center'&&[mark.x,mark.y].every(Number.isFinite);
  const seed=anchors.find(mark=>mark.index===object.seedIndex&&valid(mark))||anchors.find(valid);
  if(seed)return [{objectId:object.id,seedIndex:seed.index,anchors}];
  return object.trackingMode!=='point'&&!anchors.some(a=>a.mode==='center')?[{objectId:object.id,seedIndex:null,anchors}]:[];
 });
}

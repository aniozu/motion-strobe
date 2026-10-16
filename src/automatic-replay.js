// Only objects with a completed automatic run and a real, retained seed opt in.
export function automaticReplayPlan(objects,count){
 return objects.flatMap(object=>{
  if(!object.autoEnabled)return [];
  const anchors=object.anchors.filter(mark=>mark.source!=='auto');
  const valid=mark=>Number.isInteger(mark.index)&&mark.index>=0&&mark.index<count&&mark.mode==='center'&&[mark.x,mark.y].every(Number.isFinite);
  const seed=anchors.find(mark=>mark.index===object.seedIndex&&valid(mark))||anchors.find(valid);
  return seed?[{objectId:object.id,seedIndex:seed.index,anchors}]:[];
 });
}

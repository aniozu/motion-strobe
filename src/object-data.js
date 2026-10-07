export function objectView(data={},id=0){
 if(!data.objects)return data;
 const object=data.objects.find(o=>o.id===id)||{id,centers:[]};
 return {...data,...object,originCenter:data.originCenter===undefined?data.objects.find(o=>o.id===0)?.centers?.[0]:data.originCenter,objects:undefined};
}
export function objectSeries(data={},includeEmpty=false){
 if(!data.objects)return [{id:0,data}];
 return data.objects.filter(o=>includeEmpty||o.id===0||o.centers.some(p=>p.confidence!=='unset'))
  .map(o=>({id:o.id,data:objectView(data,o.id)}));
}
export function allObjectCenters(data={}){
 return data.objects?data.objects.flatMap(o=>o.centers.map(p=>({...p,objectId:o.id}))):data.centers||[];
}

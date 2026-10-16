// Center measurements and selected-point measurements must never be mixed.
// Switching methods preserves both sets, including all manual corrections.
export function switchTrackingMethod(object,mode){
 const next=mode==='point'?'point':'center',previous=object.trackingMode||'center';
 if(next===previous)return;
 const methods=object.trackingMethods||(object.trackingMethods={});
 methods[previous]={anchors:object.anchors,seedIndex:object.seedIndex,summary:object.summary,autoEnabled:!!object.autoEnabled};
 Object.assign(object,methods[next]||{anchors:[],seedIndex:null,summary:null,autoEnabled:false},{trackingMode:next});
}

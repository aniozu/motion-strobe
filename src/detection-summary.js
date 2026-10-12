export function detectionSummary(marks){
 const summary={total:marks.length,successful:0,automatic:0,fixed:0,missing:0,uncertain:0,skipped:0};
 for(const mark of marks){
  if(mark.mode==='skip'){summary.skipped++;continue;}
  if(mark.mode!=='center'||!Number.isFinite(mark.x)||!Number.isFinite(mark.y)){summary.missing++;continue;}
  if(mark.source==='auto'&&mark.uncertain){summary.uncertain++;continue;}
  summary.successful++;if(mark.source==='auto')summary.automatic++;else summary.fixed++;
 }
 return summary;
}

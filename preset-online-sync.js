// Shared Firestore-safe preset persistence. No browser-local document storage.
export function encodePreset(value,nested=false){
 if(value===undefined)return null;
 if(Array.isArray(value)){
  const entries=value.map(v=>encodePreset(v,true));
  return nested?{nestedArrayData:entries}:entries;
 }
 if(value&&typeof value==='object'){
  const result={};
  for(const [key,entry] of Object.entries(value)){
   if(entry!==undefined)result[key]=encodePreset(entry);
  }
  return result;
 }
 return value;
}
export function decodePreset(value){
 if(Array.isArray(value))return value.map(decodePreset);
 if(value&&typeof value==='object'){
  if(Object.keys(value).length===1&&Array.isArray(value.nestedArrayData))
   return value.nestedArrayData.map(decodePreset);
  return Object.fromEntries(Object.entries(value).map(([key,entry])=>[key,decodePreset(entry)]));
 }
 return value;
}
export function reportPresetSaved(number,id,date=''){
 if(window.parent!==window){
  window.parent.postMessage({type:'docsystem-preset-saved',number:String(number||''),id:String(id||''),date:String(date||'')},location.origin);
 }
}
export function reportPresetSaveError(error){
 const description=String(error?.code||error?.message||error||'Unknown Firebase error');
 if(window.parent!==window){
  window.parent.postMessage({type:'docsystem-preset-save-error',message:description},location.origin);
 }
}

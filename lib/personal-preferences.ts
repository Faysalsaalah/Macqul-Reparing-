export type PersonalPreferences={textSize:'standard'|'large';reduceMotion:boolean;saveConfirmations:boolean};
export const defaultPreferences:PersonalPreferences={textSize:'standard',reduceMotion:false,saveConfirmations:true};
export const preferenceEvent='maqul-personal-preferences';
const key=(userId:string)=>'maqul-preferences-'+userId;
export function readPreferences(userId:string):PersonalPreferences{
 try{const value=JSON.parse(localStorage.getItem(key(userId))??'{}');return {textSize:value.textSize==='large'?'large':'standard',reduceMotion:value.reduceMotion===true,saveConfirmations:value.saveConfirmations!==false};}catch{return {...defaultPreferences}}
}
export function savePreferences(userId:string,preferences:PersonalPreferences){
 localStorage.setItem(key(userId),JSON.stringify(preferences));window.dispatchEvent(new Event(preferenceEvent));
}

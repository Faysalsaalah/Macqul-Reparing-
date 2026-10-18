import type {Settings,Status} from './domain';

export const extraSettingsDefaults={
 tagline:'Workshop Console',email:'',website:'',locale:'en-US',
 accessories:'Device Only, Charger, Cable, Charger and Cable, Case, Charger and Case, Other (describe in notes)',
 receiptContact:true,showImei:false,showTechnician:false,showDiagnosis:false,
 statusRegistered:'Registered',statusChecking:'Checking',statusNeedParts:'Need Parts',statusRepairing:'Repairing',statusReady:'Ready',statusPickedUp:'Picked Up',statusCancelled:'Cancelled',statusCannotFix:'Cannot Fix',
};
export type ExtraSettings=typeof extraSettingsDefaults;
export const resolvedSettings=(settings:Settings)=>({...extraSettingsDefaults,...settings});
export const settingList=(text:string)=>Array.from(new Set(text.split(',').map(s=>s.trim()).filter(Boolean)));
export const statusSettingKeys:Record<Status,keyof ExtraSettings>={Received:'statusRegistered',Diagnosing:'statusChecking','Waiting for Parts':'statusNeedParts','In Progress':'statusRepairing','Ready for Pickup':'statusReady',Collected:'statusPickedUp',Cancelled:'statusCancelled',Unrepairable:'statusCannotFix'};
export function configuredStatusLabel(value:string,settings:Settings){const key=statusSettingKeys[value as Status];return key?String(resolvedSettings(settings)[key]):value;}

export function validateSettings(candidate:Settings,before:Settings,hasTransactions:boolean):Settings {
 const previous=resolvedSettings(before),next=resolvedSettings(candidate);
 if(!candidate||Object.keys(candidate).some(key=>!Object.hasOwn(previous,key)))throw Error('Unknown shop setting.');
 for(const [key,value] of Object.entries(previous))if(typeof next[key as keyof typeof next]!==typeof value)throw Error('Invalid shop setting: '+key);
 for(const value of Object.values(next))if(typeof value==='string'&&value.length>6000)throw Error('Settings text is too long.');
 if(!next.name.trim())throw Error('Enter the shop name.');
 if(!/^[A-Za-z0-9]{1,10}$/.test(next.prefix))throw Error('Use 1–10 letters or numbers for the repair prefix.');
 if(!Number.isSafeInteger(next.next)||next.next<1)throw Error('Next number must be a positive whole number.');
 if(!Number.isSafeInteger(next.promised)||next.promised<0||next.promised>365)throw Error('Promised time must be 0–365 whole days.');
 if(!['USD','KES','EUR','GBP','SOS'].includes(next.currency))throw Error('Unsupported currency.');
 if(hasTransactions&&next.currency!==before.currency)throw Error('Currency is locked because transactions exist.');
 if(!['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY'].includes(next.dateFormat))throw Error('Invalid date format.');
 try{new Intl.DateTimeFormat('en',{timeZone:next.timezone})}catch{throw Error('Enter a valid timezone.');}
 if(!['en-US','en-GB','so-SO','ar-SA'].includes(next.locale))throw Error('Select a supported number format.');
 if(next.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next.email))throw Error('Enter a valid shop email.');
 if(next.website){try{const url=new URL(next.website);if(!['http:','https:'].includes(url.protocol))throw Error();}catch{throw Error('Enter a website starting with https:// or http://.');}}
 for(const key of ['brands','issues','methods','categories','accessories'] as const){const items=settingList(next[key]);if(!items.length||items.length>80||items.some(x=>x.length>100))throw Error('Enter 1–80 '+key+' with up to 100 characters each.');next[key]=items.join(', ');}
 const labels=Object.values(statusSettingKeys).map(key=>String(next[key]).trim());
 if(labels.some(x=>!x||x.length>40)||new Set(labels.map(x=>x.toLowerCase())).size!==labels.length)throw Error('Use distinct status names with 1–40 characters each.');
 for(const key of Object.values(statusSettingKeys))Object.assign(next,{[key]:String(next[key]).trim()});
 return next;
}

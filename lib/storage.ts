import {Data, seed, statuses} from './domain';
import {validateSettings} from './settings';
const KEY='macqul-demo-v1';
export interface Repository {load():{data:Data;warning?:string};save(data:Data):void;reset():Data}
export const repository:Repository={load(){try{const raw=localStorage.getItem(KEY);if(!raw)return {data:seed()};const d=JSON.parse(raw);if(!valid(d)||d.version!==1||!d.settings||!Number.isInteger(d.settings.next)||!['users','customers','vendors','repairs','parts','orders','usage','customerPayments','vendorPayments','expenses','activity','movements'].every(k=>Array.isArray(d[k as keyof Data]))||d.repairs.some((r:Data['repairs'][number])=>typeof r.number!=='string'||(r.price!==null&&!Number.isSafeInteger(r.price))))throw Error();return {data:d};}catch{return {data:seed(),warning:'Stored data could not be loaded. A fresh demo is shown. Changes may only last for this session.'};}},save(data){const raw=JSON.stringify(data);if(raw.length>3500000)throw Error('Demo storage limit reached (3.5 MB). Use smaller images.');try{localStorage.setItem(KEY,raw);}catch{throw Error('Browser storage is unavailable or full. This change was not saved.');}},reset(){const d=seed();this.save(d);return d;}};

function valid(value:unknown):value is Data {
 if(!value||typeof value!=='object')return false;
 const d=value as Data; const template=seed();
 if(!d.settings||Object.entries(template.settings).some(([k,v])=>typeof (d.settings as unknown as Record<string,unknown>)[k]!==typeof v))return false;
 const keys=['users','customers','vendors','repairs','parts','orders','usage','customerPayments','vendorPayments','expenses','activity','movements','statusHistory'] as const;
 for(const key of keys){if(!Array.isArray(d[key]))return false;const example=template[key][0];for(const item of d[key]){if(!item||typeof item!=='object'||typeof item.id!=='string')return false;if(example&&Object.entries(example).some(([k,v])=>typeof (item as unknown as Record<string,unknown>)[k]!==typeof v&&!(key==='repairs'&&k==='price'&&(item as unknown as {price:number|null}).price===null)))return false;}if(new Set(d[key].map(x=>x.id)).size!==d[key].length)return false;}
 if(d.repairs.some(r=>!statuses.includes(r.status)||!d.customers.some(c=>c.id===r.customerId)||!d.users.some(u=>u.id===r.userId)))return false;
 if(d.orders.some(o=>!d.vendors.some(v=>v.id===o.vendorId)||!d.parts.some(p=>p.id===o.partId)||o.received<0||o.received>o.quantity||o.returned<0||o.returned>o.received))return false;
 if(d.usage.some(u=>!d.orders.some(o=>o.id===u.orderId)||!d.repairs.some(r=>r.id===u.repairId)||!Number.isSafeInteger(u.cost)||!Number.isInteger(u.quantity)||u.quantity<=0))return false;
 if([...d.customerPayments,...d.vendorPayments,...d.expenses].some(p=>!Number.isSafeInteger(p.amount)||typeof p.date!=='string'))return false;
 if(d.orders.some(o=>o.received-o.returned-d.usage.filter(u=>u.orderId===o.id).reduce((s,u)=>s+u.quantity,0)<0))return false;
 try{validateSettings(d.settings,d.settings,true);}catch{return false;}
 return new Set(d.repairs.map(r=>r.number)).size===d.repairs.length;
}

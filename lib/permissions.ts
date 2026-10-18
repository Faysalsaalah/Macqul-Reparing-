import type {Data} from './domain';
export const permissionModules=[['dashboard','Dashboard'],['repairs','Repairs'],['customers','Customers'],['parts','Parts and Orders'],['vendors','Vendors'],['payments','Payments and Debts'],['expenses','Expenses'],['reports','Reports'],['users','Users and Activity'],['activity','Activity'],['settings','Settings']] as const;
export type Access={admin:boolean;technical:boolean;grants:string[]};
export const can=(access:Access,module:string,action='view')=>access.admin||(access.grants.includes(module+'.enable')&&access.grants.includes(module+'.'+action)&&(action==='enable'||action==='view'||access.grants.includes(module+'.view')));
export const pageModule=(page:string)=>page==='New Repair'?'repairs':permissionModules.find(([,name])=>name===page)?.[0];
export const collectionModules={users:'users',customers:'customers',vendors:'vendors',repairs:'repairs',parts:'parts',orders:'parts',usage:'parts',customerPayments:'payments',vendorPayments:'payments',expenses:'expenses'} as const;
export function checkChanges(before:Data,candidate:Data,access:Access,actor:string,action:string){
 if(access.admin)return;
 for(const [key,module] of Object.entries(collectionModules) as [keyof typeof collectionModules,string][]){
  for(const row of candidate[key]){const previous=before[key].find(item=>item.id===row.id);if(JSON.stringify(row)===JSON.stringify(previous))continue;
   if(!can(access,module,previous||key==='usage'||action==='reverse'?'edit':'create'))throw Error(`You do not have permission to ${previous?'edit':'create'} ${module}.`);
   if(key==='users'&&('role' in row&&row.role==='Admin'||previous&&'role' in previous&&previous.role==='Admin'||row.id===actor))throw Error('Only Admin can change privileged accounts.');
   if(key==='repairs'&&previous){const member=before.users.find(user=>user.id===actor);if(member?.repairScope!=='all'&&'userId' in previous&&previous.userId!==actor)throw Error('This repair is outside your Repair Access scope.');}
  }
 }
 if(action==='settings'&&!can(access,'settings','edit'))throw Error('Settings edit permission required.');
 if(action==='reverse'&&!can(access,'payments','edit'))throw Error('Payment edit permission required for refunds.');
}
/** Reports and business Dashboard explicitly include financial records. Repair
 * access includes customer/assignee lookup and its own balance/cost summaries. */
export function projectWorkspace(source:Data,actor:string,access:Access):Data{
 const d=structuredClone(source);d.access=access;if(access.admin)return d;
 const broad=can(access,'reports')||can(access,'dashboard');
 const repairs=broad||can(access,'repairs')||can(access,'payments')||can(access,'parts')||can(access,'customers');
 const member=source.users.find(user=>user.id===actor);
 if(!repairs)d.repairs=[];else if(!broad&&member?.repairScope!=='all')d.repairs=d.repairs.filter(row=>row.userId===actor);
 const ids=new Set(d.repairs.map(row=>row.id));
 if(!broad&&!can(access,'customers'))d.customers=d.customers.filter(row=>d.repairs.some(repair=>repair.customerId===row.id));
 if(!broad&&!can(access,'vendors')&&!can(access,'parts')&&!can(access,'payments'))d.vendors=[];
 if(!broad&&!can(access,'parts')&&!can(access,'vendors')&&!can(access,'payments')){d.parts=[];d.orders=[];d.movements=[];}
 if(!broad&&!can(access,'payments')){
  // Summaries needed for repair balances; never expose payment history/actors.
  d.customerPayments=d.repairs.flatMap(repair=>{const amount=source.customerPayments.filter(p=>p.targetId===repair.id).reduce((n,p)=>n+p.amount,0);return amount?[{id:'summary-'+repair.id,targetId:repair.id,amount,date:'',method:'Summary',reference:'',notes:'',userId:''}]:[];});
  d.vendorPayments=can(access,'vendors')||can(access,'parts')?d.vendors.flatMap(v=>{const amount=source.vendorPayments.filter(p=>p.targetId===v.id).reduce((n,p)=>n+p.amount,0);return amount?[{id:'summary-'+v.id,targetId:v.id,amount,date:'',method:'Summary',reference:'',notes:'',userId:''}]:[];}):[];
 }else if(!broad)d.customerPayments=d.customerPayments.filter(p=>ids.has(p.targetId));
 if(!broad&&!can(access,'expenses'))d.expenses=[];
 if(!can(access,'activity'))d.activity=[];
 if(!can(access,'users'))d.users=d.users.filter(user=>repairs||user.id===actor).map(user=>({id:user.id,name:user.name,role:user.role,active:user.active,...(user.id===actor?{repairScope:user.repairScope}:{})}));
 if(!broad)d.usage=d.usage.filter(u=>ids.has(u.repairId));
 d.statusHistory=d.statusHistory.filter(row=>ids.has(row.repairId));
 return d;
}
/** Overlay only changes to the exact visible projection, retaining hidden rows.
 * Synthetic summaries are immutable; forged hidden IDs cannot overwrite data. */
export function mergeCandidate(full:Data,submitted:Data,actor:string,access:Access,action=''):Data{
 const visible=projectWorkspace(full,actor,access),next=structuredClone(full);
 for(const key of Object.keys(collectionModules) as (keyof typeof collectionModules)[]){
  if(!Array.isArray(submitted[key]))throw Error('Invalid records.');
  const baseline=visible[key] as {id:string}[],incoming=submitted[key] as {id:string}[];
  if(baseline.some(row=>!incoming.some(item=>item.id===row.id)))throw Error('Records cannot be deleted.');
  for(const row of incoming){const previous=baseline.find(item=>item.id===row.id);if(JSON.stringify(row)===JSON.stringify(previous))continue;
   if(row.id.startsWith('summary-'))throw Error('Balance summaries cannot be edited.');
   const rows=next[key] as {id:string}[],index=rows.findIndex(item=>item.id===row.id);
   if(index>=0&&!previous)throw Error('Cannot change a hidden record.');
   // Membership projections omit other users’ repair scope; preserve it.
   const value=key==='users'&&index>=0?{...rows[index],...row}:row;
   if(index>=0)rows[index]=value;else rows.push(value);
  }
 }
 next.settings=submitted.settings;
 checkChanges(full,next,access,actor,action);return next;
}

import {settingList,validateSettings} from './settings';
import {checkChanges} from './permissions';
import {Data, Repair, User, authorize, balance, id, numberRepair, obligation, paid, setStatus, statuses, stock, sum, today, validatePayment, vendorBalance} from './domain';

export type Mutation = {action:string;record:string;candidate:Data;revision:number;requestId:string;allowDebt?:boolean};
type Row = {id:string};
const collections = ['users','customers','vendors','repairs','parts','orders','usage','customerPayments','vendorPayments','expenses'] as const;
type Collection = typeof collections[number];
const same = (a:unknown,b:unknown) => JSON.stringify(a) === JSON.stringify(b);
const fail = (message:string):never => {throw new Error(message)};
const text = (v:unknown,max=3000,required=false):string => typeof v==='string'&&v.length<=max&&(!required||!!v.trim())?v.trim():fail('Invalid text field.');
const uuid = (v:unknown):string => typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)?v:fail('Invalid record ID.');
const integer = (v:unknown,min=0):number => typeof v==='number'&&Number.isSafeInteger(v)&&v>=min?v:fail('Invalid amount or quantity.');
const date = (v:unknown):string => {const s=text(v,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)fail('Enter a valid date.');return s;};
const bool = (v:unknown):boolean => typeof v==='boolean'?v:fail('Invalid confirmation.');
function image(v:unknown):string|undefined {
 if(v===undefined||v==='')return undefined;
 const s=text(v,480000,true);const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(s);
 if(!m)fail('Use a PNG, JPEG or WebP image.');
 const bytes=Uint8Array.from(atob(m![2]),c=>c.charCodeAt(0));
 if(bytes.length>350000)fail('Images must be smaller than 350 KB.');
 const signature=m![1]==='png'?bytes[0]===137&&bytes[1]===80&&bytes[2]===78&&bytes[3]===71:m![1]==='jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
 if(!signature)fail('The image contents do not match the image type.');return s;
}
function delta<T extends Row>(before:T[],after:T[]) {
 if(!Array.isArray(after)||after.length>100000)fail('Invalid records.');
 if(after.some(row=>!row||typeof row!=='object'||typeof row.id!=='string'))fail('Invalid record.');
 if(new Set(after.map(x=>x.id)).size!==after.length)fail('Duplicate IDs.');
 if(before.some(x=>!after.some(y=>y.id===x.id)))fail('Records cannot be deleted.');
 return after.filter(x=>!same(x,before.find(y=>y.id===x.id)));
}
function one<T>(items:T[]):T {return items.length===1?items[0]:fail('One record must be changed at a time.');}
function onlyFields(before:object,after:object,allowed:string[]) {
 for(const key of new Set([...Object.keys(before),...Object.keys(after)])) {
  if(!allowed.includes(key)&&!same((before as Record<string,unknown>)[key],(after as Record<string,unknown>)[key]))fail(`Field ${key} cannot be changed by this action.`);
 }
}
function save<T extends Row>(items:T[],item:T){const index=items.findIndex(x=>x.id===item.id);if(index<0)items.push(item);else items[index]=item;}
function requireReference<T extends Row>(items:T[],ref:unknown):T {return items.find(x=>x.id===ref)??fail('The referenced record does not exist in this shop.');}

/** Rebuild every mutation from authoritative records. Never persist client totals,
 * completion snapshots, role claims, audit logs, stock balances or numbering. */
export function applyCloudMutation(before:Data,actorId:string,request:Mutation):Data {
 if(!request||!request.candidate||!collections.every(k=>Array.isArray(request.candidate[k])))fail('Invalid request.');
 authorize(before,actorId,request.action);
 if(before.access&&!before.access.technical)checkChanges(before,request.candidate,before.access,actorId,request.action);
 const next=structuredClone(before), proposed=request.candidate;
 const changed=Object.fromEntries(collections.map(k=>[k,delta(before[k] as Row[],proposed[k] as Row[])])) as Record<Collection,Row[]>;
 const allowed:Record<string,Collection[]>={contact:['customers','vendors'],repair:['repairs','customers','customerPayments'],status:['repairs'],payment:['customerPayments'],vendorPayment:['vendorPayments'],reverse:['customerPayments','vendorPayments'],order:['orders','parts'],stock:['orders','usage'],catalog:['parts'],expense:['expenses'],users:['users'],settings:[]};
 if(!allowed[request.action])fail('Unknown action.');
 for(const k of collections)if(changed[k].length&&!allowed[request.action].includes(k))fail('This action cannot change those records.');
 if(!['repair','settings'].includes(request.action)&&!same(before.settings,proposed.settings))fail('Shop settings cannot be changed by this action.');
 let record=text(request.record,200);
 if(request.action==='contact'){
  if(changed.customers.length+changed.vendors.length!==1)fail('Change one contact at a time.');
  const key=changed.customers.length?'customers':'vendors';const p=one(proposed[key].filter(x=>changed[key].some(c=>c.id===x.id)));
  save(next[key],{id:uuid(p.id),name:text(p.name,120,true),phone:text(p.phone,60,true),notes:text(p.notes)});record=p.name;
 }else if(request.action==='repair'){
  const p=one(proposed.repairs.filter(x=>changed.repairs.some(c=>c.id===x.id))),old=before.repairs.find(x=>x.id===p.id);
  const price=p.price===null?null:integer(p.price);
  if(old){
   if(changed.customers.length||changed.customerPayments.length)fail('Use the contact and payment actions separately.');
   onlyFields(old,p,['brand','model','issue','issueCategory','imei','condition','accessories','notes','diagnosis','userId','due','price']);
   if(old.completed&&price!==old.price)fail('Total Price is locked after completion.');
   if(price===null&&paid(before,p.id)>0||price!==null&&price<paid(before,p.id))fail('Total Price cannot be below payments already received.');
  }else{
   uuid(p.id);if(changed.customers.length>1||changed.customerPayments.length>1)fail('Invalid intake records.');
   if(changed.customers.length){const c=one(proposed.customers.filter(x=>changed.customers.some(a=>a.id===x.id)));if(before.customers.some(x=>x.id===c.id))fail('Intake cannot edit existing customers.');next.customers.push({id:uuid(c.id),name:text(c.name,120,true),phone:text(c.phone,60,true),notes:''});}
  }
  requireReference(next.customers,p.customerId);const assigned=requireReference(next.users,p.userId);if(!assigned.active&&p.userId!==old?.userId)fail('Assign an active technician.');
  const accessories=text(p.accessories,300);if(/device only/i.test(accessories)&&/charger|cable|case/i.test(accessories))fail('Device Only cannot be combined with accessories.');
  const r:Repair={...(old??{} as Repair),id:old?.id??p.id,number:old?.number??numberRepair(next),customerId:old?.customerId??p.customerId,created:old?.created??today(before.settings.timezone),status:old?.status??'Received',price,brand:text(p.brand,80,true),model:text(p.model,120,true),issue:text(p.issue,3000,true),issueCategory:text(p.issueCategory??'',120),imei:text(p.imei,50),condition:text(p.condition,1000),accessories,notes:text(p.notes),diagnosis:text(p.diagnosis),userId:p.userId,due:date(p.due),photo:old?.photo??image(p.photo)};
  save(next.repairs,r);record=r.number;
  if(!old){next.statusHistory.push({id:id(),repairId:r.id,from:null,to:'Received',userId:actorId,date:new Date().toISOString()});if(changed.customerPayments.length){const payment=one(proposed.customerPayments.filter(x=>changed.customerPayments.some(c=>c.id===x.id)));if(payment.targetId!==r.id||payment.originalId||price===null)fail('A deposit requires a quoted repair.');validatePayment(integer(payment.amount,1),price??fail('A deposit requires Total Price.'));next.customerPayments.push({id:uuid(payment.id),targetId:r.id,amount:payment.amount,date:today(before.settings.timezone),method:method(payment.method,before.settings.methods),reference:text(payment.reference,200),notes:'Intake deposit',userId:actorId});}}
 }else if(request.action==='status'){
  const p=one(proposed.repairs.filter(x=>changed.repairs.some(c=>c.id===x.id)));const old=requireReference(before.repairs,p.id);
  onlyFields(old,p,['status','completed','revenue','recognizedCost','collected','handover']);
  if(!statuses.includes(p.status))fail('Unknown repair status.');
  setStatus(next,requireReference(next.repairs,p.id),p.status,actorId,request.allowDebt===true);record=old.number;
 }else if(['payment','vendorPayment','reverse'].includes(request.action)){
  const key=changed.vendorPayments.length?'vendorPayments':'customerPayments';
  if(changed.customerPayments.length+changed.vendorPayments.length!==1)fail('Submit one payment at a time.');
  if(request.action==='payment'&&key!=='customerPayments'||request.action==='vendorPayment'&&key!=='vendorPayments')fail('Invalid payment action.');
  const p=one(proposed[key].filter(x=>changed[key].some(c=>c.id===x.id)));
  if(before[key].some(x=>x.id===p.id))fail('Financial history cannot be edited.');
  const vendor=key==='vendorPayments';let amount:number;
  if(request.action==='reverse'){
   const original=requireReference(before[key],p.originalId);if(original.amount<=0)fail('Only original payments can be reversed.');
   amount=-integer(-p.amount,1);validatePayment(-amount,original.amount+sum(before[key].filter(x=>x.originalId===original.id),x=>x.amount));
   if(original.targetId!==p.targetId||original.orderId!==p.orderId)fail('A reversal must reference its original payment.');text(p.notes,3000,true);
  }else{
   if(p.originalId)fail('Use the refund action.');amount=integer(p.amount,1);
   if(vendor){const order=requireReference(before.orders,p.orderId);if(order.vendorId!==p.targetId||order.cancelled)fail('Select an outstanding purchase from this vendor.');validatePayment(amount,Math.min(vendorBalance(before,p.targetId),obligation(order)-sum(before.vendorPayments.filter(x=>x.orderId===order.id),x=>x.amount)));}
   else{const r=requireReference(before.repairs,p.targetId);if(r.price===null)fail('Enter Total Price before accepting payment.');validatePayment(amount,balance(before,r));}
  }
  next[key].push({id:uuid(p.id),targetId:p.targetId,amount,date:request.action==='reverse'?today(before.settings.timezone):date(p.date),method:request.action==='reverse'?requireReference(before[key],p.originalId).method:method(p.method,before.settings.methods),reference:text(p.reference,200),notes:text(p.notes),userId:actorId,...(p.orderId?{orderId:p.orderId}:{}),...(p.originalId?{originalId:p.originalId}:{})});record=vendor?p.targetId:requireReference(before.repairs,p.targetId).number;
 }else if(request.action==='order'){
  const p=one(proposed.orders.filter(x=>changed.orders.some(c=>c.id===x.id))),old=before.orders.find(x=>x.id===p.id);
  if(old){onlyFields(old,p,['cancelled']);if(!p.cancelled||old.cancelled||old.received||changed.parts.length)fail('Only unreceived orders can be cancelled.');requireReference(next.orders,p.id).cancelled=true;if(vendorBalance(next,p.vendorId)<0)fail('Reverse the vendor payment before cancelling this order.');}
  else{const part=one(proposed.parts.filter(x=>changed.parts.some(c=>c.id===x.id)));if(before.parts.some(x=>x.id===part.id)||part.id!==p.partId)fail('Invalid order part.');requireReference(before.vendors,p.vendorId);requireReference(before.repairs,p.repairId);const unitCost=integer(p.cost);integer(unitCost*integer(p.quantity,1));next.parts.push({id:uuid(part.id),name:text(part.name,150,true),model:text(part.model,150,true),cost:unitCost,archived:false});next.orders.push({id:uuid(p.id),vendorId:p.vendorId,repairId:p.repairId,partId:part.id,quantity:integer(p.quantity,1),cost:unitCost,received:0,returned:0,expected:date(p.expected),notes:text(p.notes),cancelled:false,date:today(before.settings.timezone)});}record=p.id;
 }else if(request.action==='stock'){
  if(changed.usage.length){if(changed.orders.length)fail('Receive and assign parts separately.');const p=one(proposed.usage.filter(x=>changed.usage.some(c=>c.id===x.id)));if(before.usage.some(x=>x.id===p.id))fail('Part usage cannot be edited.');const o=requireReference(next.orders,p.orderId);stock(next,o,'assign',integer(p.quantity,1),p.repairId);record=o.id;}
  else{const p=one(proposed.orders.filter(x=>changed.orders.some(c=>c.id===x.id))),old=requireReference(before.orders,p.id);onlyFields(old,p,['received','returned']);const received=p.received-old.received,returned=p.returned-old.returned;if(received>0&&returned===0)stock(next,requireReference(next.orders,p.id),'receive',integer(received,1),'');else if(returned>0&&received===0)stock(next,requireReference(next.orders,p.id),'return',integer(returned,1),'');else fail('Invalid stock movement.');record=p.id;}
 }else if(request.action==='catalog'){
  const p=one(proposed.parts.filter(x=>changed.parts.some(c=>c.id===x.id)));save(next.parts,{id:uuid(p.id),name:text(p.name,150,true),model:text(p.model,150,true),cost:integer(p.cost),archived:bool(p.archived)});record=p.name;
 }else if(request.action==='expense'){
  const p=one(proposed.expenses.filter(x=>changed.expenses.some(c=>c.id===x.id)));const old=before.expenses.find(x=>x.id===p.id);const category=text(p.category,100,true);if(category!==old?.category&&!before.settings.categories.split(',').map(x=>x.trim()).includes(category))fail('Select an active expense category.');save(next.expenses,{id:uuid(p.id),category,amount:integer(p.amount,1),date:date(p.date),description:text(p.description,3000,true),receipt:image(p.receipt)});record=p.description;
 }else if(request.action==='users'){
  const p=one(proposed.users.filter(x=>changed.users.some(c=>c.id===x.id)));if(!['Admin','Staff'].includes(p.role))fail('Invalid role.');if(p.id===actorId&&(!p.active||p.role!=='Admin'))fail('You cannot deactivate or demote your current Admin account.');const repairScope=p.repairScope??'assigned';if(!['assigned','all'].includes(repairScope))fail('Invalid repair permission.');save(next.users,{id:uuid(p.id),name:text(p.name,120,true),role:p.role as User['role'],active:bool(p.active),repairScope});record=p.name;
 }else if(request.action==='settings'){
  next.settings=validateSettings(proposed.settings,before.settings,!!(before.customerPayments.length||before.vendorPayments.length||before.orders.length||before.expenses.length));record='Shop settings';
 }
 next.activity.unshift({id:id(),userId:actorId,action:request.action,record,date:new Date().toISOString(),details:audit(before,next)});
 return next;
}
function method(value:unknown,methods:string):string {return typeof value==='string'&&settingList(methods).includes(value)?value:fail('Select an active payment method.');}
function audit(before:Data,after:Data){const lines:string[]=[];for(const key of collections){for(const row of delta(before[key] as Row[],after[key] as Row[])){const old=(before[key] as Row[]).find(x=>x.id===row.id);if(!old){lines.push(`${key}: added ${row.id}`);continue;}for(const [field,value] of Object.entries(row)){if(['photo','receipt'].includes(field))continue;const previous=(old as unknown as Record<string,unknown>)[field];if(!same(previous,value))lines.push(`${key} ${row.id} · ${field}: ${String(previous??'—')} → ${String(value??'—')}`);}}}if(!same(before.settings,after.settings))lines.push('Shop settings updated');return lines.join('\n');}

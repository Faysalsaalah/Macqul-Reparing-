import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,id,Data,setStatus,numberRepair,balance,cost} from '../lib/domain';
import {applyCloudMutation,Mutation} from '../lib/cloud-mutations';
import {configuredStatusLabel,resolvedSettings,validateSettings} from '../lib/settings';

function fixture(){
 const source=seed(),mapping=new Map<string,string>();
 for(const value of ['admin','staff','c1','c2','c3','v1','r1','r2','r3','p1','o1','u1','pay1','a1','m1','m2'])mapping.set(value,id());
 const data=JSON.parse(JSON.stringify(source),(key,value)=>typeof value==='string'&&mapping.has(value)?mapping.get(value):value) as Data;
 return {data,admin:data.users[0].id,staff:data.users[1].id};
}
function request(before:Data,action:string,update:(next:Data)=>void,allowDebt=false):Mutation{const candidate=structuredClone(before);update(candidate);return {action,record:'test',candidate,revision:0,requestId:id(),allowDebt};}

test('existing settings gain safe defaults and Admin can customize status wording without changing repairs',()=>{
 const {data,admin,staff}=fixture();const original=structuredClone(data.repairs);
 const command=request(data,'settings',next=>{next.settings.name='maqul';next.settings.methods='Cash, Bank Transfer, Cash';next.settings.accessories='Phone, Cable';next.settings.statusReady='Done';next.settings.showImei=true;});
 const next=applyCloudMutation(data,admin,command);
 assert.equal(next.settings.name,'maqul');assert.equal(next.settings.currency,'USD');assert.equal(next.settings.methods,'Cash, Bank Transfer');assert.equal(next.settings.showImei,true);assert.equal(configuredStatusLabel('Ready for Pickup',next.settings),'Done');assert.deepEqual(next.repairs,original);
 assert.equal(resolvedSettings(data.settings).receiptContact,true);
 assert.throws(()=>applyCloudMutation(data,staff,command),/Only Admin/);
 assert.throws(()=>validateSettings({...data.settings,statusReady:'Registered'},data.settings,true),/distinct status/);
 assert.throws(()=>validateSettings({...data.settings,website:'javascript:alert(1)'},data.settings,true),/website/);
 assert.throws(()=>validateSettings({...data.settings,receiptContact:'false' as unknown as boolean},data.settings,true),/Invalid shop setting/);
 assert.throws(()=>validateSettings({...data.settings,currency:'KES'},data.settings,true),/Currency is locked/);
 assert.throws(()=>validateSettings({...data.settings,methods:''},data.settings,true),/methods/);
});

test('custom active payment methods work, and a removed historical method remains reversible',()=>{
 const {data,admin}=fixture();data.settings.methods='Bank Transfer';
 const command=request(data,'payment',n=>n.customerPayments.push({...n.customerPayments[0],id:id(),method:'Bank Transfer',amount:500}));
 const next=applyCloudMutation(data,admin,command);assert.equal(next.customerPayments.at(-1)?.method,'Bank Transfer');
 const forbidden=request(data,'payment',n=>n.customerPayments.push({...n.customerPayments[0],id:id(),method:'Card',amount:500}));assert.throws(()=>applyCloudMutation(data,admin,forbidden),/active payment method/);
 const original=data.customerPayments[0];const reversed=applyCloudMutation(data,admin,request(data,'reverse',n=>n.customerPayments.push({...original,id:id(),originalId:original.id,amount:-100,method:'forged',notes:'Customer refund'})));
 assert.equal(reversed.customerPayments.at(-1)?.method,'Cash');assert.equal(reversed.customerPayments.at(-1)?.originalId,original.id);
});
test('server permissions reject forged Admin roles and unrelated state changes',()=>{
 const {data,staff}=fixture();
 assert.throws(()=>applyCloudMutation(data,staff,request(data,'settings',n=>{n.users[1].role='Admin';n.settings.name='Hacked'})),/Only Admin/);
 assert.throws(()=>applyCloudMutation(data,staff,request(data,'contact',n=>{n.users[1].role='Admin';n.customers[0].name='Changed'})),/cannot change/);
});
test('financial history is append only and payment actor comes from session',()=>{
 const {data,admin,staff}=fixture();
 assert.throws(()=>applyCloudMutation(data,admin,request(data,'payment',n=>{n.customerPayments[0].amount=1})),/cannot be edited/);
 const next=applyCloudMutation(data,staff,request(data,'payment',n=>{n.customerPayments.push({...n.customerPayments[0],id:id(),amount:2000,userId:admin})}));
 assert.equal(next.customerPayments.at(-1)?.userId,staff);assert.equal(balance(next,next.repairs[0]),0);
 assert.throws(()=>applyCloudMutation(data,staff,request(data,'payment',n=>{n.customerPayments.push({...n.customerPayments[0],id:id(),amount:2001})})),/exceeds/);
});
test('status changes derive completion values and require debt confirmation',()=>{
 const {data,admin,staff}=fixture();
 const req=request(data,'status',n=>{const r=n.repairs[0];r.status='Ready for Pickup';r.revenue=999999;r.recognizedCost=0;r.completed='2000-01-01';});
 const next=applyCloudMutation(data,staff,req);assert.equal(next.repairs[0].revenue,3000);assert.equal(next.repairs[0].recognizedCost,1800);assert.notEqual(next.repairs[0].completed,'2000-01-01');
 const collection=request(next,'status',n=>setStatus(n,n.repairs[0],'Collected',admin,true));
 assert.throws(()=>applyCloudMutation(next,staff,collection),/Confirm collection/);
 collection.allowDebt=true;assert.equal(applyCloudMutation(next,staff,collection).repairs[0].handover,staff);
});
test('parts must be received and purchase cost is authoritative',()=>{
 const {data,staff}=fixture();
 assert.throws(()=>applyCloudMutation(data,staff,request(data,'stock',n=>{n.usage.push({id:id(),orderId:n.orders[0].id,repairId:n.repairs[2].id,quantity:1,cost:1,date:'2026-10-17'})})),/Not enough/);
 const d=structuredClone(data);d.orders[0].quantity=2;d.orders[0].received=2;
 const next=applyCloudMutation(d,staff,request(d,'stock',n=>{n.usage.push({id:id(),orderId:n.orders[0].id,repairId:n.repairs[2].id,quantity:1,cost:1,date:'2026-10-17'})}));
 assert.equal(cost(next,next.repairs[2].id),1800);
 assert.throws(()=>applyCloudMutation(data,staff,request(data,'stock',n=>{n.orders[0].returned=1})),/Not enough/);
});
test('server generates repair numbers and ignores forged audit entries',()=>{
 const {data,staff}=fixture();const req=request(data,'repair',n=>{n.repairs.push({...n.repairs[0],id:id(),number:'FORGED',completed:undefined,price:null});n.settings.next=90000;n.activity=[];});
 const expected=numberRepair(structuredClone(data));const next=applyCloudMutation(data,staff,req);
 assert.equal(next.repairs.at(-1)?.number,expected);assert.equal(next.settings.next,data.settings.next+1);assert.equal(next.activity.length,data.activity.length+1);assert.equal(next.activity[0].userId,staff);
});
test('deactivated actors cannot save and deleting records is rejected',()=>{
 const {data,staff,admin}=fixture();data.users[1].active=false;
 assert.throws(()=>applyCloudMutation(data,staff,request(data,'contact',n=>{n.customers[0].name='Changed'})),/active/);
 assert.throws(()=>applyCloudMutation(data,admin,request(data,'contact',n=>{n.customers.pop()})),/cannot be deleted/);
});
test('server validates references, whole quantities, images and currency locks',()=>{
 const {data,admin}=fixture();
 assert.throws(()=>applyCloudMutation(data,admin,request(data,'repair',n=>{n.repairs[0].userId=id()})),/referenced record/);
 assert.throws(()=>applyCloudMutation(data,admin,request(data,'settings',n=>{n.settings.currency='KES'})),/Currency is locked/);
 assert.throws(()=>applyCloudMutation(data,admin,request(data,'stock',n=>{n.orders[0].received=1.5})),/Invalid amount or quantity/);
 assert.throws(()=>applyCloudMutation(data,admin,request(data,'expense',n=>{n.expenses.push({id:id(),category:'Other',amount:100,date:'2026-10-17',description:'Test',receipt:'data:image/png;base64,YWJj'})})),/contents do not match/);
});

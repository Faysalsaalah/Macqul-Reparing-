import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seed,id,type Data} from '../lib/domain';
import {technicianView,technicianMutation,requireMember} from '../lib/technician';
import {applyCloudMutation} from '../lib/cloud-mutations';
function fixture(){const data=seed();const ids=new Map<string,string>();for(const key of ['admin','staff','c1','c2','c3','v1','r1','r2','r3','p1','o1','u1','pay1','a1','m1','m2'])ids.set(key,id());return JSON.parse(JSON.stringify(data),(key,value)=>typeof value==='string'&&ids.has(value)?ids.get(value):value) as Data;}
test('technician receives assigned repairs without money, settings, users or unrelated customer data',()=>{
 const data=fixture(),staff=data.users[1].id,view=technicianView(data,staff,2);
 assert.equal(view.repairs.length,2);assert.ok(view.repairs.every(repair=>data.repairs.find(item=>item.id===repair.id)?.userId===staff));
 const encoded=JSON.stringify(view);for(const field of ['customerPayments','vendorPayments','price','revenue','recognizedCost','expenses','users','phone','email','notes'])assert.ok(!encoded.includes('"'+field+'"'));
 assert.throws(()=>requireMember(data,staff,'Admin'),/access/);
 data.users[1].active=false;assert.throws(()=>technicianView(data,staff,3),/access/);
});
test('technician writes are limited to assigned diagnosis and technical statuses',()=>{
 const data=fixture(),actor=data.users[1].id,repair=data.repairs.find(item=>item.userId===actor)!;
 const command={revision:0,requestId:id(),repairId:repair.id,action:'diagnosis' as const,value:'Battery tested'};
 const result=applyCloudMutation(data,actor,technicianMutation(data,actor,command));assert.equal(result.repairs.find(item=>item.id===repair.id)?.diagnosis,'Battery tested');assert.deepEqual(result.customerPayments,data.customerPayments);
 assert.throws(()=>technicianMutation(data,actor,{...command,repairId:data.repairs.find(item=>item.userId!==actor)!.id}),/not assigned/);
 for(const status of ['Collected','Cancelled'])assert.throws(()=>technicianMutation(data,actor,{...command,action:'status',value:status}),/cannot collect/);
 const next=applyCloudMutation(data,actor,technicianMutation(data,actor,{...command,action:'status',value:'Ready for Pickup'}));assert.equal(next.repairs.find(item=>item.id===repair.id)?.status,'Ready for Pickup');assert.equal(next.repairs.find(item=>item.id===repair.id)?.recognizedCost,1800);
});

test('Admin can grant all-repairs access without granting finance, settings or user management',()=>{
 const data=fixture(),admin=data.users[0].id,staff=data.users[1].id,candidate=structuredClone(data);
 candidate.users[1].repairScope='all';
 const request={action:'users',record:'Repair access',candidate,revision:0,requestId:id()};
 assert.throws(()=>applyCloudMutation(data,staff,request),/Only Admin/);
 const authorized=applyCloudMutation(data,admin,request),view=technicianView(authorized,staff,1);
 assert.equal(view.repairScope,'all');assert.equal(view.repairs.length,data.repairs.length);assert.equal(authorized.users[1].role,'Staff');
 const other=authorized.repairs.find(repair=>repair.userId!==staff)!;
 const changed=applyCloudMutation(authorized,staff,technicianMutation(authorized,staff,{revision:1,requestId:id(),repairId:other.id,action:'diagnosis',value:'Checked by another technician'}));
 assert.equal(changed.repairs.find(repair=>repair.id===other.id)?.diagnosis,'Checked by another technician');
 assert.deepEqual(changed.customerPayments,data.customerPayments);assert.deepEqual(changed.settings,data.settings);
 assert.throws(()=>requireMember(authorized,staff,'Admin'),/access/);
 assert.ok(!('customerPayments' in view));assert.ok(view.repairs.every(repair=>!('price' in repair)));
 authorized.users[1].repairScope='assigned';assert.equal(technicianView(authorized,staff,2).repairs.length,2);
 assert.throws(()=>technicianMutation(authorized,staff,{revision:2,requestId:id(),repairId:other.id,action:'diagnosis',value:'Blocked'}),/not assigned/);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {seed,id,Data,numberRepair,setStatus,stock,cost,vendorBalance,balance,paid,today} from '../lib/domain';
import {applyCloudMutation,Mutation} from '../lib/cloud-mutations';
import {technicianMutation,technicianView} from '../lib/technician';

test('PostgreSQL migration, RLS, atomicity, numbering, concurrency and idempotency',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated,service_role; grant execute on function auth.uid() to anon,authenticated,service_role;`);
  await db.exec(await readFile('supabase/migrations/202610170001_shop_foundation.sql','utf8'));
  const admin=id(),staff=id(),outsider=id(),shop=id(),otherShop=id(),settings=seed().settings;
  await db.query('insert into auth.users(id) values($1),($2),($3)',[admin,staff,outsider]);
  await db.query('select public.bootstrap_shop($1,$2,$3,$4::jsonb)',[shop,admin,'Shop Admin',JSON.stringify(settings)]);
  await db.query('select public.bootstrap_shop($1,$2,$3,$4::jsonb)',[otherShop,outsider,'Other Admin',JSON.stringify(settings)]);
  const load=async(actor:string,requestId?:string,hash?:string)=>(await db.query<{state:{data:Data;revision:number;replayed:boolean}}>('select public.load_workspace($1,$2,$3) as state',[actor,requestId??null,hash??null])).rows[0].state;
  const commit=async(actor:string,revision:number,requestId:string,hash:string,action:string,next:Data)=>(await db.query<{state:{data:Data;revision:number;replayed:boolean}}>('select public.commit_workspace($1,$2,$3,$4,$5,$6::jsonb) as state',[actor,revision,requestId,hash,action,JSON.stringify(next)])).rows[0].state;
  let state=await load(admin);
  const mutate=(action:string,fn:(candidate:Data)=>void):Mutation=>{const candidate=structuredClone(state.data);fn(candidate);return {action,record:'test',revision:state.revision,requestId:id(),candidate};};
  let command=mutate('users',n=>n.users.push({id:staff,name:'Shop Staff',role:'Staff',active:true}));
  state=await commit(admin,state.revision,command.requestId,'add-staff','users',applyCloudMutation(state.data,admin,command));
  command=mutate('contact',n=>n.customers.push({id:id(),name:'Test Customer',phone:'0700000101',notes:''}));
  state=await commit(admin,state.revision,command.requestId,'add-customer','contact',applyCloudMutation(state.data,staff,command));
  const customer=state.data.customers[0].id;
  command=mutate('repair',n=>n.repairs.push({id:id(),number:numberRepair(n),customerId:customer,brand:'Samsung',model:'A15',imei:'',issue:'Test screen',condition:'',accessories:'Device Only',notes:'',diagnosis:'',userId:staff,due:'2026-10-18',created:'2026-10-17',status:'Received',price:3000}));
  const revision=state.revision,requestId=command.requestId,next=applyCloudMutation(state.data,staff,command);
  state=await commit(staff,revision,requestId,'repair','repair',next);
  assert.equal(state.data.repairs[0].number,'MR-0004');
  const replay=await commit(staff,revision,requestId,'repair','repair',next);assert.equal(replay.revision,state.revision);assert.equal(replay.data.repairs.length,1);assert.equal((await load(staff,requestId,'repair')).replayed,true);
  await assert.rejects(()=>commit(staff,revision,id(),'stale','repair',next),/workspace changed/i);
  await assert.rejects(()=>commit(staff,state.revision,requestId,'wrong-hash','repair',next),/already been used/);
  const bad=structuredClone(state.data);bad.repairs.push({...bad.repairs[0],id:id()});
  const revisionBefore=state.revision;await assert.rejects(()=>commit(admin,state.revision,id(),'duplicate-number','repair',bad),/unique constraint/);assert.equal((await load(admin)).revision,revisionBefore);

  command=mutate('contact',n=>n.vendors.push({id:id(),name:'Test Vendor',phone:'0700000201',notes:''}));state=await commit(staff,state.revision,command.requestId,'vendor','contact',applyCloudMutation(state.data,staff,command));
  const vendor=state.data.vendors[0].id,partId=id(),orderId=id(),repairId=state.data.repairs[0].id;
  command=mutate('order',n=>{n.parts.push({id:partId,name:'Screen',model:'A15',cost:1800,archived:false});n.orders.push({id:orderId,vendorId:vendor,repairId,partId,quantity:2,cost:1800,received:0,returned:0,expected:'2026-10-18',notes:'',cancelled:false,date:'2026-10-17'});});state=await commit(staff,state.revision,command.requestId,'order','order',applyCloudMutation(state.data,staff,command));
  command=mutate('stock',n=>stock(n,n.orders[0],'receive',1,''));state=await commit(staff,state.revision,command.requestId,'partial-receive','stock',applyCloudMutation(state.data,staff,command));assert.equal(state.data.orders[0].received,1);
  command=mutate('stock',n=>stock(n,n.orders[0],'receive',1,''));state=await commit(staff,state.revision,command.requestId,'receive','stock',applyCloudMutation(state.data,staff,command));
  command=mutate('stock',n=>stock(n,n.orders[0],'assign',1,repairId));state=await commit(staff,state.revision,command.requestId,'assign','stock',applyCloudMutation(state.data,staff,command));assert.equal(cost(state.data,repairId),1800);
  const negativeStock=structuredClone(state.data);negativeStock.usage.push({...negativeStock.usage[0],id:id(),quantity:2});await assert.rejects(()=>commit(staff,state.revision,id(),'negative-stock','stock',negativeStock),/Stock cannot be negative/);assert.equal((await load(admin)).revision,state.revision);
  command=mutate('payment',n=>n.customerPayments.push({id:id(),targetId:repairId,amount:3000,date:'2026-10-17',method:'Cash',reference:'TEST',notes:'Test payment',userId:admin}));state=await commit(staff,state.revision,command.requestId,'customer-payment','payment',applyCloudMutation(state.data,staff,command));assert.equal(state.data.customerPayments[0].userId,staff);
  const overpay=structuredClone(state.data);overpay.customerPayments.push({...overpay.customerPayments[0],id:id(),amount:1});await assert.rejects(()=>commit(staff,state.revision,id(),'overpayment','payment',overpay),/overpayment/);assert.equal((await load(admin)).revision,state.revision);
  const editedPayment=structuredClone(state.data);editedPayment.customerPayments[0].amount=1;await assert.rejects(()=>commit(admin,state.revision,id(),'edit-finance','payment',editedPayment),/Historical records/);
  command=mutate('vendorPayment',n=>n.vendorPayments.push({id:id(),targetId:vendor,orderId,amount:3600,date:'2026-10-17',method:'Cash',reference:'',notes:'Test vendor payment',userId:admin}));state=await commit(admin,state.revision,command.requestId,'vendor-payment','vendorPayment',applyCloudMutation(state.data,admin,command));assert.equal(vendorBalance(state.data,vendor),0);
  command=mutate('stock',n=>stock(n,n.orders[0],'return',1,''));state=await commit(staff,state.revision,command.requestId,'return','stock',applyCloudMutation(state.data,staff,command));assert.equal(vendorBalance(state.data,vendor),-1800);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${outsider}',false);`);
  assert.equal((await db.query('select * from public.repairs')).rows.length,0);
  await assert.rejects(()=>db.query('select public.load_workspace($1)',[admin]),/permission denied/);
  await assert.rejects(()=>db.query('update public.app_users set payload=payload'),/permission denied/);
  await db.exec(`select set_config('request.jwt.claim.sub','${staff}',false);`);
  assert.equal((await db.query('select * from public.repairs')).rows.length,1);
  await db.exec('reset role;');
  command=mutate('status',n=>setStatus(n,n.repairs[0],'Ready for Pickup',staff,false));state=await commit(staff,state.revision,command.requestId,'ready','status',applyCloudMutation(state.data,staff,command));
  const complete=state.data.repairs[0];assert.equal(complete.revenue,3000);assert.ok(complete.completed);
  await assert.rejects(()=>db.query('delete from public.activity_logs where shop_id=$1',[shop]),/Historical records/);
  await assert.rejects(()=>commit(staff,state.revision,id(),'forged-settings','settings',state.data),/Only Admin/);
  command=mutate('users',n=>{n.users.find(u=>u.id===staff)!.active=false});state=await commit(admin,state.revision,command.requestId,'deactivate','users',applyCloudMutation(state.data,admin,command));
  await assert.rejects(()=>load(staff),/no active shop access/);
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${staff}',false);`);assert.equal((await db.query('select * from public.repairs')).rows.length,0);await db.exec('reset role;');
  await db.exec(await readFile('supabase/migrations/202610180002_server_only_workshop_access.sql','utf8'));
  for(const role of ['anon','authenticated']){
   await db.exec(`set role ${role}`);
   await assert.rejects(()=>db.query('select * from public.repairs'),/permission denied/);
   await assert.rejects(()=>db.query('select * from public.customer_payments'),/permission denied/);
   await assert.rejects(()=>db.query('select public.load_workspace($1)',[admin]),/permission denied/);
   await db.exec('reset role');
  }
  assert.equal((await load(admin)).data.users.find(user=>user.id===admin)?.role,'Admin');
 }finally{await db.close()}
});

test('no-parts repair completes through Admin intake, technician work, final payment and collection',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  for(const migration of ['202610170001_shop_foundation.sql','202610180002_server_only_workshop_access.sql'])await db.exec(await readFile('supabase/migrations/'+migration,'utf8'));
  const admin=id(),staff=id(),shop=id(),customer=id(),repairId=id(),settings={...seed().settings,next:1};
  await db.query('insert into auth.users(id) values($1),($2)',[admin,staff]);
  await db.query('select public.bootstrap_shop($1,$2,$3,$4::jsonb)',[shop,admin,'Owner',JSON.stringify(settings)]);
  type State={data:Data;revision:number};
  const load=async(actor:string)=>(await db.query<{state:State}>('select public.load_workspace($1) as state',[actor])).rows[0].state;
  let state=await load(admin);
  async function commit(actor:string,command:Mutation){const next=applyCloudMutation(state.data,actor,command);state=(await db.query<{state:State}>('select public.commit_workspace($1,$2,$3,$4,$5,$6::jsonb) as state',[actor,state.revision,command.requestId,command.requestId,command.action,JSON.stringify(next)])).rows[0].state;}
  async function change(actor:string,action:string,edit:(data:Data)=>void){const candidate=structuredClone(state.data);edit(candidate);await commit(actor,{action,record:'No-parts test',candidate,revision:state.revision,requestId:id()});}
  await change(admin,'users',data=>data.users.push({id:staff,name:'Technician',role:'Staff',active:true}));
  await change(admin,'repair',data=>{
   data.customers.push({id:customer,name:'Isolated Test Customer',phone:'000000000',notes:''});
   data.repairs.push({id:repairId,number:'ignored',customerId:customer,brand:'Samsung',model:'A15',imei:'',issue:'Software issue',condition:'Good',accessories:'Device Only',notes:'',diagnosis:'',userId:staff,due:today(),created:today(),status:'Received',price:4000});
   data.customerPayments.push({id:id(),targetId:repairId,amount:1000,date:today(),method:'Cash',reference:'',notes:'',userId:admin});
  });
  assert.equal(state.data.repairs[0].number,'MR-0001');assert.equal(balance(state.data,state.data.repairs[0]),3000);
  for(const status of ['Diagnosing','In Progress'])await commit(staff,technicianMutation(state.data,staff,{revision:state.revision,requestId:id(),repairId,action:'status',value:status}));
  await commit(staff,technicianMutation(state.data,staff,{revision:state.revision,requestId:id(),repairId,action:'diagnosis',value:'Software restored; no parts required.'}));
  await commit(staff,technicianMutation(state.data,staff,{revision:state.revision,requestId:id(),repairId,action:'status',value:'Ready for Pickup'}));
  assert.equal(state.data.repairs[0].recognizedCost,0);assert.equal(state.data.repairs[0].revenue,4000);assert.equal(state.data.orders.length,0);assert.equal(state.data.usage.length,0);
  assert.throws(()=>technicianMutation(state.data,staff,{revision:state.revision,requestId:id(),repairId,action:'status',value:'Collected'}),/cannot collect/);
  await change(admin,'payment',data=>data.customerPayments.push({id:id(),targetId:repairId,amount:3000,date:today(),method:'Cash',reference:'',notes:'Final payment',userId:admin}));
  await change(admin,'status',data=>{data.repairs[0].status='Collected';});
  assert.equal(paid(state.data,repairId),4000);assert.equal(balance(state.data,state.data.repairs[0]),0);assert.equal(state.data.repairs[0].handover,admin);
  const reloaded=await load(admin),technician=technicianView((await load(staff)).data,staff,reloaded.revision);
  assert.equal(reloaded.data.repairs[0].status,'Collected');assert.equal(technician.repairs[0].status,'Collected');assert.ok(!('price' in technician.repairs[0]));
 }finally{await db.close()}
});

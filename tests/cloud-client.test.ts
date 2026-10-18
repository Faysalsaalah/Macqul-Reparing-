import test from 'node:test';
import assert from 'node:assert/strict';
import {CloudError,hasPendingSave,retryCloudSave,saveCloud} from '../lib/cloud-client';
import {id,seed} from '../lib/domain';
import type {Mutation} from '../lib/cloud-mutations';

const request=():Mutation=>({action:'payment',record:'MR-0001',candidate:seed(),revision:1,requestId:id()});
test('an uncertain save retries the exact request and blocks another payment',async()=>{
 const original=globalThis.fetch,body:string[]=[];
 let attempts=0;
 globalThis.fetch=async(_,options)=>{body.push(String(options?.body));if(attempts++===0)throw Error('Network interrupted');return Response.json({data:seed(),revision:2,shopId:id()})};
 try{
  const first=request();await assert.rejects(()=>saveCloud(first),e=>e instanceof CloudError&&e.uncertain);
  assert.equal(hasPendingSave(),true);
  await assert.rejects(()=>saveCloud(request()),/previous save/);assert.equal(body.length,1);
  const result=await retryCloudSave();assert.equal(result.revision,2);assert.equal(body[0],body[1]);assert.equal(JSON.parse(body[1]).requestId,first.requestId);assert.equal(hasPendingSave(),false);
 }finally{globalThis.fetch=original}
});
test('a stale save returns the latest revision and can be reviewed again',async()=>{
 const original=globalThis.fetch;const workspace={data:seed(),revision:4,shopId:id()};
 globalThis.fetch=async()=>Response.json({error:'Another user saved a change.',workspace},{status:409});
 try{await assert.rejects(()=>saveCloud(request()),e=>e instanceof CloudError&&e.workspace?.revision===4&&!e.uncertain);assert.equal(hasPendingSave(),false)}finally{globalThis.fetch=original}
});

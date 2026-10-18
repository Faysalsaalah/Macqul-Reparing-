import test from 'node:test';
import assert from 'node:assert/strict';
import {repository} from '../lib/storage';
import {seed,numberRepair} from '../lib/domain';
test('repository persists, reloads and resets local records',()=>{const map=new Map<string,string>();Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(k:string)=>map.get(k)??null,setItem:(k:string,v:string)=>map.set(k,v)}});const d=seed();numberRepair(d);repository.save(d);assert.equal(repository.load().data.settings.next,5);assert.equal(repository.load().warning,undefined);repository.reset();assert.equal(repository.load().data.repairs.length,3);assert.equal(repository.load().data.settings.next,4);});
test('invalid and unavailable storage recover gracefully',()=>{Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>'{invalid',setItem:()=>{throw Error('blocked')}}});assert.ok(repository.load().warning);assert.equal(repository.load().data.repairs[0].number,'MR-0001');assert.throws(()=>repository.save(seed()),/unavailable or full/);});

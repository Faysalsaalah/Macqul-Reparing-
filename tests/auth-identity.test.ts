import {test} from 'node:test';
import assert from 'node:assert/strict';
import {workshopUserId} from '../lib/auth-identity';
test('unlinked and malformed Clerk external identities cannot become workshop actors',()=>{
 for(const value of [null,undefined,'','user_123','admin',{id:'a'},'00000000-0000-0000-0000-000000000001 extra'])assert.equal(workshopUserId(value),null);
 const id='00000000-0000-0000-0000-000000000001';assert.equal(workshopUserId(id),id);
});

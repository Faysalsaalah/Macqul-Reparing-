import 'server-only';
import {databaseClient} from './admin';
import type {CloudWorkspace} from '../cloud-types';

export async function loadWorkspace(actor:string,requestId?:string,requestHash?:string):Promise<CloudWorkspace>{
 const {data,error}=await databaseClient().rpc('load_authorized_workspace',{p_actor:actor,...(requestId?{p_request_id:requestId,p_request_hash:requestHash}:{})});
 if(error)throw error;
 return data as CloudWorkspace;
}

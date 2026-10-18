import type {Mutation} from './cloud-mutations';
import type {CloudWorkspace} from './cloud-types';
let pending:string|null=null;
export class CloudError extends Error {constructor(message:string,public workspace?:CloudWorkspace,public uncertain=false){super(message)}}
export const hasPendingSave=()=>pending!==null;
export async function fetchWorkspace():Promise<CloudWorkspace>{
 const response=await fetch('/api/workspace',{cache:'no-store'});const body=await response.json();
 if(!response.ok)throw new CloudError(body.error??'Could not refresh the workspace.');return body;
}
export async function saveCloud(request:Mutation):Promise<CloudWorkspace>{
 if(pending)throw new CloudError('Retry the previous save before making another change.',undefined,true);
 pending=JSON.stringify(request);return retryCloudSave();
}
export async function retryCloudSave():Promise<CloudWorkspace>{
 if(!pending)throw new CloudError('There is no pending save.');
 let response:Response;
 try{response=await fetch('/api/workspace',{method:'POST',headers:{'Content-Type':'application/json'},body:pending});}catch{throw new CloudError('Connection interrupted. Retry this save to confirm its result.',undefined,true);}
 const body=await response.json();
 if(response.status>=500)throw new CloudError(body.error??'The save could not be confirmed.',undefined,true);
 pending=null;
 if(!response.ok)throw new CloudError(body.error??'Could not save.',body.workspace);
 return body;
}

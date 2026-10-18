import type {Data,Status} from './domain';
import type {Mutation} from './cloud-mutations';
import {configuredStatusLabel} from './settings';
import {statuses} from './domain';
import {can} from './permissions';
export const technicianStatuses:Status[]=['Diagnosing','Waiting for Parts','In Progress','Ready for Pickup','Unrepairable'];
export type TechnicianCommand={revision:number;requestId:string;repairId:string;action:'status'|'diagnosis';value:string};
export function requireMember(data:Data,actor:string,role?:'Admin'|'Staff'){
 const member=data.users.find(user=>user.id===actor&&user.active);
 if(!member||(role&&member.role!==role))throw Error('This account does not have access to this dashboard.');
 return member;
}
export function technicianView(data:Data,actor:string,revision:number){
 const member=requireMember(data,actor,'Staff');
 if(data.access&&(!data.access.technical||!can(data.access,'repairs')))throw Error('Repair access has changed. Open the main workspace again.');
 return {canEdit:!data.access||can(data.access,'repairs','edit'),revision,name:data.settings.name,timezone:data.settings.timezone,repairScope:member.repairScope??'assigned',user:{id:member.id,name:member.name},statusLabels:Object.fromEntries(statuses.map(status=>[status,configuredStatusLabel(status,data.settings)])),repairs:data.repairs.filter(repair=>member.repairScope==='all'||repair.userId===actor).map(repair=>({id:repair.id,number:repair.number,brand:repair.brand,model:repair.model,issue:repair.issue,condition:repair.condition,accessories:repair.accessories,diagnosis:repair.diagnosis,due:repair.due,status:repair.status,customerName:data.customers.find(customer=>customer.id===repair.customerId)?.name??'Customer'}))};
}
export type TechnicianWorkspace=ReturnType<typeof technicianView>;
export function technicianMutation(data:Data,actor:string,input:TechnicianCommand):Mutation{
 const member=requireMember(data,actor,'Staff');
 if(data.access&&(!data.access.technical||!can(data.access,'repairs','edit')))throw Error('Repair edit permission required.');
 const repair=data.repairs.find(repair=>repair.id===input.repairId&&(member.repairScope==='all'||repair.userId===actor));
 if(!repair)throw Error('This repair is not assigned to you.');
 if(['Collected','Cancelled'].includes(repair.status))throw Error('This repair is closed. Ask the Admin to reopen it.');
 const candidate=structuredClone(data),target=candidate.repairs.find(item=>item.id===repair.id)!;
 if(input.action==='status'){
  if(!technicianStatuses.includes(input.value as Status))throw Error('Technicians cannot collect or cancel repairs.');
  if(target.status===input.value)throw Error('Choose a different status.');
  target.status=input.value as Status;
 }else if(input.action==='diagnosis'){
  if(typeof input.value!=='string'||input.value.length>3000)throw Error('Diagnosis must be 3000 characters or fewer.');
  if(target.diagnosis===input.value.trim())throw Error('No diagnosis change to save.');
  target.diagnosis=input.value.trim();
 }else throw Error('Unsupported technician action.');
 return {revision:input.revision,requestId:input.requestId,record:repair.number,action:input.action==='status'?'status':'repair',candidate};
}

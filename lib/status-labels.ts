import type {Status} from './domain';
const labels: Record<Status,string> = {
 Received: 'Registered',
 Diagnosing: 'Checking',
 'Waiting for Parts': 'Need Parts',
 'In Progress': 'Repairing',
 'Ready for Pickup': 'Ready',
 Collected: 'Picked Up',
 Cancelled: 'Cancelled',
 Unrepairable: 'Cannot Fix',
};
export function statusLabel(value:string):string {return labels[value as Status] ?? value;}

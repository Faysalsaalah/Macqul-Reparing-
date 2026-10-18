// Preserve the UUIDs used by historical workshop records.
export function workshopUserId(externalId:unknown):string|null {
 return typeof externalId==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(externalId)?externalId:null;
}

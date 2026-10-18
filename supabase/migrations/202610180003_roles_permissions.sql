begin;
create table public.roles(id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(id),name text not null check(length(trim(name)) between 1 and 60),technical boolean not null default false,protected boolean not null default false,unique(shop_id,id),unique(shop_id,name));
create table public.permissions(id text primary key,module text not null,action text not null check(action in ('enable','view','create','edit')),unique(module,action));
create table public.user_roles(shop_id uuid not null,user_id uuid not null,role_id uuid not null,primary key(shop_id,user_id),foreign key(shop_id,user_id) references public.app_users(shop_id,id),foreign key(shop_id,role_id) references public.roles(shop_id,id));
create table public.role_permissions(shop_id uuid not null,role_id uuid not null,permission_id text not null references public.permissions(id),primary key(shop_id,role_id,permission_id),foreign key(shop_id,role_id) references public.roles(shop_id,id));
create table public.user_permissions(shop_id uuid not null,user_id uuid not null,permission_id text not null references public.permissions(id),allowed boolean not null,primary key(shop_id,user_id,permission_id),foreign key(shop_id,user_id) references public.app_users(shop_id,id));
create table public.audit_logs(id uuid primary key default gen_random_uuid(),shop_id uuid not null references public.shops(id),actor_id uuid not null,created_at timestamptz not null default now(),action text not null,before_data jsonb,after_data jsonb,foreign key(shop_id,actor_id) references public.app_users(shop_id,id));
create trigger preserve_history before update or delete on public.audit_logs for each row execute function app_private.prevent_history_changes();
insert into public.permissions select m||'.'||a,m,a from unnest(array['dashboard','repairs','customers','parts','vendors','payments','expenses','reports','users','activity','settings']) m cross join unnest(array['enable','view','create','edit']) a where a in ('enable','view') or (m not in ('dashboard','reports','activity') and (m<>'settings' or a='edit'));
insert into public.roles(shop_id,name,technical) select id,'Technician',true from public.shops;
insert into public.roles(shop_id,name,protected) select id,'Admin',true from public.shops;
insert into public.role_permissions select r.shop_id,r.id,p.id from public.roles r cross join public.permissions p where r.protected;
insert into public.role_permissions select r.shop_id,r.id,p.id from public.roles r cross join public.permissions p where r.technical and p.id in ('repairs.enable','repairs.view','repairs.edit');
insert into public.user_roles select u.shop_id,u.id,r.id from public.app_users u join public.roles r on r.shop_id=u.shop_id and ((u.role='Staff' and r.technical) or (u.role='Admin' and r.protected));
do $$ declare t text; begin foreach t in array array['roles','permissions','user_roles','role_permissions','user_permissions','audit_logs'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon, authenticated',t);execute format('grant all on public.%I to service_role',t);end loop;end $$;
create function app_private.sync_member_role() returns trigger language plpgsql security definer set search_path='' as $$
 declare rid uuid;begin
 if tg_op='UPDATE' then if old.role=new.role then return new;end if;end if;
 select id into rid from public.roles where shop_id=new.shop_id and ((new.role='Admin' and protected) or (new.role='Staff' and technical)) order by name limit 1;
 if rid is not null then insert into public.user_roles values(new.shop_id,new.id,rid) on conflict(shop_id,user_id) do update set role_id=excluded.role_id;else delete from public.user_roles where shop_id=new.shop_id and user_id=new.id;end if;
 return new;end $$;
create trigger sync_member_role after insert or update on public.app_users for each row execute function app_private.sync_member_role();
create function app_private.has_permission(p_actor uuid,p_module text,p_action text) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select case when u.role='Admin' then true else
  coalesce((select x.allowed from public.user_permissions x where x.shop_id=u.shop_id and x.user_id=u.id and x.permission_id=p_module||'.enable'),exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.shop_id=ur.shop_id and rp.role_id=ur.role_id where ur.shop_id=u.shop_id and ur.user_id=u.id and rp.permission_id=p_module||'.enable'))
  and coalesce((select x.allowed from public.user_permissions x where x.shop_id=u.shop_id and x.user_id=u.id and x.permission_id=p_module||'.'||p_action),exists(select 1 from public.user_roles ur join public.role_permissions rp on rp.shop_id=ur.shop_id and rp.role_id=ur.role_id where ur.shop_id=u.shop_id and ur.user_id=u.id and rp.permission_id=p_module||'.'||p_action)) end from public.app_users u where u.id=p_actor and u.active),false);
$$;
create function app_private.is_technical(p_actor uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select r.technical and not exists(select 1 from public.user_permissions up where up.user_id=p_actor and up.shop_id=ur.shop_id and up.allowed and up.permission_id not in ('repairs.enable','repairs.view','repairs.edit')) from public.user_roles ur join public.roles r on r.shop_id=ur.shop_id and r.id=ur.role_id where ur.user_id=p_actor),false);
$$;
create function app_private.check_workspace_permissions(p_actor uuid,p_action text,p_data jsonb) returns void language plpgsql security definer set search_path='' as $$
declare old_data jsonb; pair text[]; row_data jsonb; previous jsonb; module_name text; operation text; member public.app_users; technical boolean;
begin
 select * into member from public.app_users where id=p_actor and active;
 if member.id is null then raise exception 'Access denied' using errcode='42501';end if;
 if member.role='Admin' then return;end if;
 old_data=public.load_workspace(p_actor)->'data';
 technical=app_private.is_technical(p_actor);
 if coalesce(technical,false) then
  if p_action not in ('repair','status') or not app_private.has_permission(p_actor,'repairs','view') or not app_private.has_permission(p_actor,'repairs','edit') then raise exception 'Technical access denied' using errcode='42501';end if;
  for row_data in select value from jsonb_array_elements(p_data->'repairs') loop
   select value into previous from jsonb_array_elements(old_data->'repairs') where value->>'id'=row_data->>'id';
   if row_data is distinct from previous then
    if previous is null or (member.payload->>'repairScope' is distinct from 'all' and previous->>'userId'<>p_actor::text) or (row_data-'diagnosis'-'status'-'completed'-'revenue'-'recognizedCost') is distinct from (previous-'diagnosis'-'status'-'completed'-'revenue'-'recognizedCost') or row_data->>'status' in ('Collected','Cancelled') then raise exception 'Technical repair scope denied' using errcode='42501';end if;
   end if;
  end loop;
 end if;
 foreach pair slice 1 in array array[['users','users'],['customers','customers'],['vendors','vendors'],['repairs','repairs'],['parts','parts'],['orders','parts'],['usage','parts'],['customerPayments','payments'],['vendorPayments','payments'],['expenses','expenses']] loop
  for row_data in select value from jsonb_array_elements(p_data->pair[1]) loop
   select value into previous from jsonb_array_elements(old_data->pair[1]) where value->>'id'=row_data->>'id';
   if row_data is distinct from previous then
    module_name=pair[2];operation=case when previous is null and pair[1]<>'usage' and p_action<>'reverse' then 'create' else 'edit' end;
    if technical and pair[1]='repairs' and previous is not null then continue;end if;
    if not app_private.has_permission(p_actor,module_name,'view') or not app_private.has_permission(p_actor,module_name,operation) then raise exception 'Module permission denied: % %',module_name,operation using errcode='42501';end if;
    if pair[1]='users' and (row_data->>'role'='Admin' or previous->>'role'='Admin' or row_data->>'id'=p_actor::text) then raise exception 'Only Admin can change privileged accounts' using errcode='42501';end if;
    if pair[1]='repairs' and previous is not null and member.payload->>'repairScope' is distinct from 'all' and previous->>'userId'<>p_actor::text then raise exception 'Repair scope denied' using errcode='42501';end if;
   end if;
  end loop;
 end loop;
 if p_action='reverse' and not app_private.has_permission(p_actor,'payments','edit') then raise exception 'Refund permission denied' using errcode='42501';end if;
 if p_action='settings' and (not app_private.has_permission(p_actor,'settings','view') or not app_private.has_permission(p_actor,'settings','edit')) then raise exception 'Settings permission denied' using errcode='42501';end if;
end $$;
create or replace function public.commit_workspace(p_actor uuid,p_expected_revision bigint,p_request_id uuid,p_request_hash text,p_action text,p_data jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_shop uuid; v_role text; v_revision bigint; v_receipt app_private.mutation_receipts;
begin
 select shop_id,role into v_shop,v_role from public.app_users where id=p_actor and active;
 if v_shop is null then raise exception 'This account has no active shop access' using errcode='42501'; end if;
 select revision into v_revision from public.shops where id=v_shop for update;
 select role into v_role from public.app_users where id=p_actor and shop_id=v_shop and active;
 if v_role is null then raise exception 'Shop access has been revoked' using errcode='42501'; end if;
 select * into v_receipt from app_private.mutation_receipts where shop_id=v_shop and request_id=p_request_id;
 if found then
  if v_receipt.actor_id<>p_actor or v_receipt.request_hash is distinct from p_request_hash then raise exception 'Request ID has already been used' using errcode='23505'; end if;
  return public.load_workspace(p_actor,p_request_id,p_request_hash);
 end if;
 if p_expected_revision<>v_revision then raise exception 'The workspace changed. Refresh and try again.' using errcode='40001'; end if;
 if p_action not in ('contact','repair','status','payment','vendorPayment','reverse','order','stock','catalog','expense','users','settings') then raise exception 'Unknown action' using errcode='22023'; end if;
 perform app_private.check_workspace_permissions(p_actor,p_action,p_data);
 if jsonb_typeof(p_data)<>'object' then raise exception 'Invalid data'; end if;
 if p_action<>'users' and p_data->'users' is distinct from (public.load_workspace(p_actor)->'data'->'users') then raise exception 'Membership cannot be changed by this action' using errcode='42501'; end if;
 if exists(select 1 from jsonb_array_elements(p_data->'users') incoming join public.app_users existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.app_users(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'users') on conflict(id) do update set payload=excluded.payload where public.app_users.shop_id=v_shop and public.app_users.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'customers') incoming join public.customers existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.customers(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'customers') on conflict(id) do update set payload=excluded.payload where public.customers.shop_id=v_shop and public.customers.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'vendors') incoming join public.vendors existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.vendors(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'vendors') on conflict(id) do update set payload=excluded.payload where public.vendors.shop_id=v_shop and public.vendors.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'parts') incoming join public.parts existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.parts(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'parts') on conflict(id) do update set payload=excluded.payload where public.parts.shop_id=v_shop and public.parts.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'repairs') incoming join public.repairs existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.repairs(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'repairs') on conflict(id) do update set payload=excluded.payload where public.repairs.shop_id=v_shop and public.repairs.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'orders') incoming join public.purchase_orders existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.purchase_orders(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'orders') on conflict(id) do update set payload=excluded.payload where public.purchase_orders.shop_id=v_shop and public.purchase_orders.payload is distinct from excluded.payload;
 insert into public.purchase_items(id,shop_id,payload) select (value->>'id')::uuid,v_shop,jsonb_build_object('id',value->>'id','orderId',value->>'id','partId',value->>'partId','quantity',value->'quantity','cost',value->'cost') from jsonb_array_elements(p_data->'orders') on conflict(id) do nothing;
 if exists(select 1 from jsonb_array_elements(p_data->'usage') incoming join public.repair_part_usage existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.repair_part_usage(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'usage') on conflict(id) do update set payload=excluded.payload where public.repair_part_usage.shop_id=v_shop and public.repair_part_usage.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'customerPayments') incoming join public.customer_payments existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.customer_payments(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'customerPayments') on conflict(id) do update set payload=excluded.payload where public.customer_payments.shop_id=v_shop and public.customer_payments.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'vendorPayments') incoming join public.vendor_payments existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.vendor_payments(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'vendorPayments') on conflict(id) do update set payload=excluded.payload where public.vendor_payments.shop_id=v_shop and public.vendor_payments.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'expenses') incoming join public.expenses existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.expenses(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'expenses') on conflict(id) do update set payload=excluded.payload where public.expenses.shop_id=v_shop and public.expenses.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'statusHistory') incoming join public.repair_status_history existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.repair_status_history(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'statusHistory') on conflict(id) do update set payload=excluded.payload where public.repair_status_history.shop_id=v_shop and public.repair_status_history.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'movements') incoming join public.stock_movements existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.stock_movements(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'movements') on conflict(id) do update set payload=excluded.payload where public.stock_movements.shop_id=v_shop and public.stock_movements.payload is distinct from excluded.payload;
 if exists(select 1 from jsonb_array_elements(p_data->'activity') incoming join public.activity_logs existing on existing.id=(incoming->>'id')::uuid where existing.shop_id<>v_shop) then raise exception 'Record belongs to another shop' using errcode='42501'; end if;
 insert into public.activity_logs(id,shop_id,payload) select (value->>'id')::uuid,v_shop,value from jsonb_array_elements(p_data->'activity') on conflict(id) do update set payload=excluded.payload where public.activity_logs.shop_id=v_shop and public.activity_logs.payload is distinct from excluded.payload;
 if exists(select 1 from public.purchase_orders o where o.shop_id=v_shop and o.received-o.returned-coalesce((select sum(u.quantity) from public.repair_part_usage u where u.shop_id=v_shop and u.order_id=o.id),0)<0) then raise exception 'Stock cannot be negative' using errcode='23514'; end if;
 if exists(select 1 from public.repairs r where r.shop_id=v_shop and (select coalesce(sum(p.amount_minor),0) from public.customer_payments p where p.shop_id=v_shop and p.repair_id=r.id)>coalesce(r.total_price_minor,0)) then raise exception 'Customer overpayment is not allowed' using errcode='23514'; end if;
 if exists(select 1 from public.repair_part_usage u join public.purchase_orders o on o.shop_id=u.shop_id and o.id=u.order_id where u.shop_id=v_shop and u.unit_cost_minor<>o.unit_cost_minor) then raise exception 'Part usage must preserve the purchase cost' using errcode='23514'; end if;
 if exists(select 1 from public.repairs r where r.shop_id=v_shop and r.payload->>'completed' is not null and ((r.payload->>'revenue')::bigint is distinct from r.total_price_minor or (r.payload->>'recognizedCost')::bigint is distinct from coalesce((select sum(u.quantity*u.unit_cost_minor) from public.repair_part_usage u where u.shop_id=v_shop and u.repair_id=r.id),0))) then raise exception 'Completion values must match revenue and assigned parts' using errcode='23514'; end if;
 update public.shop_settings set payload=p_data->'settings' where shop_id=v_shop;
 update public.shops set revision=revision+1,name=p_data->'settings'->>'name' where id=v_shop;
 insert into app_private.mutation_receipts(shop_id,request_id,actor_id,request_hash,revision) values(v_shop,p_request_id,p_actor,p_request_hash,v_revision+1);
 return public.load_workspace(p_actor,p_request_id,p_request_hash);
end; $$;

create function public.load_access(p_actor uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.app_users; result jsonb;
begin
 select * into member from public.app_users where id=p_actor and active;if member.id is null then raise exception 'Access denied' using errcode='42501';end if;
 select jsonb_build_object('admin',member.role='Admin','technical',app_private.is_technical(p_actor),'grants',coalesce((select jsonb_agg(p.id) from public.permissions p where app_private.has_permission(p_actor,p.module,p.action)),'[]'::jsonb)) into result;
 return result;
end $$;
create function public.manage_access(p_actor uuid,p_command jsonb default null,p_revision bigint default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare member public.app_users; rev bigint; target uuid; old_state jsonb; new_state jsonb; kind text; x jsonb; rid uuid; log_id uuid;
begin
 select * into member from public.app_users where id=p_actor and active and role='Admin';if member.id is null then raise exception 'Admin access required' using errcode='42501';end if;
 select revision into rev from public.shops where id=member.shop_id for update;
 if p_command is not null then
  if p_revision is distinct from rev then raise exception 'Access settings changed. Reload before saving.' using errcode='40001';end if;
  kind=p_command->>'kind';
  old_state=public.manage_access(p_actor);
  if kind='role' then
   if length(trim(p_command->>'name')) not between 1 and 60 then raise exception 'Enter a role name';end if;
   insert into public.roles(shop_id,name) values(member.shop_id,trim(p_command->>'name')) returning id into rid;
  elsif kind='matrix' then
   rid=(p_command->>'roleId')::uuid;
   if not exists(select 1 from public.roles where id=rid and shop_id=member.shop_id and not protected) then raise exception 'Role not found or protected';end if;
   delete from public.role_permissions where role_id=rid and shop_id=member.shop_id;
   for x in select value from jsonb_array_elements(p_command->'grants') loop insert into public.role_permissions values(member.shop_id,rid,x#>>'{}');end loop;
   update public.roles set technical=false where id=rid and shop_id=member.shop_id;
  elsif kind in ('assign','override') then
   target=(p_command->>'userId')::uuid;
   if not exists(select 1 from public.app_users where id=target and shop_id=member.shop_id and role='Staff') then raise exception 'Choose a Staff account. Admin access is protected.';end if;
   if kind='assign' then
    rid=(p_command->>'roleId')::uuid;
    if not exists(select 1 from public.roles where id=rid and shop_id=member.shop_id and not protected) then raise exception 'Role not found or protected';end if;
    insert into public.user_roles values(member.shop_id,target,rid) on conflict(shop_id,user_id) do update set role_id=excluded.role_id;
   else
    delete from public.user_permissions where user_id=target and shop_id=member.shop_id;
    for x in select value from jsonb_array_elements(p_command->'overrides') loop
     if jsonb_typeof(x->'allowed')<>'boolean' then raise exception 'Invalid override';end if;
     insert into public.user_permissions values(member.shop_id,target,x->>'permissionId',(x->>'allowed')::boolean);
    end loop;
   end if;
  else raise exception 'Unknown access change';end if;
  update public.shops set revision=revision+1 where id=member.shop_id;
  new_state=public.manage_access(p_actor);
  insert into public.audit_logs(shop_id,actor_id,action,before_data,after_data) values(member.shop_id,p_actor,'access.'||kind,old_state,new_state);
  log_id=gen_random_uuid();
  insert into public.activity_logs(id,shop_id,payload) values(log_id,member.shop_id,jsonb_build_object('id',log_id,'userId',p_actor,'action','access.'||kind,'record','Roles & Permissions','date',now(),'details',jsonb_build_object('before',old_state,'after',new_state)::text));
 end if;
 return jsonb_build_object('revision',(select revision from public.shops where id=member.shop_id),'roles',coalesce((select jsonb_agg(to_jsonb(r)) from public.roles r where shop_id=member.shop_id),'[]'::jsonb),'permissions',(select jsonb_agg(to_jsonb(p)) from public.permissions p),'rolePermissions',coalesce((select jsonb_agg(to_jsonb(rp)) from public.role_permissions rp where shop_id=member.shop_id),'[]'::jsonb),'userRoles',coalesce((select jsonb_agg(to_jsonb(ur)) from public.user_roles ur where shop_id=member.shop_id),'[]'::jsonb),'userPermissions',coalesce((select jsonb_agg(to_jsonb(up)) from public.user_permissions up where shop_id=member.shop_id),'[]'::jsonb));
end $$;
revoke all on function public.load_access(uuid),public.manage_access(uuid,jsonb,bigint) from public,anon,authenticated;
grant execute on function public.load_access(uuid),public.manage_access(uuid,jsonb,bigint) to service_role;
revoke all on all functions in schema app_private from public,anon,authenticated;
commit;

begin;
-- A customized Technician matrix remains the default for new Staff. Its
-- dashboard mode must not determine whether membership is assigned.
create or replace function app_private.sync_member_role() returns trigger language plpgsql security definer set search_path='' as $$
declare rid uuid;
begin
 if tg_op='UPDATE' then if old.role=new.role then return new;end if;end if;
 select id into rid from public.roles where shop_id=new.shop_id and ((new.role='Admin' and protected) or (new.role='Staff' and name='Technician' and not protected)) limit 1;
 if rid is not null then
  insert into public.user_roles values(new.shop_id,new.id,rid) on conflict(shop_id,user_id) do update set role_id=excluded.role_id;
 else
  delete from public.user_roles where shop_id=new.shop_id and user_id=new.id;
 end if;
 return new;
end $$;
create function app_private.seed_shop_roles() returns trigger language plpgsql security definer set search_path='' as $$
declare admin_role uuid; tech_role uuid;
begin
 insert into public.roles(shop_id,name,protected) values(new.id,'Admin',true) returning id into admin_role;
 insert into public.roles(shop_id,name,technical) values(new.id,'Technician',true) returning id into tech_role;
 insert into public.role_permissions select new.id,admin_role,id from public.permissions;
 insert into public.role_permissions select new.id,tech_role,id from public.permissions where id in ('repairs.enable','repairs.view','repairs.edit');
 return new;
end $$;
create trigger seed_shop_roles after insert on public.shops for each row execute function app_private.seed_shop_roles();
revoke all on function app_private.sync_member_role(),app_private.seed_shop_roles() from public,anon,authenticated;
-- Read the workspace and permissions under the same shop lock. Concurrent
-- role/scope revocation cannot combine old records with new permissions.
create function public.load_authorized_workspace(p_actor uuid,p_request_id uuid default null,p_request_hash text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare state jsonb;
begin
 state=public.load_workspace(p_actor,p_request_id,p_request_hash);
 return jsonb_set(state,'{data,access}',public.load_access(p_actor));
end $$;
revoke all on function public.load_authorized_workspace(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.load_authorized_workspace(uuid,uuid,text) to service_role;
commit;

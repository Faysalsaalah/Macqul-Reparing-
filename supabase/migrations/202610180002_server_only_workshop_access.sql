-- All browser access now goes through role-specific Next.js endpoints.
-- RLS remains enabled. Service-only RPCs and server permissions remain intact.
begin;
revoke all on table public.shops, public.shop_settings, public.app_users,
 public.customers, public.vendors, public.parts, public.repairs,
 public.purchase_orders, public.purchase_items, public.repair_part_usage,
 public.customer_payments, public.vendor_payments, public.expenses,
 public.repair_status_history, public.stock_movements, public.activity_logs
 from anon, authenticated;
commit;

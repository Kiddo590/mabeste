-- Rebrand data fix: the seeded admin row predates the correct spelling.
update staff set name = 'Mabeshte Admin' where name = 'Mabeste Admin';

-- M-Pesa STK Push groundwork.
alter table payments add column failure_reason text;

-- The client subscribes to its own pending payment row to learn when the
-- Daraja callback settles it (with polling as a fallback).
alter publication supabase_realtime add table payments;

-- Browsers may only create/touch cash payments; M-Pesa rows are written only
-- by the Edge Functions (service role, which bypasses RLS). Without this a
-- cashier could insert method='mpesa', status='completed' from the browser
-- and mark a tab paid with no money moving.
drop policy payments_insert on payments;
create policy payments_insert on payments for insert
  with check (current_staff_role() in ('admin', 'cashier') and method = 'cash');

drop policy payments_update on payments;
create policy payments_update on payments for update
  using (method = 'cash' and (recorded_by = current_staff_id() or current_staff_role() = 'admin'));

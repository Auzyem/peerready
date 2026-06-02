-- Granular permissions layered on top of the existing user_roles table (006).
-- Privileged admin reads/writes are performed by the service-role client in the
-- API after an API-level permission check, so we deliberately do NOT add
-- cross-user RLS policies here (avoids the self-referential recursion the 006
-- migration warns about, and keeps public plan reads working).

create table if not exists public.permissions (
  id text primary key,
  label text not null,
  description text,
  category text -- 'users' | 'manuscripts' | 'billing' | 'system'
);

insert into public.permissions (id, label, description, category) values
  ('users.view',            'View users',           'View list of all users',                            'users'),
  ('users.edit',            'Edit users',           'Edit user profile and career stage',                'users'),
  ('users.delete',          'Delete users',         'Permanently delete user accounts',                  'users'),
  ('users.assign_role',     'Assign roles',         'Change roles for any user',                         'users'),
  ('manuscripts.view_all',  'View all manuscripts', 'View manuscripts belonging to any user',            'manuscripts'),
  ('manuscripts.delete_any','Delete any',           'Delete manuscripts belonging to any user',          'manuscripts'),
  ('billing.view',          'View billing',         'View subscription and payment info for all users',  'billing'),
  ('billing.edit_plans',    'Edit plans',           'Create, update and delete subscription plans',      'billing'),
  ('billing.edit_discounts','Edit discounts',       'Set discount percentages per plan per interval',    'billing'),
  ('system.view_logs',      'View audit logs',      'View billing events and system logs',               'system'),
  ('system.manage_settings','Manage settings',      'Edit global system settings',                       'system')
on conflict (id) do nothing;

create table if not exists public.role_permissions (
  role text not null,
  permission_id text references public.permissions(id) on delete cascade,
  primary key (role, permission_id)
);

-- Super admin: every permission.
insert into public.role_permissions (role, permission_id)
select 'super_admin', id from public.permissions
on conflict do nothing;

-- Admin: everything except user deletion and system settings.
insert into public.role_permissions (role, permission_id) values
  ('admin','users.view'),('admin','users.edit'),('admin','users.assign_role'),
  ('admin','manuscripts.view_all'),('admin','manuscripts.delete_any'),
  ('admin','billing.view'),('admin','billing.edit_plans'),('admin','billing.edit_discounts'),
  ('admin','system.view_logs')
on conflict do nothing;

-- security definer so the (RLS-gated) user client can ask "do I have permission X?"
-- without being able to read other users' role rows directly.
create or replace function public.user_has_permission(p_user_id uuid, p_permission text)
returns boolean as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role = ur.role
    where ur.user_id = p_user_id and rp.permission_id = p_permission
  )
$$ language sql security definer;

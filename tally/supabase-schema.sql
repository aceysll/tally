create extension if not exists "pgcrypto";

-- ============================================================
-- PROFILES: one row per signed-in person
-- ============================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Someone',
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles are viewable by any signed-in user"
  on profiles for select
  using (auth.role() = 'authenticated');

create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Auto-create a profile row the moment someone signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ============================================================
-- ACCOUNTS: a platform/login that earns money (yours or a friend's)
-- ============================================================

create table accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  hourly_rate numeric not null default 0,
  currency text not null default '$',
  owner_id uuid not null references profiles(id) on delete cascade,
  join_code text not null unique default upper(substring(md5(random()::text) from 1 for 6)),
  created_at timestamptz not null default now()
);

-- Who is allowed to log hours against an account (owner is added here too).
create table account_members (
  account_id uuid not null references accounts(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (account_id, profile_id)
);

-- Membership check, security definer so policies below don't recurse.
create or replace function is_account_member(target_account_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from account_members
    where account_id = target_account_id and profile_id = auth.uid()
  )
  or exists (
    select 1 from accounts
    where id = target_account_id and owner_id = auth.uid()
  );
$$;

alter table accounts enable row level security;
alter table account_members enable row level security;

create policy "members and owner can view an account"
  on accounts for select
  using (is_account_member(id));

create policy "any signed-in user can create an account"
  on accounts for insert
  with check (auth.uid() = owner_id);

create policy "owner can update their account"
  on accounts for update
  using (auth.uid() = owner_id);

create policy "owner can delete their account"
  on accounts for delete
  using (auth.uid() = owner_id);

create policy "members and owner can view the member list"
  on account_members for select
  using (is_account_member(account_id));

create policy "a member can leave on their own"
  on account_members for delete
  using (profile_id = auth.uid());

create policy "owner can remove a member"
  on account_members for delete
  using (exists (select 1 from accounts where id = account_members.account_id and owner_id = auth.uid()));

-- Joining an account by its 6-character invite code.
create or replace function join_account_by_code(p_code text)
returns table(id uuid, name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account accounts%rowtype;
begin
  select * into v_account from accounts where join_code = upper(p_code);
  if not found then
    raise exception 'That code does not match any account';
  end if;

  insert into account_members (account_id, profile_id)
  values (v_account.id, auth.uid())
  on conflict do nothing;

  return query select v_account.id, v_account.name;
end;
$$;

-- ============================================================
-- ENTRIES: logged hours
-- ============================================================

create table entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  worked_by uuid not null references profiles(id),
  created_by uuid not null references profiles(id),
  entry_date date not null,
  hours numeric not null,
  paid boolean not null default false,
  note text,
  created_at timestamptz not null default now()
);

create index entries_date_idx on entries(entry_date);
create index entries_account_idx on entries(account_id);

alter table entries enable row level security;

create policy "members can view entries on their accounts"
  on entries for select
  using (is_account_member(account_id));

create policy "members can log entries for a fellow member"
  on entries for insert
  with check (
    is_account_member(account_id)
    and exists (
      select 1 from account_members
      where account_id = entries.account_id and profile_id = entries.worked_by
    )
  );

create policy "creator, worker or owner can update an entry"
  on entries for update
  using (
    created_by = auth.uid()
    or worked_by = auth.uid()
    or exists (select 1 from accounts where id = entries.account_id and owner_id = auth.uid())
  );

create policy "creator or owner can delete an entry"
  on entries for delete
  using (
    created_by = auth.uid()
    or exists (select 1 from accounts where id = entries.account_id and owner_id = auth.uid())
  );

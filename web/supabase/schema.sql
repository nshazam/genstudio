-- Run in Supabase SQL editor. Auth users come from Supabase Auth (auth.users).

-- Credit balance per user.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 20,          -- free trial credits
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- Append-only ledger. Never mutate; balance = profiles.credits kept in sync via RPC.
create table if not exists credit_ledger (
  id bigserial primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,                        -- negative = spend, positive = topup
  reason text not null,                          -- 'gen:image' | 'purchase' | 'refund'
  job_id uuid,
  created_at timestamptz not null default now()
);

-- Generation jobs.
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  modality text not null check (modality in ('image','video','voice')),
  prompt text not null,
  params jsonb not null default '{}',
  cost integer not null,
  status text not null default 'queued',         -- queued|running|done|error
  runpod_id text,
  output_url text,
  error text,
  created_at timestamptz not null default now()
);

-- Atomic spend: deduct credits + write ledger, fail if insufficient.
create or replace function spend_credits(p_user uuid, p_cost int, p_job uuid, p_reason text)
returns int language plpgsql as $$
declare new_bal int;
begin
  update profiles set credits = credits - p_cost
   where id = p_user and credits >= p_cost
  returning credits into new_bal;
  if new_bal is null then
    raise exception 'insufficient_credits';
  end if;
  insert into credit_ledger(user_id, delta, reason, job_id)
  values (p_user, -p_cost, p_reason, p_job);
  return new_bal;
end $$;

create or replace function add_credits(p_user uuid, p_amount int, p_reason text)
returns int language plpgsql as $$
declare new_bal int;
begin
  update profiles set credits = credits + p_amount where id = p_user returning credits into new_bal;
  insert into credit_ledger(user_id, delta, reason) values (p_user, p_amount, p_reason);
  return new_bal;
end $$;

-- Row Level Security: users see only their own rows.
alter table profiles enable row level security;
alter table jobs enable row level security;
alter table credit_ledger enable row level security;
create policy "own profile" on profiles for select using (auth.uid() = id);
create policy "own jobs"    on jobs     for select using (auth.uid() = user_id);
create policy "own ledger"  on credit_ledger for select using (auth.uid() = user_id);

-- Auto-create a profile row when a user signs up.
create or replace function handle_new_user() returns trigger language plpgsql security definer as $$
begin
  insert into profiles(id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

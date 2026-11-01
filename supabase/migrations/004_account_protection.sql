-- Needle migration 004: server-side checks on sign-in methods, and 2FA recovery codes.
-- Run once in Supabase → SQL Editor, AFTER 003_account_security.sql.
--
-- To undo the triggers if they ever block something they shouldn't, run:
--   drop trigger guard_identity_link on auth.identities;
--   drop trigger guard_identity_unlink on auth.identities;
--   drop trigger guard_factor_verified on auth.mfa_factors;
--   drop trigger guard_factor_removed on auth.mfa_factors;
--   drop trigger guard_first_password on auth.users;

-- ─── Grants: proof that this session just confirmed it's the user ───────────
-- Supabase's own endpoints change sign-in methods, and they can't check how recently a
-- session signed in. These triggers refuse those changes unless the session first got a
-- short-lived grant from authorize_account_change, which can check its signed JWT.
-- A stolen, long-lived session can't get one.
create table public.account_change_grants (
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in ('link_identity', 'unlink_identity', 'enroll_factor', 'remove_factor', 'add_password')),
  expires_at timestamptz not null,
  primary key (user_id, action)
);

-- Only the functions below touch this.
alter table public.account_change_grants enable row level security;
revoke all on public.account_change_grants from public, anon, authenticated, service_role;

-- The same test delete_my_account applies: passed 2FA if the account has it on, and
-- signed in or passed 2FA within the last 10 minutes.
create function public.recently_authenticated()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.mfa_satisfied() and coalesce((
    select max((entry ->> 'timestamp')::bigint)
    from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry
  ), 0) >= extract(epoch from now()) - 600;
$$;
revoke all on function public.recently_authenticated() from public, anon, authenticated, service_role;

create function public.authorize_account_change(change text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.recently_authenticated() then
    raise exception 'reauthentication_required' using errcode = '42501';
  end if;
  insert into public.account_change_grants (user_id, action, expires_at)
  values (auth.uid(), change, now() + interval '10 minutes')
  on conflict (user_id, action) do update set expires_at = excluded.expires_at;
end;
$$;
revoke all on function public.authorize_account_change(text) from public, anon;
grant execute on function public.authorize_account_change(text) to authenticated;

-- Each grant works once.
create function public.consume_account_change_grant(target uuid, change text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.account_change_grants
  where user_id = target and action = change and expires_at > now();
  if not found then
    raise exception 'account_change_not_authorized' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.consume_account_change_grant(uuid, text) from public, anon, authenticated, service_role;

-- Not checked: an admin in the SQL Editor, or rows going away because their user was deleted.
create function public.account_change_exempt()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select session_user in ('postgres', 'supabase_admin') or pg_trigger_depth() > 1;
$$;
revoke all on function public.account_change_exempt() from public, anon, authenticated, service_role;

-- ─── Connecting and disconnecting Google ────────────────────────────────────
-- Also stops Supabase's automatic merge of a Google sign-in into an existing account
-- with the same email. With Confirm email off, that address may never have been proven,
-- so whoever registered it could share the Google user's account. Accounts now only gain
-- Google through Settings, after confirming who they are.
create function public.guard_identity_link()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.account_change_exempt() then
    return new;
  end if;
  -- A new account's first sign-in method, which has nothing to merge into.
  if not exists (select 1 from auth.identities where user_id = new.user_id)
    and not exists (select 1 from auth.users where id = new.user_id and coalesce(encrypted_password, '') <> '') then
    return new;
  end if;
  -- Never confirmed: Supabase removes the existing password and identities itself.
  if exists (select 1 from auth.users where id = new.user_id and confirmed_at is null) then
    return new;
  end if;
  perform public.consume_account_change_grant(new.user_id, 'link_identity');
  return new;
end;
$$;
revoke all on function public.guard_identity_link() from public, anon, authenticated, service_role;

create function public.guard_identity_unlink()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.account_change_exempt()
    or exists (select 1 from auth.users where id = old.user_id and confirmed_at is null) then
    return old;
  end if;
  perform public.consume_account_change_grant(old.user_id, 'unlink_identity');
  return old;
end;
$$;
revoke all on function public.guard_identity_unlink() from public, anon, authenticated, service_role;

-- Email identities are left out so that signing up with an email is never affected.
create trigger guard_identity_link
  before insert on auth.identities
  for each row when (new.provider <> 'email')
  execute function public.guard_identity_link();

create trigger guard_identity_unlink
  before delete on auth.identities
  for each row execute function public.guard_identity_unlink();

-- ─── Turning 2FA on and off ─────────────────────────────────────────────────
-- Turning it on is checked too: passing a code on a newly added authenticator counts as
-- a fresh sign-in, so a stolen session could otherwise add its own and look recent.
create function public.guard_factor_change()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if not public.account_change_exempt() then
      perform public.consume_account_change_grant(new.user_id, 'enroll_factor');
    end if;
    return new;
  end if;

  if not public.account_change_exempt() then
    perform public.consume_account_change_grant(old.user_id, 'remove_factor');
  end if;
  -- A recovery code does nothing without 2FA, so it shouldn't outlive it.
  if not exists (select 1 from auth.mfa_factors where user_id = old.user_id and status = 'verified' and id <> old.id) then
    delete from public.recovery_codes where user_id = old.user_id;
  end if;
  return old;
end;
$$;
revoke all on function public.guard_factor_change() from public, anon, authenticated, service_role;

-- ─── Adding a first password ────────────────────────────────────────────────
-- A Google-only account has no current password for Supabase to ask for. Changing an
-- existing password is left to Supabase's "Require current password" setting.
create function public.guard_first_password()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if public.account_change_exempt()
    or exists (select 1 from auth.users where id = new.id and confirmed_at is null)
    or exists (select 1 from auth.identities where user_id = new.id and provider = 'email') then
    return new;
  end if;
  perform public.consume_account_change_grant(new.id, 'add_password');
  return new;
end;
$$;
revoke all on function public.guard_first_password() from public, anon, authenticated, service_role;

create trigger guard_first_password
  before update of encrypted_password on auth.users
  for each row when (coalesce(old.encrypted_password, '') = '' and coalesce(new.encrypted_password, '') <> '')
  execute function public.guard_first_password();

-- ─── Recovery codes ─────────────────────────────────────────────────────────
-- Supabase's own recovery codes are still experimental and off by default. A session can
-- only reach aal2 through Supabase, so a code here removes the authenticator instead, and
-- the user sets 2FA up again. That means one code at a time is enough.
create table public.recovery_codes (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  code_hash  bytea not null,
  created_at timestamptz not null default now()
);

alter table public.recovery_codes enable row level security;
revoke all on public.recovery_codes from public, anon, authenticated, service_role;

create trigger guard_factor_verified
  before update of status on auth.mfa_factors
  for each row when (old.status is distinct from new.status and new.status = 'verified')
  execute function public.guard_factor_change();

create trigger guard_factor_removed
  before delete on auth.mfa_factors
  for each row when (old.status = 'verified')
  execute function public.guard_factor_change();

-- Formatting doesn't matter when typing one in. Codes are 64 random bits, which is too many
-- to guess online, and a plain hash is enough because they aren't chosen by people.
create function public.recovery_code_hash(owner uuid, code text)
returns bytea
language sql immutable set search_path = ''
as $$
  select sha256(convert_to(owner::text || ':' || upper(regexp_replace(code, '[^0-9A-Fa-f]', '', 'g')), 'UTF8'));
$$;
revoke all on function public.recovery_code_hash(uuid, text) from public, anon, authenticated, service_role;

-- Returns the new code, the only time it's readable. Replaces any earlier one.
create function public.create_recovery_code()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  raw text := upper(left(replace(gen_random_uuid()::text, '-', ''), 12) || left(replace(gen_random_uuid()::text, '-', ''), 4));
begin
  if auth.uid() is null or not public.recently_authenticated() then
    raise exception 'reauthentication_required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.mfa_factors where user_id = auth.uid() and status = 'verified') then
    raise exception 'two_factor_not_enabled' using errcode = '42501';
  end if;
  insert into public.recovery_codes (user_id, code_hash)
  values (auth.uid(), public.recovery_code_hash(auth.uid(), raw))
  on conflict (user_id) do update set code_hash = excluded.code_hash, created_at = now();
  return concat_ws('-', left(raw, 4), substr(raw, 5, 4), substr(raw, 9, 4), right(raw, 4));
end;
$$;
revoke all on function public.create_recovery_code() from public, anon;
grant execute on function public.create_recovery_code() to authenticated;

-- Step two of signing in, for someone who lost their authenticator. They've already passed
-- step one, so a code alone gets nobody in. Returns false for a wrong code.
create function public.redeem_recovery_code(code text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  factor uuid;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;
  delete from public.recovery_codes
  where user_id = auth.uid() and code_hash = public.recovery_code_hash(auth.uid(), code);
  if not found then
    return false;
  end if;
  for factor in
    select id from auth.mfa_factors where user_id = auth.uid() and status = 'verified'
  loop
    insert into public.account_change_grants (user_id, action, expires_at)
    values (auth.uid(), 'remove_factor', now() + interval '1 minute')
    on conflict (user_id, action) do update set expires_at = excluded.expires_at;
    delete from auth.mfa_factors where id = factor;
  end loop;
  return true;
end;
$$;
revoke all on function public.redeem_recovery_code(text) from public, anon;
grant execute on function public.redeem_recovery_code(text) to authenticated;

-- ─── Google-only accounts that add a password ───────────────────────────────
-- What the settings page can't read from the session. Supabase doesn't record a password
-- added to a Google account as a sign-in method, so identities alone can't answer this.
create function public.account_security_status()
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'has_password', coalesce(u.encrypted_password, '') <> '',
    'has_recovery_code', exists (select 1 from public.recovery_codes r where r.user_id = u.id)
  )
  from auth.users u
  where u.id = auth.uid();
$$;
revoke all on function public.account_security_status() from public, anon;
grant execute on function public.account_security_status() to authenticated;

-- For the same reason, Supabase counts Google as the account's only sign-in method and
-- won't disconnect it. This records the password's email as a method, the same way Supabase's
-- experimental "create email identity on password set" option does.
create function public.ensure_email_identity()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null or not public.recently_authenticated() then
    raise exception 'reauthentication_required' using errcode = '42501';
  end if;
  insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
  select u.id::text, u.id,
    jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  from auth.users u
  where u.id = auth.uid()
    and u.email is not null
    and u.email_confirmed_at is not null
    and coalesce(u.encrypted_password, '') <> ''
  on conflict (provider_id, provider) do nothing;
end;
$$;
revoke all on function public.ensure_email_identity() from public, anon;
grant execute on function public.ensure_email_identity() to authenticated;

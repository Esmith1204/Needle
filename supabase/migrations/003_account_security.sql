-- Needle migration 003: two-factor enforcement and account deletion.
-- Run once in Supabase → SQL Editor, AFTER 002_accounts.sql.

-- ─── Two-factor enforcement ─────────────────────────────────────────────────
-- A session that has only passed the first step (password or Google) of an account
-- with 2FA on stays "aal1". Without these policies it could skip the app's code
-- screen by calling the API directly.
create function public.mfa_satisfied()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select auth.jwt() ->> 'aal' = 'aal2'
    or not exists (
      select 1 from auth.mfa_factors
      where user_id = auth.uid() and status = 'verified'
    );
$$;
revoke all on function public.mfa_satisfied() from public, anon;
grant execute on function public.mfa_satisfied() to authenticated;

create policy "2FA accounts need a verified session"
  on public.profiles as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "2FA accounts need a verified session"
  on public.ratings as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));
create policy "2FA accounts need a verified session"
  on public.friendships as restrictive for all to authenticated
  using ((select public.mfa_satisfied()));

-- ─── Deleting an account ────────────────────────────────────────────────────
-- Removes the auth user; the profile, ratings, and friendships cascade from it.
-- The app asks the user to confirm who they are first. This checks the result from
-- the session's signed JWT, so a stolen, long-lived session can't delete the account:
--   - the session must have passed 2FA, if the account has it on
--   - its newest sign-in or 2FA check must be under 10 minutes old
create function public.delete_my_account()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  last_authenticated bigint;
begin
  if auth.uid() is null then
    raise exception 'not_signed_in' using errcode = '42501';
  end if;

  select max((entry ->> 'timestamp')::bigint) into last_authenticated
  from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) as entry;

  if not public.mfa_satisfied()
    or coalesce(last_authenticated, 0) < extract(epoch from now()) - 600 then
    raise exception 'reauthentication_required' using errcode = '42501';
  end if;

  delete from auth.users where id = auth.uid();
end;
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- Privacy: ogni elenco lo vede solo chi lo ha creato e i partecipanti che sceglie lui.
create or replace function public.is_list_owner(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.lists where id = lid and user_id = auth.uid());
$$;

create or replace function public.can_see_list(lid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_list_owner(lid) or exists (
    select 1 from public.list_members
    where list_id = lid and username = (auth.jwt()->'user_metadata'->>'username'));
$$;

-- il creatore è sempre tra i partecipanti
create or replace function public.add_owner_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.list_members(list_id, username, weight) values (new.id, new.username, 1)
  on conflict do nothing;
  return new;
end; $$;
drop trigger if exists trg_owner_member on lists;
create trigger trg_owner_member after insert on lists
  for each row execute function public.add_owner_member();
insert into list_members(list_id, username, weight)
  select id, username, 1 from lists on conflict do nothing;

drop policy if exists "vedi elenchi" on lists;
create policy "vedi elenchi" on lists for select to authenticated using (public.can_see_list(id));

drop policy if exists "vedi spese" on expenses;
create policy "vedi spese" on expenses for select to authenticated using (public.can_see_list(list_id));
drop policy if exists "crea spese" on expenses;
create policy "crea spese" on expenses for insert to authenticated
  with check (user_id = auth.uid() and username = auth.jwt()->'user_metadata'->>'username'
              and public.can_see_list(list_id));

drop policy if exists "vedi quote" on list_members;
create policy "vedi quote" on list_members for select to authenticated using (public.can_see_list(list_id));
drop policy if exists "crea quote" on list_members;
create policy "crea quote" on list_members for insert to authenticated with check (public.is_list_owner(list_id));
drop policy if exists "modifica quote" on list_members;
create policy "modifica quote" on list_members for update to authenticated
  using (public.is_list_owner(list_id)) with check (public.is_list_owner(list_id));
drop policy if exists "elimina quote" on list_members;
create policy "elimina quote" on list_members for delete to authenticated using (public.is_list_owner(list_id));

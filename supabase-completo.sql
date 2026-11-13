-- Esegui questo script nel SQL Editor di Supabase
create table lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  user_id uuid not null default auth.uid(),
  username text not null,
  created_at timestamptz default now()
);
create table expenses (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references lists(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  username text not null,
  description text not null,
  amount numeric(10,2) not null check (amount > 0),
  created_at timestamptz default now()
);
alter table lists enable row level security;
alter table expenses enable row level security;

create policy "vedi elenchi" on lists for select to authenticated using (true);
create policy "crea elenchi" on lists for insert to authenticated
  with check (user_id = auth.uid() and username = auth.jwt()->'user_metadata'->>'username');
create policy "vedi spese" on expenses for select to authenticated using (true);
create policy "crea spese" on expenses for insert to authenticated
  with check (user_id = auth.uid() and username = auth.jwt()->'user_metadata'->>'username');

create policy "modifica proprie spese" on expenses for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and username = auth.jwt()->'user_metadata'->>'username');
create policy "elimina proprie spese" on expenses for delete to authenticated
  using (user_id = auth.uid());

create table list_members (
  list_id uuid not null references lists(id) on delete cascade,
  username text not null,
  weight numeric(6,2) not null default 1 check (weight > 0),
  primary key (list_id, username)
);
alter table list_members enable row level security;
create policy "vedi quote" on list_members for select to authenticated using (true);
create policy "crea quote" on list_members for insert to authenticated with check (true);
create policy "modifica quote" on list_members for update to authenticated using (true) with check (true);
create policy "elimina quote" on list_members for delete to authenticated using (true);

-- Tempo reale
alter publication supabase_realtime add table lists, expenses, list_members;

-- Esegui nel SQL Editor di Supabase (se hai già eseguito supabase.sql)
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

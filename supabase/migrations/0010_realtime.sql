-- 0010_realtime
-- Sem entrar na publicacao, o canal de realtime conecta e nunca recebe evento.
-- So occurrences: e a unica tabela que muda com alguem do grupo agindo.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'occurrences'
  ) then
    alter publication supabase_realtime add table public.occurrences;
  end if;
end $$;

-- O evento de UPDATE precisa carregar habit_id para o front filtrar pelo grupo.
alter table public.occurrences replica identity full;

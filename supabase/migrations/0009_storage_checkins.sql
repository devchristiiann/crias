-- 0009_storage_checkins
-- Foto de check-in em bucket privado. Caminho sempre <user_id>/<occurrence_id>.webp,
-- e a policy amarra o primeiro segmento ao dono. Sem isso qualquer usuario
-- autenticado poderia escrever na pasta de outro.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('checkins', 'checkins', false, 3145728, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists p_checkins_insert on storage.objects;
create policy p_checkins_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists p_checkins_update on storage.objects;
create policy p_checkins_update on storage.objects for update to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Leitura: o dono sempre. Membro do grupo so quando a foto pertence a uma
-- ocorrencia de desafio daquele grupo, que e o ponto de anexar foto.
drop policy if exists p_checkins_select on storage.objects;
create policy p_checkins_select on storage.objects for select to authenticated
using (
  bucket_id = 'checkins'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
        from public.occurrences o
        join public.habits h on h.id = o.habit_id
       where o.foto_path = storage.objects.name
         and h.group_id is not null
         and public.e_membro(h.group_id)
    )
  )
);

drop policy if exists p_checkins_delete on storage.objects;
create policy p_checkins_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'checkins'
  and (storage.foldername(name))[1] = auth.uid()::text
);

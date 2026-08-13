-- 0027_indices_e_rls
--
-- Duas coisas, nenhuma delas muda o que alguem consegue ler:
--
-- 1. `auth.uid()` solto dentro de policy e reavaliado linha a linha. Dentro de
--    `(select auth.uid())` o planner o trata como InitPlan e roda uma vez por
--    consulta. Toda policy abaixo repete a expressao antiga no comentario logo
--    acima: o teste de aceite e a lista de linhas visiveis por usuario ficar
--    identica antes e depois.
--
-- 2. `e_membro` e `security definer`, logo nao e leakproof, logo o planner nao
--    a empurra para dentro do index scan: ela roda uma vez por linha candidata.
--    Em `occurrences` isso e um custo por linha da tabela que mais cresce.
--    A troca e resolver a lista de grupos do usuario UMA vez por consulta e
--    comparar `group_id` contra ela.
--
-- `e_membro` continua existindo e continua sendo a resposta certa para pergunta
-- de um grupo so, que e como as RPCs a usam. O que sai daqui e o uso dela
-- dentro de policy, onde a pergunta e feita por linha.

-- ------------------------------------------------------- 1. lista de grupos

-- Mesma resposta de `e_membro`, do outro lado: em vez de "sou membro deste
-- grupo?" por linha, "quais sao os meus grupos?" uma vez.
--
-- `security definer` pelo mesmo motivo da `e_membro`: sem isso a leitura de
-- `group_members` de dentro de uma policy passaria pela policy de
-- `group_members`, que chama... `e_membro`. `stable` para o planner poder
-- materializar o resultado dentro da consulta.
--
-- Devolve `setof uuid` e nao `uuid[]` de proposito: `x in (select f())` vira
-- subplan com hash, avaliado uma vez. `x = any(f())` chamaria a funcao por
-- linha, que e exatamente o problema que estamos tirando.
create or replace function public.meus_grupos() returns setof uuid
language sql security definer stable set search_path = public as $$
  select group_id from group_members where user_id = (select auth.uid())
$$;

-- O par completo, sempre: `revoke ... from public, anon, authenticated` e so
-- entao o `grant` do que a funcao realmente precisa. `revoke` so de
-- `public, anon` daria o mesmo resultado AQUI, porque o grant logo abaixo
-- devolve o execute a `authenticated` de proposito, mas escrever pela metade e
-- ensinar o padrao que ja custou caro neste projeto: o Supabase concede execute
-- a `authenticated` por padrao, e foi assim que `gerar_ocorrencias` ficou aberta
-- e permitiu ouro infinito. A proxima funcao copiada daqui pode ser uma que NAO
-- deve ter grant nenhum.
--
-- Aqui `authenticated` PRECISA executar, senao toda policy que a chama vira erro
-- de permissao. `anon` fica de fora, igual a `e_membro`.
revoke execute on function public.meus_grupos() from public, anon, authenticated;
grant execute on function public.meus_grupos() to authenticated, service_role;

-- ------------------------------------------------------------- 2. indices

-- `p_checkins_select` (0009:30) casa `o.foto_path = objects.name` para decidir
-- se a foto de check-in e de rotina de grupo. Sem indice, decidir isso obriga a
-- percorrer todas as ocorrencias dos habitos do grupo, tenham foto ou nao.
-- O parcial cobre so quem tem foto, que hoje sao 7 linhas em 286.
--
-- `habit_id` entra na chave, e nao so no predicado, para o plano fechar em
-- index only scan: sem ele o planner ainda precisa da heap para saber de qual
-- habito a foto e, e volta a varrer por `habit_id`.
create index if not exists idx_occ_foto_path
  on public.occurrences (foto_path, habit_id) where foto_path is not null;

-- `toques_pendentes` (0023:942) filtra `status in ('pendente','atrasado')`, e o
-- `idx_occ_toque` (0001:127) era parcial so em 'pendente'. O cron de push roda
-- de 5 em 5 minutos e caia em seq scan na tabela que mais cresce.
create index if not exists idx_occ_toque_ativo
  on public.occurrences (proximo_toque_em)
  where status in ('pendente', 'atrasado') and proximo_toque_em is not null;

-- O indice antigo vira subconjunto estrito do novo e nao tem outro leitor:
-- `proximo_toque_em` so e consultado por `toques_pendentes`. Indice a mais em
-- `occurrences` e escrita a mais em todo check-in.
drop index if exists public.idx_occ_toque;

-- Nao ha indice novo para `useEnquetesGrupo` (src/hooks/useEnquetesGrupo.ts:61),
-- de proposito. O `idx_occ_em_validacao` (0026:221) e parcial em
-- `status = 'em_validacao'`, entao ele ja contem SO as linhas que a consulta
-- quer, e na ordem de `validacao_ate` que ela pede: a ordenacao sai de graca e
-- o `habit_id` vira filtro sobre um punhado de linhas. Um
-- `(habit_id, validacao_ate)` no lugar dele obrigaria um Sort, porque a
-- consulta manda varios `habit_id` de uma vez. Trocaria um scan ordenado por um
-- scan mais um Sort.

-- --------------------------------------------------------- 3. profiles

-- Antes: id = auth.uid() or exists (select 1 from group_members a
--          join group_members b on b.group_id = a.group_id
--          where a.user_id = auth.uid() and b.user_id = profiles.id)
-- O auto-join respondia "existe grupo meu onde esta pessoa tambem esta?".
-- A lista de grupos ja responde a primeira metade uma vez so, e sobra um
-- `in` contra os membros desses grupos. Mesmo conjunto: eu, mais quem
-- divide grupo comigo.
drop policy if exists p_profiles_read on public.profiles;
create policy p_profiles_read on public.profiles for select using (
  id = (select auth.uid())
  or id in (
    select m.user_id from public.group_members m
     where m.group_id in (select public.meus_grupos())
  )
);

-- Antes: using (id = auth.uid()) with check (id = auth.uid())
drop policy if exists p_profiles_update on public.profiles;
create policy p_profiles_update on public.profiles for update
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- ----------------------------------------------------------- 4. groups

-- Antes: public.e_membro(id)
drop policy if exists p_groups_read on public.groups;
create policy p_groups_read on public.groups for select using (
  id in (select public.meus_grupos())
);

-- Antes: public.e_membro(group_id)
drop policy if exists p_members_read on public.group_members;
create policy p_members_read on public.group_members for select using (
  group_id in (select public.meus_grupos())
);

-- ----------------------------------------------------------- 5. habits

-- Antes: user_id = auth.uid() or (group_id is not null and public.e_membro(group_id))
-- O `is not null` sai porque `null in (...)` nao e true, e policy so libera
-- com true. Linha de habito individual continua caindo no primeiro ramo.
drop policy if exists p_habits_read on public.habits;
create policy p_habits_read on public.habits for select using (
  user_id = (select auth.uid())
  or group_id in (select public.meus_grupos())
);

-- Antes: (escopo = 'user' and user_id = auth.uid())
--        or (escopo = 'group' and public.e_membro(group_id))
drop policy if exists p_habits_insert on public.habits;
create policy p_habits_insert on public.habits for insert with check (
  (escopo = 'user' and user_id = (select auth.uid()))
  or (escopo = 'group' and group_id in (select public.meus_grupos()))
);

-- Antes: user_id = auth.uid() or (group_id is not null and exists (
--          select 1 from groups g where g.id = habits.group_id and g.dono_id = auth.uid()))
-- A subconsulta continua passando pela RLS de `groups`, igual antes: dono que
-- nao seja membro continua sem enxergar o proprio grupo, e portanto sem
-- alterar nem apagar. Nao e regressao, e o comportamento de hoje.
drop policy if exists p_habits_update on public.habits;
create policy p_habits_update on public.habits for update using (
  user_id = (select auth.uid())
  or group_id in (select g.id from public.groups g where g.dono_id = (select auth.uid()))
);

-- Antes: mesma expressao do update acima.
drop policy if exists p_habits_delete on public.habits;
create policy p_habits_delete on public.habits for delete using (
  user_id = (select auth.uid())
  or group_id in (select g.id from public.groups g where g.dono_id = (select auth.uid()))
);

-- ------------------------------------------------------ 6. occurrences

-- Antes: user_id = auth.uid() or exists (select 1 from habits h
--          where h.id = occurrences.habit_id and h.group_id is not null
--            and public.e_membro(h.group_id))
-- Era um `exists` correlacionado por linha de `occurrences`, e dentro dele uma
-- `e_membro` por linha candidata de `habits`. Vira uma lista de habitos de
-- grupo resolvida uma vez. `habits` continua sob a propria RLS nos dois casos.
drop policy if exists p_occ_read on public.occurrences;
create policy p_occ_read on public.occurrences for select using (
  user_id = (select auth.uid())
  or habit_id in (
    select h.id from public.habits h
     where h.group_id in (select public.meus_grupos())
  )
);

-- Antes: user_id = auth.uid() or exists (select 1 from habits h
--          where h.id = streaks.habit_id and h.group_id is not null
--            and public.e_membro(h.group_id))
drop policy if exists p_streaks_read on public.streaks;
create policy p_streaks_read on public.streaks for select using (
  user_id = (select auth.uid())
  or habit_id in (
    select h.id from public.habits h
     where h.group_id in (select public.meus_grupos())
  )
);

-- ------------------------------------------------- 7. tabelas so-do-dono

-- Antes: user_id = auth.uid() em todas. Unica mudanca e o `(select ...)`.
drop policy if exists p_rewards_own on public.rewards;
create policy p_rewards_own on public.rewards for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists p_redemptions_read on public.redemptions;
create policy p_redemptions_read on public.redemptions for select
  using (user_id = (select auth.uid()));

drop policy if exists p_owned_read on public.owned_items;
create policy p_owned_read on public.owned_items for select
  using (user_id = (select auth.uid()));

drop policy if exists p_subs_own on public.push_subs;
create policy p_subs_own on public.push_subs for all
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists p_baus_read on public.baus;
create policy p_baus_read on public.baus for select
  using (user_id = (select auth.uid()));

drop policy if exists p_recaidas_read on public.recaidas;
create policy p_recaidas_read on public.recaidas for select
  using (user_id = (select auth.uid()));

drop policy if exists p_notificacoes_read on public.notificacoes;
create policy p_notificacoes_read on public.notificacoes for select
  using (user_id = (select auth.uid()));

drop policy if exists p_vida_read on public.vida_eventos;
create policy p_vida_read on public.vida_eventos for select
  using (user_id = (select auth.uid()));

-- -------------------------------------------------- 8. votos_validacao

-- Antes: exists (select 1 from occurrences o join habits h on h.id = o.habit_id
--          where o.id = votos_validacao.occurrence_id and h.group_id is not null
--            and public.e_membro(h.group_id))
-- Mesma forma, so a `e_membro` por linha vira a lista. `occurrences` e `habits`
-- continuam sob as proprias policies, que e a segunda pergunta que a 0026 fez
-- de proposito. `to authenticated` preservado.
drop policy if exists p_votos_read on public.votos_validacao;
create policy p_votos_read on public.votos_validacao
  for select to authenticated
  using (exists (
    select 1
      from public.occurrences o
      join public.habits h on h.id = o.habit_id
     where o.id = votos_validacao.occurrence_id
       and h.group_id in (select public.meus_grupos())
  ));

-- ------------------------------------------- 9. storage: bucket checkins

-- Antes: bucket_id = 'checkins' and ((storage.foldername(name))[1] = auth.uid()::text
--          or exists (select 1 from occurrences o join habits h on h.id = o.habit_id
--                      where o.foto_path = objects.name and h.group_id is not null
--                        and public.e_membro(h.group_id)))
-- O `o.foto_path is not null` e redundante na logica (`= objects.name` ja
-- exclui nulo) e existe para o planner poder usar o indice parcial acima.
-- O `join habits` sai do caminho por linha: a lista de habitos de grupo e
-- resolvida uma vez, e a busca em `occurrences` vira lookup por `foto_path`.
drop policy if exists p_checkins_select on storage.objects;
create policy p_checkins_select on storage.objects for select to authenticated
  using (
    bucket_id = 'checkins'
    and (
      (storage.foldername(name))[1] = ((select auth.uid()))::text
      or exists (
        select 1 from public.occurrences o
         where o.foto_path is not null
           and o.foto_path = objects.name
           and o.habit_id in (
             select h.id from public.habits h
              where h.group_id in (select public.meus_grupos())
           )
      )
    )
  );

-- Antes: bucket_id = 'checkins' and (storage.foldername(name))[1] = auth.uid()::text
drop policy if exists p_checkins_insert on storage.objects;
create policy p_checkins_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'checkins'
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

drop policy if exists p_checkins_update on storage.objects;
create policy p_checkins_update on storage.objects for update to authenticated
  using (
    bucket_id = 'checkins'
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

drop policy if exists p_checkins_delete on storage.objects;
create policy p_checkins_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'checkins'
    and (storage.foldername(name))[1] = ((select auth.uid()))::text
  );

-- --------------------------------------------- 10. storage: bucket grupos

-- Antes: bucket_id = 'grupos' and exists (select 1 from groups g
--          where g.id::text = (storage.foldername(objects.name))[1] and public.e_membro(g.id))
drop policy if exists p_grupos_select on storage.objects;
create policy p_grupos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'grupos'
    and exists (
      select 1 from public.groups g
       where g.id::text = (storage.foldername(objects.name))[1]
         and g.id in (select public.meus_grupos())
    )
  );

-- Antes: mesma forma, com `g.dono_id = auth.uid()` no lugar da `e_membro`.
drop policy if exists p_grupos_insert on storage.objects;
create policy p_grupos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'grupos'
    and exists (
      select 1 from public.groups g
       where g.id::text = (storage.foldername(objects.name))[1]
         and g.dono_id = (select auth.uid())
    )
  );

drop policy if exists p_grupos_update on storage.objects;
create policy p_grupos_update on storage.objects for update to authenticated
  using (
    bucket_id = 'grupos'
    and exists (
      select 1 from public.groups g
       where g.id::text = (storage.foldername(objects.name))[1]
         and g.dono_id = (select auth.uid())
    )
  )
  with check (
    bucket_id = 'grupos'
    and exists (
      select 1 from public.groups g
       where g.id::text = (storage.foldername(objects.name))[1]
         and g.dono_id = (select auth.uid())
    )
  );

drop policy if exists p_grupos_delete on storage.objects;
create policy p_grupos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'grupos'
    and exists (
      select 1 from public.groups g
       where g.id::text = (storage.foldername(objects.name))[1]
         and g.dono_id = (select auth.uid())
    )
  );

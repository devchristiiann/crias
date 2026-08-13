-- 0002_rls
-- RLS ligada em todas as tabelas. A UI apenas esconde, o banco e quem nega.
-- Regra estrutural: NAO existe policy de INSERT/UPDATE/DELETE para `authenticated`
-- em occurrences, streaks, redemptions, owned_items nem em profiles.ouro.
-- Quem escreve valor de jogo e RPC SECURITY DEFINER ou service_role.
-- A ausencia de policy e a trava real, nao o codigo do front.

-- Pertencimento a grupo. SECURITY DEFINER para nao recursar nas policies.
create or replace function public.e_membro(g uuid) returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from group_members where group_id = g and user_id = auth.uid()
  )
$$;

alter table public.profiles enable row level security;
drop policy if exists p_profiles_read on public.profiles;
create policy p_profiles_read on public.profiles for select using (
  id = auth.uid()
  or exists (
    select 1 from group_members a
    join group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
drop policy if exists p_profiles_update on public.profiles;
create policy p_profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

alter table public.groups enable row level security;
drop policy if exists p_groups_read on public.groups;
create policy p_groups_read on public.groups for select using (public.e_membro(id));

alter table public.group_members enable row level security;
drop policy if exists p_members_read on public.group_members;
create policy p_members_read on public.group_members for select using (public.e_membro(group_id));

alter table public.habits enable row level security;
drop policy if exists p_habits_read on public.habits;
create policy p_habits_read on public.habits for select using (
  user_id = auth.uid()
  or (group_id is not null and public.e_membro(group_id))
);
drop policy if exists p_habits_insert on public.habits;
create policy p_habits_insert on public.habits for insert with check (
  (escopo = 'user' and user_id = auth.uid())
  or (escopo = 'group' and public.e_membro(group_id))
);
drop policy if exists p_habits_update on public.habits;
create policy p_habits_update on public.habits for update using (
  user_id = auth.uid()
  or (group_id is not null and exists (
    select 1 from groups g where g.id = habits.group_id and g.dono_id = auth.uid()
  ))
);
drop policy if exists p_habits_delete on public.habits;
create policy p_habits_delete on public.habits for delete using (
  user_id = auth.uid()
  or (group_id is not null and exists (
    select 1 from groups g where g.id = habits.group_id and g.dono_id = auth.uid()
  ))
);

alter table public.occurrences enable row level security;
drop policy if exists p_occ_read on public.occurrences;
create policy p_occ_read on public.occurrences for select using (
  user_id = auth.uid()
  or exists (
    select 1 from habits h
    where h.id = occurrences.habit_id
      and h.group_id is not null
      and public.e_membro(h.group_id)
  )
);

alter table public.streaks enable row level security;
drop policy if exists p_streaks_read on public.streaks;
create policy p_streaks_read on public.streaks for select using (
  user_id = auth.uid()
  or exists (
    select 1 from habits h
    where h.id = streaks.habit_id
      and h.group_id is not null
      and public.e_membro(h.group_id)
  )
);

alter table public.rewards enable row level security;
drop policy if exists p_rewards_own on public.rewards;
create policy p_rewards_own on public.rewards for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.redemptions enable row level security;
drop policy if exists p_redemptions_read on public.redemptions;
create policy p_redemptions_read on public.redemptions for select using (user_id = auth.uid());

alter table public.avatar_items enable row level security;
drop policy if exists p_items_read on public.avatar_items;
create policy p_items_read on public.avatar_items for select using (true);

alter table public.owned_items enable row level security;
drop policy if exists p_owned_read on public.owned_items;
create policy p_owned_read on public.owned_items for select using (user_id = auth.uid());

alter table public.push_subs enable row level security;
drop policy if exists p_subs_own on public.push_subs;
create policy p_subs_own on public.push_subs for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

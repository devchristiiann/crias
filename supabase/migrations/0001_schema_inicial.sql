-- 0001_schema_inicial
-- Dez tabelas do MVP do Crias. Tudo idempotente.
-- Fuso de referencia do app inteiro: America/Sao_Paulo.

-- Data civil em Sao Paulo. Usada em toda fronteira de dia, streak e atraso.
create or replace function public.hoje_sp() returns date
language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo')::date
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  avatar_base text not null default 'base-01',
  item_equipado text,
  ouro int not null default 0 check (ouro >= 0),
  vida int not null default 50 check (vida between 0 and 50),
  xp int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dono_id uuid not null references public.profiles(id) on delete cascade,
  codigo_convite text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  papel text not null default 'membro' check (papel in ('dono', 'membro')),
  entrou_em timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  escopo text not null check (escopo in ('user', 'group')),
  group_id uuid references public.groups(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  titulo text not null,
  icone text not null default 'target',
  regra_frequencia jsonb not null,
  lembrete_hora time,
  ouro_base int not null default 10 check (ouro_base between 1 and 100),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  constraint habit_escopo_coerente check (
    (escopo = 'user' and user_id is not null and group_id is null)
    or (escopo = 'group' and group_id is not null and user_id is null)
  )
);

create table if not exists public.occurrences (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  data_sp date not null,
  vence_em timestamptz not null,
  status text not null default 'pendente' check (status in ('pendente', 'feito', 'atrasado')),
  feito_em timestamptz,
  foto_path text,
  -- Bitmask da escada de push: 1 lembrete, 2 cutucada, 4 noite, 8 consequencia.
  toques_enviados smallint not null default 0,
  proximo_toque_em timestamptz,
  -- Uso unico, resolve a acao "concluir" direto da notificacao.
  token_rapido uuid not null default gen_random_uuid(),
  unique (habit_id, user_id, data_sp)
);

create table if not exists public.streaks (
  habit_id uuid not null references public.habits(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  atual int not null default 0,
  melhor int not null default 0,
  ultima_data_sp date,
  primary key (habit_id, user_id)
);

create table if not exists public.rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  custo_ouro int not null check (custo_ouro > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reward_id uuid not null references public.rewards(id) on delete cascade,
  custo_ouro int not null,
  criado_em timestamptz not null default now()
);

create table if not exists public.avatar_items (
  id text primary key,
  nome text not null,
  slot text not null default 'acessorio',
  custo_ouro int not null check (custo_ouro >= 0),
  sprite_path text not null
);

create table if not exists public.owned_items (
  user_id uuid not null references public.profiles(id) on delete cascade,
  item_id text not null references public.avatar_items(id) on delete cascade,
  adquirido_em timestamptz not null default now(),
  primary key (user_id, item_id)
);

create table if not exists public.push_subs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  ultimo_ok timestamptz not null default now()
);

-- Indices. Meta: consulta de tela em milissegundos.
create index if not exists idx_occ_user_data on public.occurrences (user_id, data_sp);
create index if not exists idx_occ_pendente_vence on public.occurrences (vence_em)
  where status = 'pendente';
create index if not exists idx_occ_toque on public.occurrences (proximo_toque_em)
  where status = 'pendente' and proximo_toque_em is not null;
create index if not exists idx_occ_token on public.occurrences (token_rapido);
create index if not exists idx_occ_habit on public.occurrences (habit_id, data_sp);
create index if not exists idx_members_user on public.group_members (user_id);
create index if not exists idx_habits_group on public.habits (group_id) where ativo;
create index if not exists idx_habits_user on public.habits (user_id) where ativo;
create index if not exists idx_rewards_user on public.rewards (user_id) where ativo;
create index if not exists idx_subs_user on public.push_subs (user_id);

-- 0017: arte nova, loja por slot, bau com sorteio e exclusao de rotina.
--
-- Contexto do que muda e por que, para quem ler isso daqui a seis meses:
--
--  1. A arte deixou de ser matriz de 16 por 16 no codigo e virou PNG em
--     public/sprites. avatar_items passa a guardar personagem, acessorio,
--     cenario e fundo de perfil, todos no mesmo lugar, separados por slot.
--     Assim comprar_item e owned_items funcionam para tudo sem duplicar tabela.
--  2. Os 6 personagens antigos e os 12 acessorios antigos NAO sao apagados.
--     Ficam com ativo = false: somem da loja e continuam desenhando para quem
--     ja tem. Apagar quebraria o avatar de quem ja escolheu.
--  3. O bau parou de pagar 50 fixos. Agora sorteia, e o resultado fica gravado
--     em baus com chave (user_id, no), que e o que torna o premio idempotente.
--  4. excluir_habito apaga de verdade. arquivar_habito continua existindo para
--     quem so quer parar de receber lembrete.

-- ---------------------------------------------------------------- catalogo

alter table avatar_items add column if not exists ativo boolean not null default true;

-- Personagens antigos entram como itens de slot personagem e custo zero, para
-- profiles.avatar_base sempre ter correspondencia no catalogo.
insert into avatar_items (id, nome, slot, custo_ouro, sprite_path, ativo) values
  ('base-01', 'Clássico 1', 'personagem', 0, 'base-01', false),
  ('base-02', 'Clássico 2', 'personagem', 0, 'base-02', false),
  ('base-03', 'Clássico 3', 'personagem', 0, 'base-03', false),
  ('base-04', 'Clássico 4', 'personagem', 0, 'base-04', false),
  ('base-05', 'Clássico 5', 'personagem', 0, 'base-05', false),
  ('base-06', 'Clássico 6', 'personagem', 0, 'base-06', false)
on conflict (id) do update set slot = excluded.slot, ativo = excluded.ativo;

-- Os 12 acessorios de 16 por 16 saem da loja mas continuam equipaveis.
update avatar_items set ativo = false where id like 'item-%';

insert into avatar_items (id, nome, slot, custo_ouro, sprite_path, ativo) values
  ('ace-1', 'Coroa', 'acessorio', 400, '/sprites/itens/ace-1-coroa.png', true),
  ('ace-10', 'Cajado', 'acessorio', 220, '/sprites/itens/ace-10-cajado.png', true),
  ('ace-11', 'Martelo', 'acessorio', 220, '/sprites/itens/ace-11-martelo.png', true),
  ('ace-12', 'Espada de Raio', 'acessorio', 350, '/sprites/itens/ace-12-espada-de-raio.png', true),
  ('ace-14', 'Raio', 'acessorio', 300, '/sprites/itens/ace-14-raio.png', true),
  ('ace-15', 'Capa', 'acessorio', 400, '/sprites/itens/ace-15-capa.png', true),
  ('ace-16', 'Asas', 'acessorio', 700, '/sprites/itens/ace-16-asas.png', true),
  ('ace-2', 'Chapéu de Mago', 'acessorio', 250, '/sprites/itens/ace-2-chapeu-de-mago.png', true),
  ('ace-3', 'Capacete Viking', 'acessorio', 250, '/sprites/itens/ace-3-capacete-viking.png', true),
  ('anf-1', 'Panda', 'personagem', 150, '/sprites/personagens/anf-1-panda.png', true),
  ('anf-2', 'Raposa', 'personagem', 800, '/sprites/personagens/anf-2-raposa.png', true),
  ('anf-3', 'Coelho', 'personagem', 150, '/sprites/personagens/anf-3-coelho.png', true),
  ('anf-4', 'Capivara', 'personagem', 800, '/sprites/personagens/anf-4-capivara.png', true),
  ('anf-5', 'Pinguim', 'personagem', 150, '/sprites/personagens/anf-5-pinguim.png', true),
  ('anf-7', 'Filhote de Foca', 'personagem', 180, '/sprites/personagens/anf-7-filhote-de-foca.png', true),
  ('anp-1', 'T-Rex', 'personagem', 400, '/sprites/personagens/anp-1-t-rex.png', true),
  ('anp-2', 'Urso Ranzinza', 'personagem', 800, '/sprites/personagens/anp-2-urso-ranzinza.png', true),
  ('anp-4', 'Lobo', 'personagem', 800, '/sprites/personagens/anp-4-lobo.png', true),
  ('anp-6', 'Águia', 'personagem', 400, '/sprites/personagens/anp-6-aguia.png', true),
  ('atl-1', 'Camisa 10', 'personagem', 1200, '/sprites/personagens/atl-1-camisa-10.png', true),
  ('atl-2', 'Lenda do Garrafão', 'personagem', 1200, '/sprites/personagens/atl-2-lenda-do-garrafao.png', true),
  ('atl-3', 'Rei da Quadra', 'personagem', 1200, '/sprites/personagens/atl-3-rei-da-quadra.png', true),
  ('atl-4', 'Cabeceador', 'personagem', 1200, '/sprites/personagens/atl-4-cabeceador.png', true),
  ('atl-5', 'Sorriso Craque', 'personagem', 1200, '/sprites/personagens/atl-5-sorriso-craque.png', true),
  ('cen-1', 'Pedestal de Madeira', 'cenario', 100, '/sprites/cenarios/cen-1-pedestal-de-madeira.png', true),
  ('cen-10', 'Moldura Lendária', 'cenario', 700, '/sprites/cenarios/cen-10-moldura-lendaria.png', true),
  ('cen-2', 'Pedestal de Pedra', 'cenario', 150, '/sprites/cenarios/cen-2-pedestal-de-pedra.png', true),
  ('cen-3', 'Pedestal de Ouro', 'cenario', 400, '/sprites/cenarios/cen-3-pedestal-de-ouro.png', true),
  ('cen-4', 'Aura de Fogo', 'cenario', 250, '/sprites/cenarios/cen-4-aura-de-fogo.png', true),
  ('cen-5', 'Aura de Gelo', 'cenario', 250, '/sprites/cenarios/cen-5-aura-de-gelo.png', true),
  ('cen-6', 'Aura Elétrica', 'cenario', 250, '/sprites/cenarios/cen-6-aura-eletrica.png', true),
  ('cen-7', 'Chuva de Estrelas', 'cenario', 400, '/sprites/cenarios/cen-7-chuva-de-estrelas.png', true),
  ('deu-1', 'Mini Zeus', 'personagem', 500, '/sprites/personagens/deu-1-mini-zeus.png', true),
  ('deu-2', 'Mini Thor', 'personagem', 500, '/sprites/personagens/deu-2-mini-thor.png', true),
  ('deu-4', 'Poseidon', 'personagem', 500, '/sprites/personagens/deu-4-poseidon.png', true),
  ('deu-5', 'Medusa', 'personagem', 800, '/sprites/personagens/deu-5-medusa.png', true),
  ('deu-6', 'Kitsune', 'personagem', 800, '/sprites/personagens/deu-6-kitsune.png', true),
  ('fol-2', 'Curupira', 'personagem', 800, '/sprites/personagens/fol-2-curupira.png', true),
  ('fol-4', 'Boitatá', 'personagem', 500, '/sprites/personagens/fol-4-boitata.png', true),
  ('fun-1', 'Portal Celeste', 'fundo', 1500, '/sprites/fundos/fun-1-portal-celeste.png', true),
  ('fun-2', 'Caverna de Lava', 'fundo', 1500, '/sprites/fundos/fun-2-caverna-de-lava.png', true),
  ('fun-3', 'Ruínas Douradas', 'fundo', 1500, '/sprites/fundos/fun-3-ruinas-douradas.png', true),
  ('fun-4', 'Bosque Encantado', 'fundo', 1500, '/sprites/fundos/fun-4-bosque-encantado.png', true),
  ('mof-3', 'Fantasminha', 'personagem', 150, '/sprites/personagens/mof-3-fantasminha.png', true),
  ('mof-5', 'Morceguinho', 'personagem', 180, '/sprites/personagens/mof-5-morceguinho.png', true),
  ('mop-3', 'Slime Mutante', 'personagem', 300, '/sprites/personagens/mop-3-slime-mutante.png', true),
  ('mop-4', 'Esqueleto', 'personagem', 300, '/sprites/personagens/mop-4-esqueleto.png', true),
  ('mop-6', 'Golem de Pedra', 'personagem', 800, '/sprites/personagens/mop-6-golem-de-pedra.png', true),
  ('pes-1', 'Guerreira Robusta', 'personagem', 300, '/sprites/personagens/pes-1-guerreira-robusta.png', true),
  ('pes-2', 'Mago Barrigudo', 'personagem', 300, '/sprites/personagens/pes-2-mago-barrigudo.png', true),
  ('pes-3', 'Anã Ferreira', 'personagem', 150, '/sprites/personagens/pes-3-ana-ferreira.png', true),
  ('pes-4', 'Vovó Guerreira', 'personagem', 300, '/sprites/personagens/pes-4-vovo-guerreira.png', true),
  ('pes-5', 'Criança Aventureira', 'personagem', 150, '/sprites/personagens/pes-5-crianca-aventureira.png', true),
  ('pes-6', 'Corredora', 'personagem', 150, '/sprites/personagens/pes-6-corredora.png', true),
  ('rob-1', 'Robô Sucata', 'personagem', 200, '/sprites/personagens/rob-1-robo-sucata.png', true),
  ('rob-3', 'Drone Mensageiro', 'personagem', 250, '/sprites/personagens/rob-3-drone-mensageiro.png', true),
  ('rob-4', 'Andróide Polido', 'personagem', 300, '/sprites/personagens/rob-4-androide-polido.png', true)
on conflict (id) do update
  set nome = excluded.nome, slot = excluded.slot,
      custo_ouro = excluded.custo_ouro, sprite_path = excluded.sprite_path,
      ativo = excluded.ativo;

alter table avatar_items drop constraint if exists avatar_items_slot_check;
alter table avatar_items add constraint avatar_items_slot_check
  check (slot in ('personagem', 'acessorio', 'cenario', 'fundo'));

-- ------------------------------------------------------- slots no perfil

alter table profiles add column if not exists cenario_equipado text;
alter table profiles add column if not exists fundo_equipado text;

-- A trava real e a coluna sem grant, nao a policy. Sem isso da para equipar
-- item nao comprado por PATCH direto, furo que ja aconteceu duas vezes aqui.
revoke update (cenario_equipado, fundo_equipado) on profiles from public, anon, authenticated;
grant select (cenario_equipado, fundo_equipado) on profiles to authenticated;

-- Quem ja tem personagem vestido passa a ser dono dele, senao trocar e voltar
-- cobraria de novo por algo que a pessoa ja usava.
insert into owned_items (user_id, item_id)
select id, avatar_base from profiles where avatar_base is not null
on conflict do nothing;

-- ----------------------------------------------------------------- baus

create table if not exists baus (
  user_id uuid not null references profiles(id) on delete cascade,
  no integer not null,
  tipo text not null check (tipo in ('ouro', 'item')),
  ouro integer not null default 0 check (ouro >= 0),
  item_id text references avatar_items(id),
  criado_em timestamptz not null default now(),
  primary key (user_id, no)
);

alter table baus enable row level security;
drop policy if exists p_baus_read on baus;
create policy p_baus_read on baus for select using (user_id = auth.uid());

revoke all on baus from public, anon, authenticated;
grant select on baus to authenticated;

create or replace function public.abrir_bau(p_user uuid, p_no integer)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ja baus;
  v_item avatar_items;
  v_ouro integer;
begin
  -- Idempotencia: o mesmo no nunca paga duas vezes, nem se a funcao rodar de
  -- novo por reprocessamento. Sem isso, o baú vira ouro infinito.
  select * into v_ja from baus where user_id = p_user and no = p_no;
  if found then
    return json_build_object('tipo', v_ja.tipo, 'ouro', 0,
                             'item_id', v_ja.item_id, 'repetido', true);
  end if;

  -- 22% de chance de skin. Sorteia entre o que a pessoa ainda nao tem e que
  -- nao seja das faixas caras, senao o bau entrega lendario na primeira semana
  -- e a loja perde a razao de existir.
  if random() < 0.22 then
    select a.* into v_item
      from avatar_items a
     where a.ativo
       and a.custo_ouro between 1 and 500
       and not exists (select 1 from owned_items o
                        where o.user_id = p_user and o.item_id = a.id)
     order by random()
     limit 1;
  end if;

  if v_item.id is not null then
    insert into owned_items (user_id, item_id) values (p_user, v_item.id)
      on conflict do nothing;
    insert into baus (user_id, no, tipo, ouro, item_id)
      values (p_user, p_no, 'item', 0, v_item.id);
    return json_build_object('tipo', 'item', 'ouro', 0, 'item_id', v_item.id,
                             'item_nome', v_item.nome, 'repetido', false);
  end if;

  -- 30 a 150 em degraus de 10. Degrau em vez de numero cru porque valor
  -- quebrado na tela parece defeito, nao parece premio.
  v_ouro := 30 + (floor(random() * 13) * 10)::int;
  update profiles set ouro = ouro + v_ouro where id = p_user;
  insert into baus (user_id, no, tipo, ouro) values (p_user, p_no, 'ouro', v_ouro);
  return json_build_object('tipo', 'ouro', 'ouro', v_ouro, 'item_id', null,
                           'repetido', false);
end $$;

-- Interna. So check_in e check_in_por_token chamam.
revoke execute on function public.abrir_bau(uuid, integer) from public, anon, authenticated;

-- ------------------------------------------- check_in com o bau sorteado

CREATE OR REPLACE FUNCTION public.check_in(p_occ uuid, p_foto text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int;
  v_completou boolean := false; v_bau boolean := false;
  v_nos int := 0; v_primeiro_do_dia boolean;
  v_premio json;
begin
  select * into o from occurrences where id = p_occ for update;

  if not found or o.user_id <> auth.uid() then
    return json_build_object('error', 'ocorrencia_invalida');
  end if;

  -- Ocorrencia que ainda nao abriu nao vale check-in. Sem isso, quem
  -- conseguisse criar ocorrencia futura colhia o ouro de meses adiantado.
  if coalesce(o.inicio_janela, o.data_sp) > public.hoje_sp() then
    return json_build_object('error', 'ocorrencia_futura');
  end if;

  -- Caminho de foto so pode apontar para a propria pasta do usuario.
  if not public.foto_do_dono(p_foto, auth.uid()) then
    return json_build_object('error', 'foto_invalida');
  end if;

  if o.status = 'feito' then
    return json_build_object(
      'ja_feito', true,
      'ouro', (select ouro from profiles where id = auth.uid())
    );
  end if;

  select * into h from habits where id = o.habit_id;
  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  v_primeiro_do_dia := not exists (
    select 1 from occurrences
     where user_id = o.user_id and data_sp = o.data_sp
       and status = 'feito' and id <> o.id
  );

  v_completou := (o.vezes_feitas + 1) >= o.vezes_alvo;

  if not v_completou then
    v_streak := coalesce(s.atual, 0);
  elsif s.ultima_data_sp is null then
    v_streak := 1;
  elsif s.ultima_data_sp = o.data_sp then
    v_streak := s.atual;
  elsif exists (
    select 1 from occurrences x
     where x.habit_id = o.habit_id and x.user_id = o.user_id
       and x.data_sp > s.ultima_data_sp and x.data_sp < o.data_sp
       and x.status <> 'feito'
  ) then
    v_streak := 1;
  else
    v_streak := s.atual + 1;
  end if;

  v_mult := public.multiplicador(v_streak);
  v_ganho := ceil(h.ouro_base * v_mult);

  update occurrences
     set vezes_feitas = o.vezes_feitas + 1,
         status = case when v_completou then 'feito' else status end,
         feito_em = case when v_completou then now() else feito_em end,
         foto_path = coalesce(p_foto, foto_path),
         proximo_toque_em = case when v_completou then null else proximo_toque_em end
   where id = p_occ;

  if v_completou then
    insert into streaks (habit_id, user_id, atual, melhor, ultima_data_sp)
    values (o.habit_id, o.user_id, v_streak, v_streak, o.data_sp)
    on conflict (habit_id, user_id) do update
      set atual = v_streak,
          melhor = greatest(streaks.melhor, v_streak),
          ultima_data_sp = o.data_sp;
  end if;

  update profiles set ouro = ouro + v_ganho, xp = xp + v_ganho where id = o.user_id;

  if v_completou and v_primeiro_do_dia then
    select count(distinct data_sp) into v_nos
      from occurrences where user_id = o.user_id and status = 'feito';
    if v_nos % 7 = 0 then
      -- O premio e sorteado no servidor e gravado em baus, que tem chave por
      -- (user_id, no). Reprocessar o mesmo no nunca paga duas vezes.
      v_premio := public.abrir_bau(o.user_id, v_nos);
      v_bau := true;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + coalesce((v_premio->>'ouro')::int, 0),
    -- O valor do bau vem do servidor. A tela nao pode chutar numero de jogo.
    'ouro_bau', coalesce((v_premio->>'ouro')::int, 0),
    'premio', v_premio,
    'streak', v_streak,
    'multiplicador', v_mult,
    'completou', v_completou,
    'vezes_feitas', o.vezes_feitas + 1,
    'vezes_alvo', o.vezes_alvo,
    'bau', v_bau,
    'no', v_nos
  );
end $function$;

CREATE OR REPLACE FUNCTION public.check_in_por_token(p_token uuid, p_acao text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  o occurrences; h habits; s streaks;
  v_ganho int; v_mult numeric; v_streak int; v_completou boolean;
  v_bau boolean := false; v_nos int := 0; v_primeiro boolean;
  v_premio json;
begin
  select * into o from occurrences where token_rapido = p_token for update;
  if not found then
    return json_build_object('error', 'token_invalido');
  end if;

  if p_acao = 'adiar' then
    update occurrences
       set proximo_toque_em = least(now() + interval '1 hour', vence_em),
           token_rapido = gen_random_uuid()
     where id = o.id;
    return json_build_object('ok', true, 'adiado', true);
  end if;

  if coalesce(o.inicio_janela, o.data_sp) > public.hoje_sp() then
    return json_build_object('error', 'ocorrencia_futura');
  end if;

  if o.status = 'feito' then
    return json_build_object('ja_feito', true, 'ouro_ganho', 0,
      'streak', coalesce((select atual from streaks
                           where habit_id = o.habit_id and user_id = o.user_id), 0));
  end if;

  select * into h from habits where id = o.habit_id;
  select * into s from streaks where habit_id = o.habit_id and user_id = o.user_id;

  v_primeiro := not exists (
    select 1 from occurrences
     where user_id = o.user_id and data_sp = o.data_sp and status = 'feito' and id <> o.id
  );
  v_completou := (o.vezes_feitas + 1) >= o.vezes_alvo;

  if not v_completou then
    v_streak := coalesce(s.atual, 0);
  elsif s.ultima_data_sp is null then
    v_streak := 1;
  elsif s.ultima_data_sp = o.data_sp then
    v_streak := s.atual;
  elsif exists (
    select 1 from occurrences x
     where x.habit_id = o.habit_id and x.user_id = o.user_id
       and x.data_sp > s.ultima_data_sp and x.data_sp < o.data_sp and x.status <> 'feito'
  ) then
    v_streak := 1;
  else
    v_streak := s.atual + 1;
  end if;

  v_mult := public.multiplicador(v_streak);
  v_ganho := ceil(h.ouro_base * v_mult);

  update occurrences
     set vezes_feitas = o.vezes_feitas + 1,
         status = case when v_completou then 'feito' else status end,
         feito_em = case when v_completou then now() else feito_em end,
         proximo_toque_em = case when v_completou then null else proximo_toque_em end,
         token_rapido = gen_random_uuid()
   where id = o.id;

  if v_completou then
    insert into streaks (habit_id, user_id, atual, melhor, ultima_data_sp)
    values (o.habit_id, o.user_id, v_streak, v_streak, o.data_sp)
    on conflict (habit_id, user_id) do update
      set atual = v_streak,
          melhor = greatest(streaks.melhor, v_streak),
          ultima_data_sp = o.data_sp;
  end if;

  update profiles set ouro = ouro + v_ganho, xp = xp + v_ganho where id = o.user_id;

  if v_completou and v_primeiro then
    select count(distinct data_sp) into v_nos
      from occurrences where user_id = o.user_id and status = 'feito';
    if v_nos % 7 = 0 then
      -- O premio e sorteado no servidor e gravado em baus, que tem chave por
      -- (user_id, no). Reprocessar o mesmo no nunca paga duas vezes.
      v_premio := public.abrir_bau(o.user_id, v_nos);
      v_bau := true;
    end if;
  end if;

  return json_build_object(
    'ouro_ganho', v_ganho + coalesce((v_premio->>'ouro')::int, 0),
    'ouro_bau', coalesce((v_premio->>'ouro')::int, 0),
    'premio', v_premio,
    'streak', v_streak,
    'completou', v_completou,
    'bau', v_bau
  );
end $function$;

-- --------------------------------------------------- personagem e slots

create or replace function public.trocar_personagem(p_base text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_p profiles;
  v_item avatar_items;
  v_possui boolean;
  v_custo integer := 0;
  v_teto_gratis constant integer := 200;
begin
  select * into v_p from profiles where id = auth.uid() for update;
  if not found then return json_build_object('error', 'sem_perfil'); end if;

  select * into v_item from avatar_items where id = p_base and slot = 'personagem';
  if not found then return json_build_object('error', 'base_invalida'); end if;

  -- Reconfirmar quem ja esta vestido nao cobra.
  if p_base = v_p.avatar_base then
    update profiles set personagem_definido = true where id = auth.uid();
    return json_build_object('ok', true, 'base', p_base, 'custo', 0, 'ouro', v_p.ouro);
  end if;

  v_possui := exists (select 1 from owned_items
                       where user_id = auth.uid() and item_id = p_base);

  -- Personagem que ja e seu troca de graca. So a primeira aquisicao cobra. E a
  -- escolha do onboarding so e gratis na faixa inicial: sem esse teto, o
  -- primeiro clique levaria um lendario de 1200 sem pagar nada.
  if not v_possui
     and (v_p.personagem_definido or v_item.custo_ouro > v_teto_gratis) then
    v_custo := v_item.custo_ouro;
    if v_p.ouro < v_custo then
      return json_build_object('error', 'ouro_insuficiente');
    end if;
  end if;

  update profiles
     set avatar_base = p_base, personagem_definido = true, ouro = ouro - v_custo
   where id = auth.uid();
  insert into owned_items (user_id, item_id) values (auth.uid(), p_base)
    on conflict do nothing;

  return json_build_object('ok', true, 'base', p_base, 'custo', v_custo,
                           'ouro', v_p.ouro - v_custo);
end $$;

-- A assinatura ganhou um argumento, entao nao da para usar create or replace:
-- ficariam duas versoes e a chamada com um argumento so viraria ambigua.
drop function if exists public.equipar_item(text);

create or replace function public.equipar_item(p_item text, p_slot text default null)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_slot text;
begin
  if p_item is null then
    -- Tirar precisa saber de onde. Sem o slot, o padrao e o acessorio, que era
    -- o unico que existia antes desta migration.
    v_slot := coalesce(p_slot, 'acessorio');
  else
    select slot into v_slot from avatar_items where id = p_item;
    if v_slot is null then return json_build_object('error', 'item_inexistente'); end if;
    if not exists (select 1 from owned_items
                    where user_id = auth.uid() and item_id = p_item) then
      return json_build_object('error', 'item_nao_possuido');
    end if;
  end if;

  if v_slot = 'acessorio' then
    update profiles set item_equipado = p_item where id = auth.uid();
  elsif v_slot = 'cenario' then
    update profiles set cenario_equipado = p_item where id = auth.uid();
  elsif v_slot = 'fundo' then
    update profiles set fundo_equipado = p_item where id = auth.uid();
  elsif v_slot = 'personagem' then
    return public.trocar_personagem(p_item);
  else
    return json_build_object('error', 'slot_invalido');
  end if;

  return json_build_object('ok', true, 'slot', v_slot);
end $$;

-- comprar_item so pode vender o que esta ativo, senao da para comprar item
-- aposentado mandando o id na mao.
create or replace function public.comprar_item(p_item text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v_custo integer; v_ouro integer;
begin
  if exists (select 1 from owned_items
              where user_id = auth.uid() and item_id = p_item) then
    return json_build_object('ja_possui', true);
  end if;

  select custo_ouro into v_custo from avatar_items where id = p_item and ativo;
  if not found then return json_build_object('error', 'item_inexistente'); end if;

  select ouro into v_ouro from profiles where id = auth.uid() for update;
  if v_ouro < v_custo then return json_build_object('error', 'ouro_insuficiente'); end if;

  update profiles set ouro = ouro - v_custo where id = auth.uid();
  insert into owned_items (user_id, item_id) values (auth.uid(), p_item)
    on conflict do nothing;

  return json_build_object('ok', true, 'ouro', v_ouro - v_custo);
end $$;

-- ------------------------------------------------------ excluir rotina

create or replace function public.excluir_habito(p_habito uuid)
returns json
language plpgsql
security definer
set search_path to 'public'
as $$
declare v habits;
begin
  select * into v from habits where id = p_habito;

  -- Resposta unica para inexistente e para sem permissao: mensagem diferente
  -- deixa descobrir quais ids existem no banco.
  if not found
     or (v.escopo = 'user' and v.user_id <> auth.uid())
     or (v.escopo = 'group' and not exists (
           select 1 from groups g where g.id = v.group_id and g.dono_id = auth.uid()))
  then
    return json_build_object('error', 'sem_permissao');
  end if;

  -- Apaga o historico junto. Rotina de grupo some para todo mundo, e e por
  -- isso que so o dono do grupo pode chamar. Quem quer so parar o lembrete
  -- usa arquivar_habito, que preserva o passado.
  delete from occurrences where habit_id = p_habito;
  delete from streaks where habit_id = p_habito;
  delete from habits where id = p_habito;

  return json_build_object('ok', true);
end $$;

-- --------------------------------------------------------------- grants

-- revoke de public e anon nao tira o execute de authenticated: o Supabase
-- concede por padrao a esse papel. Por isso os tres, e so entao o grant.
revoke execute on function public.trocar_personagem(text) from public, anon, authenticated;
revoke execute on function public.equipar_item(text, text) from public, anon, authenticated;
revoke execute on function public.comprar_item(text) from public, anon, authenticated;
revoke execute on function public.excluir_habito(uuid) from public, anon, authenticated;
revoke execute on function public.check_in(uuid, text) from public, anon, authenticated;
revoke execute on function public.check_in_por_token(uuid, text) from public, anon, authenticated;

grant execute on function public.trocar_personagem(text) to authenticated;
grant execute on function public.equipar_item(text, text) to authenticated;
grant execute on function public.comprar_item(text) to authenticated;
grant execute on function public.excluir_habito(uuid) to authenticated;
grant execute on function public.check_in(uuid, text) to authenticated;

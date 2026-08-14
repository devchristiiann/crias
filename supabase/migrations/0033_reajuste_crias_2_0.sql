-- 0033_reajuste_crias_2_0
--
-- Reajuste das seis rotinas do grupo Crias 2.0, pedido pelo dono. Nenhuma trava
-- do sistema muda: o teto continua 30, a loja continua com o mesmo preco, o bau
-- continua sorteando o mesmo. So o `ouro_base` das seis rotinas sobe, dentro do
-- teto que ja existia.
--
--   Acordar cedo ............ 10 -> 30   (fator 3)
--   Estudo de ingles ........ 10 -> 30   (fator 3)
--   Academia ................ 10 -> 30   (fator 3)
--   < 2 horas em redes ...... 10 -> 30   (fator 3)
--   3 litros de agua ........ 10 -> 25   (fator 2.5), e 5 copos viram 6
--   Ler 15 minutos minimo ... 10 -> 20   (fator 2)
--
-- Quem ja fez nao perde: cada check-in ja pago e reescrito pelo fator da propria
-- rotina e a diferenca cai na carteira. Isso corrige as duas contas de uma vez,
-- porque o ranking do grupo soma `occurrences.ouro_creditado` e a carteira e
-- `profiles.ouro`: mexer so numa poria a tela e o placar em desacordo. Ouro de
-- bau, de rotina individual e o que ja foi gasto na loja nao sao tocados.
--
-- Em `acordar` o pagamento sai da faixa de horario, nao do `ouro_base`, entao as
-- quatro faixas sobem juntas pelo mesmo fator: quem acorda mais cedo continua
-- ganhando mais que quem acorda mais tarde, na mesma proporcao de antes.
--
-- A migration inteira e um bloco unico com guarda no comeco, e nao um `update`
-- solto, porque o credito retroativo NAO e idempotente: rodar duas vezes pagaria
-- duas vezes. A guarda le o `ouro_base` do Acordar cedo, que muda dentro do
-- proprio bloco, entao a segunda execucao sai sem fazer nada.

do $$
declare
  v_acordar constant uuid := 'afa32130-ef06-4e9e-a87d-302065d42cdc';
  v_ingles  constant uuid := 'e3dd58ed-8724-40c4-b524-3b8e8f7dd3b6';
  v_academia constant uuid := '4bd75dfb-6a0e-47e7-9164-e3d31f50d97d';
  v_redes   constant uuid := '7ad40a82-0276-49f5-8a5c-c35cef44b996';
  v_agua    constant uuid := '97dd15dd-85ee-47bc-9228-000c7ac592a2';
  v_ler     constant uuid := '9bdcf4fb-6cef-4b55-bdaa-6d8c361a1cec';
begin
  if (select ouro_base from public.habits where id = v_acordar) = 30 then
    raise notice '0033 ja aplicada, nada a fazer';
    return;
  end if;

  -- ------------------------------------------------- 1. retroativo, antes de tudo
  --
  -- Roda ANTES do reajuste de proposito: o fator vem da tabela de valores abaixo,
  -- nao de uma divisao entre o novo e o velho `ouro_base`, entao a ordem nao muda
  -- a conta. Mas ler o passado antes de mexer no presente e o que deixa a conta
  -- conferivel: `sum(ouro_creditado)` antes vezes o fator tem que dar o depois.
  with fator (habit_id, f) as (
    values
      (v_acordar,  3.0),
      (v_ingles,   3.0),
      (v_academia, 3.0),
      (v_redes,    3.0),
      (v_agua,     2.5),
      (v_ler,      2.0)
  ),
  novo as (
    select o.id, o.user_id,
           o.ouro_creditado as antigo,
           round(o.ouro_creditado * f.f)::int as novo
      from public.occurrences o
      join fator f on f.habit_id = o.habit_id
     where o.ouro_creditado > 0
  ),
  aplicado as (
    update public.occurrences o
       set ouro_creditado = n.novo
      from novo n
     where o.id = n.id
    returning n.user_id, n.novo - n.antigo as delta
  ),
  credito as (
    select user_id, sum(delta)::int as delta
      from aplicado
     group by user_id
  )
  -- `xp` acompanha porque o `check_in` credita os dois com o mesmo valor: deixar
  -- so o ouro subir faria o nivel do personagem descolar do ouro ganho.
  update public.profiles p
     set ouro = p.ouro + c.delta,
         xp = p.xp + c.delta
    from credito c
   where p.id = c.user_id;

  -- ------------------------------------------------------ 2. o valor das rotinas

  update public.habits set ouro_base = 30 where id in (v_ingles, v_academia, v_redes);
  update public.habits set ouro_base = 25 where id = v_agua;
  update public.habits set ouro_base = 20 where id = v_ler;

  -- `ouro_base` do acordar espelha a primeira faixa, como em `criar_habito`.
  update public.habits
     set ouro_base = 30,
         config = jsonb_build_object('faixas', jsonb_build_array(
           jsonb_build_object('ate', '06:00', 'ouro', 30),
           jsonb_build_object('ate', '07:00', 'ouro', 21),
           jsonb_build_object('ate', '08:00', 'ouro', 12),
           jsonb_build_object('ate', '09:00', 'ouro', 3)
         ))
   where id = v_acordar;

  -- ------------------------------------------------------------- 3. sexto copo

  update public.habits
     set config = jsonb_set(config, '{vezes}', '6'::jsonb)
   where id = v_agua;

  -- A ocorrencia ja existente guarda o alvo de copos que valia no dia em que ela
  -- nasceu, e `gerar_ocorrencias` nao volta para corrigir: sem este update, o
  -- sexto copo so apareceria daqui a dois dias. Dia passado fica como estava,
  -- porque mudar o alvo de um dia que ja acabou e mudar a regra depois do jogo.
  update public.occurrences o
     set vezes_alvo = 6
    from public.habits h
   where h.id = o.habit_id
     and h.id = v_agua
     and o.status <> 'feito'
     and o.data_sp >= public.hoje_sp();
end $$;

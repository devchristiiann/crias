-- 0036 Aviso alcanca tambem quem nao tem aparelho inscrito.
--
-- `avisos_pendentes` fazia join interno com `push_subs`, entao quem nunca ligou
-- o push, ou trocou de aparelho, nao aparecia na fila: o aviso ficava pendente
-- para sempre e a linha em `notificacoes` nunca era gravada. Das 7 contas reais
-- do brinde, 3 estavam nessa situacao. Com left join a fila entrega todo mundo,
-- e o despacho pula o envio quando nao ha endpoint, mas ainda grava o registro.

create or replace function public.avisos_pendentes(p_limite int default 200)
returns table (
  aviso_id uuid,
  user_id uuid,
  titulo text,
  corpo text,
  url text,
  endpoint text,
  p256dh text,
  auth text
)
language sql
security definer
set search_path = public
as $$
  select a.id, a.user_id, a.titulo, a.corpo, a.url, s.endpoint, s.p256dh, s.auth
    from avisos a
    left join push_subs s on s.user_id = a.user_id
   where a.enviado_em is null
   order by a.criado_em
   limit p_limite;
$$;

revoke execute on function public.avisos_pendentes(int) from public, anon, authenticated;
grant execute on function public.avisos_pendentes(int) to service_role;

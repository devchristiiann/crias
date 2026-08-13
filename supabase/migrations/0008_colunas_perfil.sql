-- 0008_colunas_perfil
-- RLS decide QUAIS LINHAS, nunca QUAIS COLUNAS. Com a policy de update em
-- profiles valendo para a linha inteira, qualquer usuario podia dar
--   PATCH /rest/v1/profiles?id=eq.<eu>  {"ouro": 999999}
-- e se auto premiar. A trava correta e privilegio de coluna.

revoke update on public.profiles from authenticated;
grant update (nome, avatar_base, item_equipado) on public.profiles to authenticated;

-- Insert tambem nao: o perfil nasce pelo trigger on_auth_user_created.
revoke insert, delete on public.profiles from authenticated;

-- Mesmo raciocinio nas outras tabelas de valor: a escrita passa por RPC.
revoke insert, update, delete on public.occurrences from authenticated, anon;
revoke insert, update, delete on public.streaks from authenticated, anon;
revoke insert, update, delete on public.redemptions from authenticated, anon;
revoke insert, update, delete on public.owned_items from authenticated, anon;
revoke insert, update, delete on public.avatar_items from authenticated, anon;
revoke insert, update, delete on public.groups from authenticated, anon;
revoke insert, update, delete on public.group_members from authenticated, anon;

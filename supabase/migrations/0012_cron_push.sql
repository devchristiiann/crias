-- 0012_cron_push
-- O pg_cron precisa mandar o segredo interno no header, e o segredo nao pode
-- ficar escrito na definicao do job nem em arquivo versionado. Ele vive numa
-- tabela em schema proprio: o PostgREST so expoe `public`, entao `privado`
-- e invisivel pela API, e as permissoes sao revogadas de todo mundo.
-- O valor e gravado por script, fora do git.

create schema if not exists privado;
revoke all on schema privado from public, anon, authenticated;

create table if not exists privado.config (
  chave text primary key,
  valor text not null,
  atualizado_em timestamptz not null default now()
);

revoke all on table privado.config from public, anon, authenticated;
alter table privado.config enable row level security;

create or replace function privado.segredo(p_chave text) returns text
language sql stable security definer set search_path = privado as $$
  select valor from privado.config where chave = p_chave
$$;

revoke execute on function privado.segredo(text) from public, anon, authenticated;

-- Dispatch da escada de toques a cada 5 minutos.
select cron.unschedule('push-dispatch')
  where exists (select 1 from cron.job where jobname = 'push-dispatch');

select cron.schedule(
  'push-dispatch',
  '*/5 * * * *',
  $cron$
    select net.http_post(
      url := 'https://oeaftenwsmbkdxqseqrb.supabase.co/functions/v1/push-dispatch',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-internal-secret', privado.segredo('internal_secret')
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 25000
    )
  $cron$
);

-- Lembrete para quem for depurar: cron.job_run_details mostra "succeeded" mesmo
-- quando a chamada falha, porque o pg_net so ENFILEIRA o request. O status real
-- de cada chamada esta em net._http_response.

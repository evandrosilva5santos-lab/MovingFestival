-- ==============================================================================
-- Moving Festival 2026 — Entrar com código por e-mail / Esqueci minha senha
-- Rode no SQL Editor do Supabase (projeto Start Metrcis). Só cria objetos moving_excluir_*.
-- Depois cadastre a chave do Resend no cofre (passo 3 no fim deste arquivo).
-- ==============================================================================

create table if not exists public.moving_excluir_codigos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.moving_excluir_usuarios(id) on delete cascade,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas int not null default 0,
  usado boolean not null default false,
  criado_em timestamptz not null default now()
);
comment on table public.moving_excluir_codigos is '[Moving_Excluir] Códigos de acesso por e-mail do painel Moving (só o hash do código, válidos por 10 min).';
create index if not exists moving_excluir_codigos_usuario_idx on public.moving_excluir_codigos (usuario_id, criado_em desc);
alter table public.moving_excluir_codigos enable row level security;
revoke all on public.moving_excluir_codigos from anon, authenticated;

alter table public.moving_excluir_sessoes add column if not exists via_codigo boolean not null default false;

-- 1) Gera e envia o código (o código nunca sai do banco, só pelo e-mail)
create or replace function public.moving_excluir_codigo_enviar(p_email text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(coalesce(p_email,''))); v_user record; v_codigo text; v_chave text; v_de text; v_recentes int; v_html text;
  v_generico jsonb := jsonb_build_object('ok', true, 'mensagem', 'Se esse e-mail tiver acesso ao painel, enviamos um código. Ele vale por 10 minutos.');
begin
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return jsonb_build_object('ok', false, 'erro', 'Digite um e-mail válido.'); end if;
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'moving_excluir_resend_key';
  if v_chave is null or v_chave = '' then
    return jsonb_build_object('ok', false, 'erro', 'O envio de código por e-mail ainda não foi configurado. Entre com usuário e senha ou fale com o administrador.');
  end if;
  select decrypted_secret into v_de from vault.decrypted_secrets where name = 'moving_excluir_email_remetente';
  v_de := coalesce(nullif(v_de,''), 'Painel Moving <onboarding@resend.dev>');
  select * into v_user from public.moving_excluir_usuarios where login = v_email and ativo;
  if not found then perform pg_sleep(0.4); return v_generico; end if;
  select count(*) into v_recentes from public.moving_excluir_codigos where usuario_id = v_user.id and criado_em > now() - interval '15 minutes';
  if v_recentes >= 3 then return jsonb_build_object('ok', false, 'erro', 'Muitos códigos pedidos. Espere alguns minutos e tente de novo.'); end if;
  update public.moving_excluir_codigos set usado = true where usuario_id = v_user.id and not usado;
  v_codigo := lpad(((('x' || encode(gen_random_bytes(4), 'hex'))::bit(32)::bigint % 1000000))::text, 6, '0');
  insert into public.moving_excluir_codigos (usuario_id, codigo_hash, expira_em)
    values (v_user.id, encode(digest(v_user.id::text || ':' || v_codigo, 'sha256'), 'hex'), now() + interval '10 minutes');
  v_html := '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#111">'
    || '<h2 style="margin:0 0 8px">Painel Moving Festival 2026</h2>'
    || '<p>Olá, ' || replace(replace(v_user.nome,'<',''),'>','') || '! Seu código de acesso é:</p>'
    || '<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#2B6CF6">' || v_codigo || '</p>'
    || '<p>Ele vale por <b>10 minutos</b> e só pode ser usado uma vez.</p>'
    || '<p style="color:#666;font-size:12px">Se não foi você que pediu, ignore este e-mail.</p></div>';
  perform net.http_post(url := 'https://api.resend.com/emails',
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_chave, 'Content-Type', 'application/json'),
    body := jsonb_build_object('from', v_de, 'to', jsonb_build_array(v_user.login), 'subject', 'Seu código de acesso: ' || v_codigo, 'html', v_html),
    timeout_milliseconds := 15000);
  return v_generico;
end $$;
comment on function public.moving_excluir_codigo_enviar(text) is '[Moving_Excluir] Gera e envia por e-mail (Resend) um código de acesso de 6 dígitos.';

-- 2) Entra com o código (5 tentativas por código)
create or replace function public.moving_excluir_codigo_entrar(p_email text, p_codigo text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_email text := lower(trim(coalesce(p_email,''))); v_cod text := regexp_replace(coalesce(p_codigo,''), '\D', '', 'g'); v_user record; v_c record; v_token text;
begin
  select * into v_user from public.moving_excluir_usuarios where login = v_email and ativo;
  if not found then perform pg_sleep(0.4); return jsonb_build_object('ok', false, 'erro', 'Código inválido ou expirado.'); end if;
  select * into v_c from public.moving_excluir_codigos where usuario_id = v_user.id and not usado and expira_em > now() order by criado_em desc limit 1;
  if not found then return jsonb_build_object('ok', false, 'erro', 'Código inválido ou expirado. Peça um novo.'); end if;
  if v_c.codigo_hash <> encode(digest(v_user.id::text || ':' || v_cod, 'sha256'), 'hex') then
    update public.moving_excluir_codigos set tentativas = tentativas + 1, usado = (tentativas + 1 >= 5) where id = v_c.id;
    perform pg_sleep(0.4);
    return jsonb_build_object('ok', false, 'erro', case when v_c.tentativas + 1 >= 5 then 'Código bloqueado depois de 5 tentativas. Peça um novo.' else 'Código incorreto. Tentativa ' || (v_c.tentativas + 1) || ' de 5.' end);
  end if;
  update public.moving_excluir_codigos set usado = true where id = v_c.id;
  update public.moving_excluir_usuarios set tentativas = 0, bloqueado_ate = null, ultimo_acesso = now() where id = v_user.id;
  v_token := encode(gen_random_bytes(32), 'hex');
  insert into public.moving_excluir_sessoes (token_hash, usuario_id, expira_em, via_codigo)
    values (encode(digest(v_token, 'sha256'), 'hex'), v_user.id, now() + interval '30 days', true);
  return jsonb_build_object('ok', true, 'token', v_token, 'via_codigo', true,
    'usuario', jsonb_build_object('id', v_user.id, 'login', v_user.login, 'nome', v_user.nome, 'papel', v_user.papel, 'telas', v_user.telas));
end $$;
comment on function public.moving_excluir_codigo_entrar(text, text) is '[Moving_Excluir] Login com o código de 6 dígitos enviado por e-mail.';

-- 3) Nova senha sem a atual: só numa sessão aberta por código há menos de 15 minutos
create or replace function public.moving_excluir_senha_redefinir(p_token text, p_nova text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_s record;
begin
  if coalesce(p_nova,'') = '' or length(p_nova) < 6 then return jsonb_build_object('ok', false, 'erro', 'A nova senha deve ter no mínimo 6 caracteres.'); end if;
  select * into v_s from public.moving_excluir_sessoes where token_hash = encode(digest(coalesce(p_token,''), 'sha256'), 'hex') and expira_em > now();
  if not found then return jsonb_build_object('ok', false, 'erro', 'Sessão inválida ou expirada.'); end if;
  if not v_s.via_codigo or v_s.criado_em < now() - interval '15 minutes' then
    return jsonb_build_object('ok', false, 'erro', 'Para criar uma senha nova sem a atual, entre de novo com um código enviado por e-mail.');
  end if;
  update public.moving_excluir_usuarios set senha_hash = crypt(p_nova, gen_salt('bf')), tentativas = 0, bloqueado_ate = null where id = v_s.usuario_id;
  delete from public.moving_excluir_sessoes where usuario_id = v_s.usuario_id and token_hash <> v_s.token_hash;
  update public.moving_excluir_sessoes set via_codigo = false where token_hash = v_s.token_hash;
  return jsonb_build_object('ok', true);
end $$;
comment on function public.moving_excluir_senha_redefinir(text, text) is '[Moving_Excluir] Cria senha nova logo após entrar com código por e-mail.';

revoke all on function public.moving_excluir_codigo_enviar(text), public.moving_excluir_codigo_entrar(text, text), public.moving_excluir_senha_redefinir(text, text) from public;
grant execute on function public.moving_excluir_codigo_enviar(text), public.moving_excluir_codigo_entrar(text, text), public.moving_excluir_senha_redefinir(text, text) to anon, authenticated;

-- ==============================================================================
-- PASSO 3 — chave do Resend (https://resend.com → API Keys). Rode UMA vez, trocando o valor:
--   select vault.create_secret('re_COLE_A_CHAVE_AQUI', 'moving_excluir_resend_key');
-- Remetente (precisa ser de um domínio verificado no Resend, ex.: startinc.com.br):
--   select vault.create_secret('Painel Moving <painel@startinc.com.br>', 'moving_excluir_email_remetente');
-- Sem domínio verificado, o Resend só entrega para o e-mail dono da conta Resend (teste).
-- ==============================================================================

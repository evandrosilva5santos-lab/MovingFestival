-- ==============================================================================
-- CONTROLE DE ACESSO E AUTENTICAÇÃO — MOVING FESTIVAL 2026
-- Projeto: Start Metrcis (etjqbqorawnnvdlmztka)
-- Prefixo obrigatório: moving_excluir_
-- Comentários obrigatórios: [Moving_Excluir]
-- ==============================================================================

-- 1. Habilitar extensões necessárias (se não estiverem ativas)
create extension if not exists pgcrypto with schema extensions;

-- ==============================================================================
-- 2. TABELA DE USUÁRIOS
-- ==============================================================================
create table if not exists public.moving_excluir_usuarios (
  id             uuid primary key default gen_random_uuid(),
  login          text unique not null,
  nome           text not null,
  senha_hash     text not null,
  papel          text not null check (papel in ('superadmin', 'admin', 'usuario')),
  telas          text[] not null default '{}',
  ativo          boolean not null default true,
  tentativas     int not null default 0,
  bloqueado_ate  timestamptz,
  ultimo_acesso  timestamptz,
  criado_em      timestamptz not null default now()
);

comment on table public.moving_excluir_usuarios is '[Moving_Excluir] Controle de acesso e usuários do Painel Moving Festival 2026. Tabela temporária: apagar após o festival.';
comment on column public.moving_excluir_usuarios.login is 'Identificador único em minúsculo (aceita username ou e-mail).';
comment on column public.moving_excluir_usuarios.senha_hash is 'Hash bcrypt seguro gerado via pgcrypto.';
comment on column public.moving_excluir_usuarios.papel is 'Nível de privilégio: superadmin (tudo + tela Usuários), admin (todas as telas de vendas), usuario (apenas telas permitidas).';
comment on column public.moving_excluir_usuarios.telas is 'Lista de data-view liberados para o usuário (ex: overview, diario, plataformas, promoters, ingressos, tendencias).';

create index if not exists moving_excluir_usuarios_login_idx on public.moving_excluir_usuarios (login);

-- ==============================================================================
-- 3. TABELA DE SESSÕES (TOKEN SHA256)
-- ==============================================================================
create table if not exists public.moving_excluir_sessoes (
  token_hash  text primary key,
  usuario_id  uuid not null references public.moving_excluir_usuarios(id) on delete cascade,
  expira_em   timestamptz not null default (now() + interval '30 days'),
  criado_em   timestamptz not null default now()
);

comment on table public.moving_excluir_sessoes is '[Moving_Excluir] Sessões ativas de login do Painel Moving Festival 2026. Guarda apenas SHA256 do token. Tabela temporária: apagar após o festival.';

create index if not exists moving_excluir_sessoes_usuario_idx on public.moving_excluir_sessoes (usuario_id);
create index if not exists moving_excluir_sessoes_expira_idx on public.moving_excluir_sessoes (expira_em);

-- ==============================================================================
-- 4. ROW LEVEL SECURITY (RLS)
-- ==============================================================================
alter table public.moving_excluir_usuarios enable row level security;
alter table public.moving_excluir_sessoes enable row level security;

-- Não criamos policies públicas: acesso direto para anon é 100% bloqueado.
-- Todo o tráfego ocorre exclusivamente pelas funções SECURITY DEFINER abaixo.

-- ==============================================================================
-- 5. FUNÇÕES SECURITY DEFINER
-- ==============================================================================

-- 5.1 LOGIN: Valida credenciais, controle de 6 tentativas com bloqueio de 15 min, gera token
create or replace function public.moving_excluir_login(p_login text, p_senha text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_login text;
  v_user record;
  v_tentativas int;
  v_min_restantes int;
  v_token text;
  v_token_hash text;
begin
  v_login := lower(trim(coalesce(p_login, '')));
  if v_login = '' or coalesce(p_senha, '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Informe o usuário e a senha.');
  end if;

  select * into v_user from public.moving_excluir_usuarios where login = v_login;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Usuário ou senha incorretos.');
  end if;

  if not v_user.ativo then
    return jsonb_build_object('ok', false, 'erro', 'Acesso desativado. Contate o administrador.');
  end if;

  -- Checar bloqueio temporário por tentativas
  if v_user.bloqueado_ate is not null and v_user.bloqueado_ate > now() then
    v_min_restantes := greatest(1, ceil(extract(epoch from (v_user.bloqueado_ate - now())) / 60));
    return jsonb_build_object(
      'ok', false,
      'erro', 'Muitas tentativas incorretas. Conta bloqueada temporariamente. Tente novamente em ' || v_min_restantes || ' minuto(s).'
    );
  end if;

  -- Conferir senha com bcrypt
  if v_user.senha_hash <> crypt(p_senha, v_user.senha_hash) then
    v_tentativas := v_user.tentativas + 1;
    if v_tentativas >= 6 then
      update public.moving_excluir_usuarios
      set tentativas = 0, bloqueado_ate = now() + interval '15 minutes'
      where id = v_user.id;

      return jsonb_build_object(
        'ok', false,
        'erro', 'Senha incorreta excedida 6 vezes. Conta bloqueada por 15 minutos.'
      );
    else
      update public.moving_excluir_usuarios
      set tentativas = v_tentativas
      where id = v_user.id;

      return jsonb_build_object(
        'ok', false,
        'erro', 'Usuário ou senha incorretos. Tentativa ' || v_tentativas || ' de 6.'
      );
    end if;
  end if;

  -- Senha correta: limpar bloqueio e registrar acesso
  update public.moving_excluir_usuarios
  set tentativas = 0,
      bloqueado_ate = null,
      ultimo_acesso = now()
  where id = v_user.id;

  -- Gerar token criptográfico (32 bytes em hex)
  v_token := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token, 'sha256'), 'hex');

  -- Registrar sessão por 30 dias
  insert into public.moving_excluir_sessoes (token_hash, usuario_id, expira_em)
  values (v_token_hash, v_user.id, now() + interval '30 days');

  return jsonb_build_object(
    'ok', true,
    'token', v_token,
    'usuario', jsonb_build_object(
      'id', v_user.id,
      'login', v_user.login,
      'nome', v_user.nome,
      'papel', v_user.papel,
      'telas', v_user.telas
    )
  );
end;
$$;
comment on function public.moving_excluir_login(text, text) is '[Moving_Excluir] Autenticação de usuário com proteção contra força bruta (6 tentativas, 15 min de bloqueio) e emissão de token de sessão.';

-- 5.2 ME: Valida token e devolve dados do usuário logado
create or replace function public.moving_excluir_me(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token_hash text;
  v_user record;
begin
  if coalesce(p_token, '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Token não fornecido.');
  end if;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select u.*
  into v_user
  from public.moving_excluir_sessoes s
  join public.moving_excluir_usuarios u on u.id = s.usuario_id
  where s.token_hash = v_token_hash
    and s.expira_em > now()
    and u.ativo = true
    and (u.bloqueado_ate is null or u.bloqueado_ate <= now());

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Sessão inválida ou expirada.');
  end if;

  return jsonb_build_object(
    'ok', true,
    'usuario', jsonb_build_object(
      'id', v_user.id,
      'login', v_user.login,
      'nome', v_user.nome,
      'papel', v_user.papel,
      'telas', v_user.telas
    )
  );
end;
$$;
comment on function public.moving_excluir_me(text) is '[Moving_Excluir] Valida o token e retorna os dados e permissões do usuário logado.';

-- 5.3 LOGOUT: Destrói a sessão
create or replace function public.moving_excluir_logout(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token_hash text;
begin
  if coalesce(p_token, '') <> '' then
    v_token_hash := encode(digest(p_token, 'sha256'), 'hex');
    delete from public.moving_excluir_sessoes where token_hash = v_token_hash;
  end if;

  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.moving_excluir_logout(text) is '[Moving_Excluir] Invalida a sessão do token informado.';

-- 5.4 USUÁRIOS LISTAR (Somente superadmin)
create or replace function public.moving_excluir_usuarios_listar(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me jsonb;
  v_papel text;
  v_lista jsonb;
begin
  v_me := public.moving_excluir_me(p_token);
  if not (v_me->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'erro', 'Sessão inválida.');
  end if;

  v_papel := v_me->'usuario'->>'papel';
  if v_papel <> 'superadmin' then
    return jsonb_build_object('ok', false, 'erro', 'Acesso negado: apenas superadmin pode listar usuários.');
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'login', login,
      'nome', nome,
      'papel', papel,
      'telas', telas,
      'ativo', ativo,
      'tentativas', tentativas,
      'bloqueado_ate', bloqueado_ate,
      'ultimo_acesso', ultimo_acesso,
      'criado_em', criado_em
    ) order by criado_em asc
  ), '[]'::jsonb)
  into v_lista
  from public.moving_excluir_usuarios;

  return jsonb_build_object('ok', true, 'usuarios', v_lista);
end;
$$;
comment on function public.moving_excluir_usuarios_listar(text) is '[Moving_Excluir] Lista todos os usuários cadastrados (exclusivo para superadmin).';

-- 5.5 USUÁRIO SALVAR (Criar ou Atualizar - Somente superadmin)
create or replace function public.moving_excluir_usuario_salvar(
  p_token text,
  p_id uuid,
  p_login text,
  p_nome text,
  p_senha text,
  p_papel text,
  p_telas text[],
  p_ativo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me jsonb;
  v_papel_logado text;
  v_login_limpo text;
  v_superadmins_restantes int;
begin
  v_me := public.moving_excluir_me(p_token);
  if not (v_me->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'erro', 'Sessão inválida.');
  end if;

  v_papel_logado := v_me->'usuario'->>'papel';
  if v_papel_logado <> 'superadmin' then
    return jsonb_build_object('ok', false, 'erro', 'Acesso negado: apenas superadmin pode salvar usuários.');
  end if;

  v_login_limpo := lower(trim(coalesce(p_login, '')));
  if v_login_limpo = '' or coalesce(p_nome, '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Nome e login/e-mail são obrigatórios.');
  end if;

  if p_papel not in ('superadmin', 'admin', 'usuario') then
    return jsonb_build_object('ok', false, 'erro', 'Papel inválido.');
  end if;

  -- MODO EDIÇÃO (p_id fornecido)
  if p_id is not null then
    -- Regra inegociável: Nunca permitir ficar sem nenhum superadmin ativo
    if not p_ativo or p_papel <> 'superadmin' then
      select count(*) into v_superadmins_restantes
      from public.moving_excluir_usuarios
      where papel = 'superadmin' and ativo = true and id <> p_id;

      if v_superadmins_restantes = 0 then
        return jsonb_build_object('ok', false, 'erro', 'Operação bloqueada: o sistema precisa manter ao menos um superadmin ativo.');
      end if;
    end if;

    -- Verificar se login já é usado por outro usuário
    if exists (select 1 from public.moving_excluir_usuarios where login = v_login_limpo and id <> p_id) then
      return jsonb_build_object('ok', false, 'erro', 'Este login/e-mail já está em uso por outro usuário.');
    end if;

    -- Se forneceu nova senha, atualiza hash
    if coalesce(p_senha, '') <> '' then
      if length(p_senha) < 6 then
        return jsonb_build_object('ok', false, 'erro', 'A senha precisa ter no mínimo 6 caracteres.');
      end if;

      update public.moving_excluir_usuarios
      set login = v_login_limpo,
          nome = trim(p_nome),
          senha_hash = crypt(p_senha, gen_salt('bf')),
          papel = p_papel,
          telas = coalesce(p_telas, '{}'),
          ativo = coalesce(p_ativo, true)
      where id = p_id;
    else
      update public.moving_excluir_usuarios
      set login = v_login_limpo,
          nome = trim(p_nome),
          papel = p_papel,
          telas = coalesce(p_telas, '{}'),
          ativo = coalesce(p_ativo, true)
      where id = p_id;
    end if;

    -- Se foi desativado, derruba as sessões ativas dele
    if not p_ativo then
      delete from public.moving_excluir_sessoes where usuario_id = p_id;
    end if;

    return jsonb_build_object('ok', true, 'id', p_id);

  -- MODO CRIAÇÃO (p_id nulo)
  else
    if coalesce(p_senha, '') = '' or length(p_senha) < 6 then
      return jsonb_build_object('ok', false, 'erro', 'A senha é obrigatória e deve ter no mínimo 6 caracteres.');
    end if;

    if exists (select 1 from public.moving_excluir_usuarios where login = v_login_limpo) then
      return jsonb_build_object('ok', false, 'erro', 'Este login/e-mail já está cadastrado.');
    end if;

    insert into public.moving_excluir_usuarios (login, nome, senha_hash, papel, telas, ativo)
    values (
      v_login_limpo,
      trim(p_nome),
      crypt(p_senha, gen_salt('bf')),
      p_papel,
      coalesce(p_telas, '{}'),
      coalesce(p_ativo, true)
    );

    return jsonb_build_object('ok', true);
  end if;
end;
$$;
comment on function public.moving_excluir_usuario_salvar(text, uuid, text, text, text, text, text[], boolean) is '[Moving_Excluir] Cria ou edita usuários com garantia de ao menos um superadmin ativo.';

-- 5.6 USUÁRIO EXCLUIR (Somente superadmin, sem auto-exclusão)
create or replace function public.moving_excluir_usuario_excluir(p_token text, p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_me jsonb;
  v_id_logado uuid;
  v_papel_logado text;
  v_superadmins_restantes int;
begin
  v_me := public.moving_excluir_me(p_token);
  if not (v_me->>'ok')::boolean then
    return jsonb_build_object('ok', false, 'erro', 'Sessão inválida.');
  end if;

  v_id_logado := (v_me->'usuario'->>'id')::uuid;
  v_papel_logado := v_me->'usuario'->>'papel';

  if v_papel_logado <> 'superadmin' then
    return jsonb_build_object('ok', false, 'erro', 'Acesso negado: apenas superadmin pode excluir usuários.');
  end if;

  -- Superadmin não exclui a si mesmo
  if v_id_logado = p_id then
    return jsonb_build_object('ok', false, 'erro', 'Você não pode excluir o seu próprio usuário.');
  end if;

  -- Nunca permitir ficar sem nenhum superadmin ativo
  select count(*) into v_superadmins_restantes
  from public.moving_excluir_usuarios
  where papel = 'superadmin' and ativo = true and id <> p_id;

  if v_superadmins_restantes = 0 then
    return jsonb_build_object('ok', false, 'erro', 'Operação bloqueada: não é permitido excluir o único superadmin ativo.');
  end if;

  delete from public.moving_excluir_sessoes where usuario_id = p_id;
  delete from public.moving_excluir_usuarios where id = p_id;

  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.moving_excluir_usuario_excluir(text, uuid) is '[Moving_Excluir] Remove um usuário e encerra suas sessões (superadmin não exclui a si mesmo).';

-- 5.7 SENHA TROCAR (Qualquer usuário logado troca sua própria senha)
create or replace function public.moving_excluir_senha_trocar(p_token text, p_atual text, p_nova text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_token_hash text;
  v_user record;
begin
  if coalesce(p_token, '') = '' then
    return jsonb_build_object('ok', false, 'erro', 'Token não fornecido.');
  end if;

  if coalesce(p_nova, '') = '' or length(p_nova) < 6 then
    return jsonb_build_object('ok', false, 'erro', 'A nova senha deve ter no mínimo 6 caracteres.');
  end if;

  v_token_hash := encode(digest(p_token, 'sha256'), 'hex');

  select u.*
  into v_user
  from public.moving_excluir_sessoes s
  join public.moving_excluir_usuarios u on u.id = s.usuario_id
  where s.token_hash = v_token_hash and s.expira_em > now();

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Sessão inválida ou expirada.');
  end if;

  if v_user.senha_hash <> crypt(p_atual, v_user.senha_hash) then
    return jsonb_build_object('ok', false, 'erro', 'Senha atual incorreta.');
  end if;

  update public.moving_excluir_usuarios
  set senha_hash = crypt(p_nova, gen_salt('bf'))
  where id = v_user.id;

  return jsonb_build_object('ok', true);
end;
$$;
comment on function public.moving_excluir_senha_trocar(text, text, text) is '[Moving_Excluir] Altera a senha do próprio usuário logado mediante confirmação da senha atual.';

-- ==============================================================================
-- 6. PERMISSÕES DE EXECUÇÃO DAS FUNÇÕES
-- ==============================================================================
revoke all on function public.moving_excluir_login(text, text) from public;
revoke all on function public.moving_excluir_me(text) from public;
revoke all on function public.moving_excluir_logout(text) from public;
revoke all on function public.moving_excluir_usuarios_listar(text) from public;
revoke all on function public.moving_excluir_usuario_salvar(text, uuid, text, text, text, text, text[], boolean) from public;
revoke all on function public.moving_excluir_usuario_excluir(text, uuid) from public;
revoke all on function public.moving_excluir_senha_trocar(text, text, text) from public;

grant execute on function public.moving_excluir_login(text, text) to anon, authenticated;
grant execute on function public.moving_excluir_me(text) to anon, authenticated;
grant execute on function public.moving_excluir_logout(text) to anon, authenticated;
grant execute on function public.moving_excluir_usuarios_listar(text) to anon, authenticated;
grant execute on function public.moving_excluir_usuario_salvar(text, uuid, text, text, text, text, text[], boolean) to anon, authenticated;
grant execute on function public.moving_excluir_usuario_excluir(text, uuid) to anon, authenticated;
grant execute on function public.moving_excluir_senha_trocar(text, text, text) to anon, authenticated;

-- ==============================================================================
-- 7. USUÁRIOS INICIAIS (Inserção segura com bcrypt)
-- ==============================================================================
-- 1. evandro@startinc.com.br (superadmin)
insert into public.moving_excluir_usuarios (login, nome, senha_hash, papel, telas, ativo)
values (
  'evandro@startinc.com.br',
  'Evandro Silva',
  crypt('Ev@12101034', gen_salt('bf')),
  'superadmin',
  array['overview', 'diario', 'plataformas', 'promoters', 'ingressos', 'tendencias'],
  true
)
on conflict (login) do update
set senha_hash = crypt('Ev@12101034', gen_salt('bf')),
    papel = 'superadmin',
    ativo = true;

-- 2. movingadmin (admin)
insert into public.moving_excluir_usuarios (login, nome, senha_hash, papel, telas, ativo)
values (
  'movingadmin',
  'Moving Admin',
  crypt('Moving@2026', gen_salt('bf')),
  'admin',
  array['overview', 'diario', 'plataformas', 'promoters', 'ingressos', 'tendencias'],
  true
)
on conflict (login) do update
set senha_hash = crypt('Moving@2026', gen_salt('bf')),
    papel = 'admin',
    ativo = true;

-- 3. carolamandoneves@gmail.com (usuario)
insert into public.moving_excluir_usuarios (login, nome, senha_hash, papel, telas, ativo)
values (
  'carolamandoneves@gmail.com',
  'Carol Amando',
  crypt('Moving@1234', gen_salt('bf')),
  'usuario',
  array['overview', 'diario'],
  true
)
on conflict (login) do update
set senha_hash = crypt('Moving@1234', gen_salt('bf')),
    papel = 'usuario',
    telas = array['overview', 'diario'],
    ativo = true;

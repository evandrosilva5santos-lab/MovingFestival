# SUPABASE — Banco do Painel Moving Festival 2026

## Onde fica
- **Organização:** Start Company
- **Projeto:** Start Metrcis (`etjqbqorawnnvdlmztka`)
- **Marcador:** todas as tabelas começam com `moving_excluir_` e a descrição começa com **[Moving_Excluir]**
- **Motivo:** o plano gratuito só permite 2 projetos ativos (nossocrm e Start Metrcis). O prefixo isola o Moving sem misturar com as tabelas do Start Metrcis.

---

## Tabelas

### `moving_excluir_vendas`
**[Moving_Excluir]** Vendas do Moving Festival 2026 (Uticket, Sympla, Wix). Uma linha por ingresso/item. Só tipo=INGRESSO entra nos totais e metas; CAMPING e COPO ficam separados. Tabela temporária: apagar após o festival.

| Coluna | Descrição |
|---|---|
| `id` | Código único do ingresso na plataforma (prefixado pela plataforma). Evita duplicidade. |
| `plataforma` | UTICKET, SYMPLA ou WIX |
| `tipo` | INGRESSO soma nos totais. CAMPING e COPO são extras e NÃO somam. |
| `setor` | FULLPASS, ZONE, GOLD ou BLACK. Obrigatório quando tipo=INGRESSO. |
| `lote` | Nome original do lote na ticketeira (ex.: Convocação L2) |
| `categoria` | PAGO ou CORTESIA. Cortesias contam no total geral, mas não na receita. |
| `status` | CONFIRMADO ou CANCELADO (só CONFIRMADO conta) |
| `valor` | Valor pago em R$ |
| `comprador_nome` / `comprador_email` / `comprador_telefone` | Dados do comprador (protegidos, não aparecem no painel) |
| `data_compra` | Data/hora da compra (alimenta vendas por dia, hora e dia da semana) |
| `promoter` | Divulgador/afiliado (vem de cupom ou utm_source) |
| `canal` | AFILIADO, ORGANICO, META_ADS, WHATSAPP, DIRETO |
| `utm_source` / `utm_medium` / `utm_campaign` / `cupom` / `pedido_id` | Rastreamento da venda |

### `moving_excluir_metas`
**[Moving_Excluir]** Régua de metas de ingressos da campanha.

| Meta | Ingressos | Classificação |
|---|---|---|
| Meta 0 | 5.000 | Ruim |
| Meta 1 | 6.000 | Ok |
| Meta 2 | 7.000 | Dá pra melhorar |
| Meta 3 | 7.500 | Saímos da merda |
| Meta 4 | 8.000 | Boa |
| Meta 5 | 8.500 | Ótima |
| Meta 6 | 9.000 | Excelente |
| Meta 7 | 9.500 | Magnífico |
| Meta NASA | 10.000 | Estourar champanhe |

### `moving_excluir_sync_log`
**[Moving_Excluir]** Histórico de cada sincronização com as ticketeiras (quando rodou, quantos registros, erros). Alimenta o "Sincronizado há X min" do painel.

### Função `moving_excluir_resumo()`
**[Moving_Excluir]** Resumo agregado para o painel: totais, setores, extras, lotes, canais, promoters, vendas por dia/hora/dia da semana e metas. **Não retorna dados pessoais.**
Chamada pelo painel: `POST /rest/v1/rpc/moving_excluir_resumo`

**Campos extras no resumo (06/10):**
- `vendas_diarias`: `[{dia, plataforma, setor, total, receita}]` — todas as vendas confirmadas por dia, plataforma e setor (camping/copo vêm com `setor` = CAMPING/COPO). Alimenta a tela **Vendas por Dia**.
- `vendas_hora_dia`: `[{dia, hora, plataforma, setor, total}]` — últimos 60 dias, por hora. Alimenta o gráfico **Ondas de venda do dia** (pico, vale e média do período).


---

## Segurança
- RLS ligado nas 3 tabelas, sem acesso público.
- O **robô de sincronização** grava usando a `service_role key` (fica só no `.env`, nunca no painel).
- O **painel** usa a `anon key` e só consegue chamar a função de resumo (números agregados).

---

## Como apagar depois do festival
Rodar no SQL Editor do Supabase (projeto Start Metrcis):

```sql
drop function if exists public.moving_excluir_resumo();
drop table if exists public.moving_excluir_vendas;
drop table if exists public.moving_excluir_metas;
drop table if exists public.moving_excluir_sync_log;
```

---

## SQL completo (como foi criado)

```sql
-- ============ VENDAS ============
create table public.moving_excluir_vendas (
  id               text primary key,
  plataforma       text not null check (plataforma in ('UTICKET','SYMPLA','WIX')),
  tipo             text not null default 'INGRESSO' check (tipo in ('INGRESSO','CAMPING','COPO')),
  setor            text check (setor in ('FULLPASS','ZONE','GOLD','BLACK')),
  lote             text,
  categoria        text not null default 'PAGO' check (categoria in ('PAGO','CORTESIA')),
  status           text not null default 'CONFIRMADO' check (status in ('CONFIRMADO','CANCELADO')),
  valor            numeric(10,2) not null default 0,
  comprador_nome   text,
  comprador_email  text,
  comprador_telefone text,
  data_compra      timestamptz,
  promoter         text,
  canal            text,
  utm_source       text,
  utm_medium       text,
  utm_campaign     text,
  cupom            text,
  pedido_id        text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint setor_so_para_ingresso check (tipo <> 'INGRESSO' or setor is not null)
);
create index moving_excluir_vendas_data_idx on public.moving_excluir_vendas (data_compra);
create index moving_excluir_vendas_tipo_setor_idx on public.moving_excluir_vendas (tipo, setor);

comment on table public.moving_excluir_vendas is '[Moving_Excluir] Vendas do Moving Festival 2026 (Uticket, Sympla, Wix). Uma linha por ingresso/item. Só tipo=INGRESSO entra nos totais e metas; CAMPING e COPO ficam separados. Tabela temporária: apagar após o festival.';
comment on column public.moving_excluir_vendas.id is 'Código único do ingresso na plataforma (prefixado pela plataforma). Evita duplicidade.';
comment on column public.moving_excluir_vendas.tipo is 'INGRESSO soma nos totais. CAMPING e COPO são extras e NÃO somam.';
comment on column public.moving_excluir_vendas.setor is 'FULLPASS, ZONE, GOLD ou BLACK. Obrigatório quando tipo=INGRESSO.';
comment on column public.moving_excluir_vendas.lote is 'Nome original do lote na ticketeira (ex.: Convocação L2).';
comment on column public.moving_excluir_vendas.categoria is 'PAGO ou CORTESIA. Cortesias contam no total geral, mas não na receita.';
comment on column public.moving_excluir_vendas.promoter is 'Divulgador/afiliado (vem de cupom ou utm_source).';
comment on column public.moving_excluir_vendas.canal is 'Canal de venda: AFILIADO, ORGANICO, META_ADS, WHATSAPP, DIRETO.';

-- ============ METAS ============
create table public.moving_excluir_metas (
  ordem          int primary key,
  nome           text not null,
  valor          int not null,
  classificacao  text not null
);
comment on table public.moving_excluir_metas is '[Moving_Excluir] Régua de metas de ingressos da campanha Moving Festival 2026. Tabela temporária: apagar após o festival.';

insert into public.moving_excluir_metas (ordem, nome, valor, classificacao) values
  (0,'Meta 0',5000,'Ruim'),
  (1,'Meta 1',6000,'Ok'),
  (2,'Meta 2',7000,'Dá pra melhorar'),
  (3,'Meta 3',7500,'Saímos da merda'),
  (4,'Meta 4',8000,'Boa'),
  (5,'Meta 5',8500,'Ótima'),
  (6,'Meta 6',9000,'Excelente'),
  (7,'Meta 7',9500,'Magnífico'),
  (8,'Meta NASA',10000,'Estourar champanhe');

-- ============ LOG DE SINCRONIZAÇÃO ============
create table public.moving_excluir_sync_log (
  id             bigint generated always as identity primary key,
  plataforma     text not null,
  iniciado_em    timestamptz not null default now(),
  finalizado_em  timestamptz,
  status         text not null default 'RODANDO' check (status in ('RODANDO','OK','ERRO')),
  registros      int default 0,
  erro           text
);
comment on table public.moving_excluir_sync_log is '[Moving_Excluir] Histórico de cada sincronização com as ticketeiras (quando rodou, quantos registros, erros). Alimenta o status "Sincronizado há X min" do painel. Tabela temporária: apagar após o festival.';

-- ============ SEGURANÇA ============
alter table public.moving_excluir_vendas   enable row level security;
alter table public.moving_excluir_metas    enable row level security;
alter table public.moving_excluir_sync_log enable row level security;

-- ============ RESUMO PARA O PAINEL (sem dados pessoais) ============
create or replace function public.moving_excluir_resumo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with v as (
    select * from public.moving_excluir_vendas where status = 'CONFIRMADO'
  ), ing as (select * from v where tipo = 'INGRESSO')
  select jsonb_build_object(
    'atualizado_em', (select max(finalizado_em) from public.moving_excluir_sync_log where status = 'OK'),
    'total',      (select count(*) from ing),
    'pagos',      (select count(*) from ing where categoria = 'PAGO'),
    'cortesias',  (select count(*) from ing where categoria = 'CORTESIA'),
    'receita',    (select coalesce(sum(valor),0) from ing where categoria = 'PAGO'),
    'setores',    (select coalesce(jsonb_agg(s),'[]') from (
                     select setor, count(*) total,
                            count(*) filter (where categoria='PAGO') pagos,
                            count(*) filter (where categoria='CORTESIA') cortesias,
                            count(*) filter (where plataforma='UTICKET') uticket,
                            count(*) filter (where plataforma='SYMPLA') sympla,
                            count(*) filter (where plataforma='WIX') wix
                     from ing group by setor) s),
    'extras',     (select coalesce(jsonb_agg(e),'[]') from (
                     select tipo, count(*) total,
                            count(*) filter (where plataforma='UTICKET') uticket,
                            count(*) filter (where plataforma='SYMPLA') sympla,
                            count(*) filter (where plataforma='WIX') wix
                     from v where tipo <> 'INGRESSO' group by tipo) e),
    'lotes',      (select coalesce(jsonb_agg(l),'[]') from (
                     select lote, setor, count(*) total from ing group by lote, setor order by 3 desc limit 10) l),
    'canais',     (select coalesce(jsonb_agg(c),'[]') from (
                     select coalesce(canal,'DESCONHECIDO') canal, count(*) total from ing group by 1 order by 2 desc) c),
    'promoters',  (select coalesce(jsonb_agg(p),'[]') from (
                     select promoter, count(*) total from ing where promoter is not null group by 1 order by 2 desc limit 20) p),
    'por_dia',    (select coalesce(jsonb_agg(d),'[]') from (
                     select (data_compra at time zone 'America/Sao_Paulo')::date dia, count(*) total
                     from ing where data_compra is not null group by 1 order by 1) d),
    'por_hora',   (select coalesce(jsonb_agg(h),'[]') from (
                     select extract(hour from data_compra at time zone 'America/Sao_Paulo')::int hora, count(*) total
                     from ing where data_compra is not null group by 1 order by 1) h),
    'por_dia_semana', (select coalesce(jsonb_agg(w),'[]') from (
                     select extract(isodow from data_compra at time zone 'America/Sao_Paulo')::int dia_semana, count(*) total
                     from ing where data_compra is not null group by 1 order by 1) w),
    'metas',      (select coalesce(jsonb_agg(m order by ordem),'[]') from public.moving_excluir_metas m)
  );
$$;
comment on function public.moving_excluir_resumo() is '[Moving_Excluir] Resumo agregado para o painel (totais, setores, extras, lotes, canais, promoters, séries de tempo, metas). Não retorna dados pessoais.';

revoke all on function public.moving_excluir_resumo() from public;
grant execute on function public.moving_excluir_resumo() to anon, authenticated;
```

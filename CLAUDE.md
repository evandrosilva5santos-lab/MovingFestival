# CLAUDE.md — Contexto do projeto para IAs

> ## ⚠️ ANTES DE MEXER NO PAINEL OU NO SERVIDOR
> Leia **`CORRECOES.md`**: lista o que já foi corrigido (F5 com número velho, botão Sincronizar, `hidden`, layout iPhone/iPad/Mac, acentos, régua, Vendas por Dia) e as regras para não quebrar de novo.
>
> **SINCRONIZAÇÃO NA NUVEM:** o app roda na Cloudflare. Vendas vêm da função `moving-excluir-sync` (Supabase) com segredos no Vault. **Nunca** usar arquivos, pastas ou Python do computador do Evandro como fonte de dados e nunca escrever senhas/tokens no código. Ver `CORRECOES.md` item 9.

> ## ⚠️ REGRAS DE VISUAL — OBRIGATÓRIAS
> 1. O visual do painel é **LIGHT, limpo, estilo ManyChat**: fundo `#F5F6F8`, cards brancos, azul `#2B6CF6`, fontes **Plus Jakarta Sans + Inter**.
> 2. **Proibido** dark mode neon, glassmorphism, fundo `#0A0D14`, fonte Outfit. Esse visual foi descartado pelo Evandro.
> 3. A única especificação válida é **`design/DESIGN.md`**. Ler antes de mexer em qualquer coisa visual.
> 4. **Nunca sobrescrever, mover ou renomear `design/DESIGN.md`.** O design antigo (dark) fica em `_to_delete/DESIGN_ANTIGO_DARK.md` e não deve ser usado.
> 5. **Editar o `index.html` existente.** Não recriar o painel do zero.

> Leia este arquivo inteiro antes de qualquer tarefa nesta pasta.
> Depois leia `SUPABASE.md` (banco) e `design/DESIGN.md` (visual). Se precisar de detalhe, `PRD.md`, `SCHEMA.md`, `TASK_PLAN.md`.

---

## 1. O que é este projeto
Painel de vendas em tempo real do **Moving Festival 2026**.
Consolida vendas de 3 ticketeiras (**Uticket, Sympla, Wix**) num único painel, para o dono decidir virada de lote e o gestor de tráfego ajustar anúncios.

Responsável: Evandro (Start Company). Idioma de tudo: **português**.

---

## 2. Arquitetura (fluxo de dados)

```
Sympla (API oficial)  ─┐
Uticket (robô/scraper) ─┼─▶ script de sync (Python) ─▶ Supabase: moving_excluir_vendas
Wix (importação)      ─┘                                        │
                                                                ▼
                                         função moving_excluir_resumo()  (só números agregados)
                                                                │
                                                                ▼
                                                     index.html (painel)
```

- **Quem grava:** o script de sync, usando a `service_role key` (fica só no `.env`).
- **Quem lê:** o painel, usando a `anon key`, e **somente** pela função `moving_excluir_resumo()`.
- O painel **nunca** lê a tabela de vendas direto (ela tem dados pessoais).

---

## 3. Arquivos da pasta

| Arquivo | Para que serve |
|---|---|
| `CLAUDE.md` | Este arquivo. Contexto e regras para IAs. |
| `migration_auth.sql` | Script SQL completo de autenticação e controle de acesso (tabelas `moving_excluir_usuarios`, `moving_excluir_sessoes`, funções `moving_excluir_*` e 3 usuários iniciais com hashes bcrypt). |
| `_worker.js` | Cloudflare Worker que serve a API `/api/login`, `/api/me`, `/api/logout`, `/api/senha`, `/api/usuarios`, `/api/resumo` e `/api/sync` protegidas por token. |
| `index.html` | O painel (HTML/CSS/JS puro, 1 arquivo, sem build). Visual light estilo ManyChat. Login integrado e controle de acesso por tela. |
| `server.py` | Servidor local na porta **7777** (`python3 server.py` → http://localhost:7777). Serve o `index.html`, rotas `/api/*` com autenticação e sincronização automática. |
| `sync_worker.py` | Motor de sincronização: busca vendas da Sympla (API) e da Uticket (exportação XLSX com cookie), classifica e faz upsert em `moving_excluir_vendas`. |
| `run_sync_daemon.py` | Roda o `sync_worker.py` a cada 5 minutos em segundo plano. |
| `sympla_api.py` | **Fonte oficial da Sympla.** API do dono da conta, só o evento Moving 2026 (`SYMPLA_EVENT_ID=3419289`). Confere o nome do evento antes de puxar. Compara com a planilha e gera `validacao_sympla.json`. Teste sem gravar: `python3 sympla_api.py`. |
| `validacao_sympla.json` | Último relatório API x planilha da Sympla (quantos batem, só na API, só na planilha, valor/setor diferente). |
| `.env` | Segredos (token Sympla, chaves Supabase). **Nunca commitar, nunca exibir, nunca copiar para o index.html.** |
| `PRD.md` | Requisitos do produto. |
| `SCHEMA.md` | Modelo de dados original (em inglês). O banco real em `SUPABASE.md` é a fonte de verdade. |
| `design/DESIGN.md` | **Design system atual** (light, estilo ManyChat): cores, fontes, componentes, telas. Única fonte de verdade do visual. |
| `_to_delete/DESIGN_ANTIGO_DARK.md` | Design antigo (dark neon). **Descartado. Não usar.** |
| `TASK_PLAN.md` | Plano de tarefas original. |
| `PROMPT_PAINEL.md` | Prompt curto para gerar o visual do painel. |
| `_to_delete/` | Lixo. Ignorar. |

---

## 4. Regras de negócio (inegociáveis)

### 4.1 Tipos de item
Toda venda tem um `tipo`:
- `INGRESSO` → **soma** em todos os totais, metas, rankings e gráficos.
- `CAMPING` → **não soma**. Aparece só no bloco "Extras".
- `COPO` → **não soma**. Aparece só no bloco "Extras".

### 4.2 Como classificar pelo nome do lote
- Nome contém `CAMPING` → `tipo = CAMPING`.
- Nome é só `COPO` ou `COPO MOVING 2026` → `tipo = COPO`.
- Nome tem ingresso + copo (ex.: `PRÉ VENDA LOTE 2 + COPO`) → é `INGRESSO` do setor de origem.
- Todo o resto → `INGRESSO`.

### 4.3 Setores (só para INGRESSO)
`FULLPASS`, `ZONE`, `GOLD`, `BLACK`. Todo lote de ingresso precisa cair em um deles.
- FULL PASS: todos os lotes, convocações (L1, L2, Extra) e promoções.
- ZONE: todos os lotes e promoções.
- GOLD: lotes convencionais e VIP Convocação.
- BLACK: lotes convencionais e promoções.

### 4.4 Pago × Cortesia
- `categoria = CORTESIA` quando o valor é 0 ou o lote diz "Cortesia"/"Gratuito".
- Total geral = pagos + cortesias. Receita = só pagos.
- Sempre mostrar os dois separados.

### 4.5 Outras regras
- Só `status = CONFIRMADO` conta. Cancelados ficam no banco, mas fora das somas.
- Sem duplicidade: o `id` é o código do ingresso prefixado pela plataforma (`SYMPLA-123`, `UTICKET-456`). Gravar sempre com **upsert**.
- Fuso horário: `America/Sao_Paulo`.

### 4.6 Números de referência (auditoria inicial de 05/10 21:59)
Valores congelados no marco inicial da campanha (05/10 às 21:59). Usados pelo Motor Temporal de `motores_validacao.py` para medir o ritmo de vendas em tempo real:

| Setor | Pagos | Cortesias | Total |
|---|---|---|---|
| FULL PASS | 3.833 | 33 | 3.866 |
| ZONE | 512 | 0 | 512 |
| GOLD | 413 | 36 | 449 |
| BLACK | 136 | 0 | 136 |
| **TOTAL BASELINE** | **4.894** | **69** | **4.963** |

Por plataforma (marco inicial): Uticket 3.793 · Sympla 804 · Wix 366.
*(Nota: a Uticket ao vivo passou de 3.793 para 3.960 devido a +167 novas vendas reais nos dias 05 e 06/10).*


---

## 5. Metas da campanha
Estão na tabela `moving_excluir_metas`. O painel mostra uma régua com o total atual de INGRESSOS:

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

Camping e Copo **não** contam para as metas.

---

## 6. Fontes de dados

### Sympla — API oficial
- Base: `https://api.sympla.com.br/public`
- Autenticação: header `s_token: <SYMPLA_API_TOKEN do .env>`
- Endpoints:
  - `GET /v1.6.0/events` → lista eventos
  - `GET /v1.6.0/events/{id}/participants` → um registro por ingresso (**principal**)
  - `GET /v1.6.0/events/{id}/orders` → pedidos (traz `utm` e `discount_code`)
- Campos úteis do participante: `ticket_number`, `ticket_name` (lote), `ticket_sale_price`, `order_status`, `order_date`, `order_id`, `first_name`, `last_name`, `email`.
- A API **não tem campo de promoter**. Promoter vem do `discount_code` (cupom) ou `utm_source` do pedido.
- Canal vem do `utm` do pedido (`utm_source`, `utm_medium`, `referrer`).
- Docs: https://developers.sympla.com.br/api-doc/

### Regra da Sympla
- A **API oficial** (`sympla_api.py`) é a fonte que grava no banco. A planilha da pasta Downloads serve **só para validar** e como reserva se a API cair.
- Puxar **somente o evento Moving 2026 (ID 3419289)**. Nunca listar ou gravar outros eventos da conta.
- O token fica só no `.env` (`SYMPLA_API_TOKEN`). Nunca escrever o token no código.

### Uticket — sem API pública
Robô headless (Playwright) que faz login e exporta o borderô / lista de participantes. Ainda não feito.

### Wix — importação manual
Ainda não feito.

---

## 7. Banco (resumo — detalhes em SUPABASE.md)
- Projeto Supabase **Start Metrcis** (`etjqbqorawnnvdlmztka`), organização Start Company.
- Tudo do Moving usa o prefixo `moving_excluir_` e descrição começando com `[Moving_Excluir]`.
- **Não mexer** em nenhuma tabela sem esse prefixo. Elas são do produto Start Metric.
- Tabelas: `moving_excluir_vendas`, `moving_excluir_metas`, `moving_excluir_sync_log`.
- Função para o painel: `moving_excluir_resumo()`.
- Toda sincronização grava uma linha em `moving_excluir_sync_log` (início, fim, status, registros, erro).

---

## 8. Painel (index.html)
- HTML + CSS + JS puro, **um arquivo**, sem framework e sem build.
- Todo detalhe visual (tokens, componentes, estados) está em `design/DESIGN.md`. Seguir à risca.
- Visual: light, limpo, estilo ManyChat. Fundo off-white, cards brancos, azul `#2B6CF6`, fontes Plus Jakarta Sans + Inter. Tema escuro automático.
- Cores dos setores: Full Pass `#0EA5E9` · Zone `#8B5CF6` · Gold `#E08A00` · Black `#475569`.
- Telas (sidebar): Visão geral · Plataformas & canais · Promoters · Ingressos · Tendências.
- Visão geral: régua de metas → 4 números (total, pagos, cortesias, ritmo) → 4 cards de setor → bloco **Extras** (Camping, Copo; "fora do total") → tabela por ticketeira → gráfico de plataformas.
- Os números vêm de `/api/resumo` (servidor local), que chama `moving_excluir_resumo()` no Supabase.

---

## 9. Restrições de ambiente
- Dentro do Claude (nuvem e Mac), a rede **bloqueia `api.sympla.com.br`** por política da organização. Não tentar contornar.
- Scripts que chamam a Sympla devem ser rodados **pelo Evandro no Terminal do Mac** (fora do Claude) ou numa VPS.

---

## 10. Como rodar
```
cd "/Volumes/Vol Macbook/App/Grupo Vip Lancamento/Plataforma"
python3 server.py            # painel em http://localhost:7777
python3 run_sync_daemon.py   # (outro terminal) sincroniza a cada 5 min
```

## 11. Próximos passos
1. Conferir os números do `sync_worker.py` contra a auditoria (seção 4.6).
2. Importação da Wix.
3. Promoter e canal vindos de cupom/UTM da Sympla.

---

## 12. Como trabalhar aqui
- Responder sempre em **português**.
- Não inventar números: se não tem dado real, marcar como "exemplo" no painel.
- Nunca expor segredos do `.env` (token Sympla, chaves Supabase) em código, HTML ou resposta.
- Nunca tirar a separação INGRESSO × CAMPING × COPO.
- Antes de alterar o banco, conferir `SUPABASE.md` e manter o prefixo `moving_excluir_` e a descrição `[Moving_Excluir]` em tudo que criar.

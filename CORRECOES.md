# CORREÇÕES — o que já foi corrigido e NÃO pode voltar

> Leia antes de mexer no `index.html` ou no `server.py`.
> Cada item diz o problema, a causa, como está corrigido e a regra para não quebrar de novo.

---

## 1. F5 mostrava número velho (5.168 em vez do real)
- **Problema:** ao atualizar a página, aparecia primeiro o total antigo e só depois o real.
- **Causa:** o painel desenhava o `SNAPSHOT` (retrato salvo dentro do HTML, de 06/10 17:14) antes de o `/api/resumo` responder.
- **Correção:** ao abrir, o painel mostra "—" e status "carregando…". Só desenha quando o `/api/resumo` responde. O `SNAPSHOT` só entra se o servidor falhar, com o aviso amarelo "Sem conexão com o servidor".
- **Regra:** **nunca** chamar `render()` com o `SNAPSHOT` no carregamento. Linha de referência no código: `// Ao abrir (F5): não mostra o retrato salvo`.

## 2. Botão Sincronizar não dizia se deu certo
- **Problema:** clicava, nada acontecia na tela e o "há X min" não mudava.
- **Causa:** o `server.py` sempre respondia `status: 'OK'`, mesmo quando o `sync_worker.py` falhava.
- **Correção no servidor:** `/api/sync` confere se a saída do `sync_worker.py` tem "SINCRONIZAÇÃO CONCLUÍDA". Se não tiver, responde `status: 'ERRO'` e `erro: <motivo>`. Se passar de 2 minutos, também responde ERRO.
- **Correção no painel:**
  - Ao clicar, o botão fica "Sincronizando…" (ícone girando) e o status fica "sincronizando…".
  - **Sucesso:** aviso verde "✅ Sincronizado às HH:MM · +N ingressos novos · total X". O status vira "agora".
  - **Erro:** aviso vermelho "⚠️ Não sincronizou · <motivo>". O status fica "erro às HH:MM" e não volta sozinho para o horário antigo (variável `SYNC_ERRO`).
- **Regra:** o `/api/sync` **sempre** devolve `status` = `OK` ou `ERRO`, e `erro` com o motivo. O painel só mostra sucesso com `status === 'OK'`.
- **Depois de mexer no `server.py`, reiniciar:** Ctrl+C no Terminal e `python3 server.py`.

## 3. Elementos com `hidden` continuavam aparecendo
- **Problema:** o filtro de setores do topo aparecia em "Vendas por Dia" mesmo marcado como escondido.
- **Causa:** `.seg{display:flex}` passava por cima do atributo `hidden`.
- **Correção:** regra global `[hidden]{ display:none !important; }`.
- **Regra:** não remover essa regra. Para esconder algo, usar `el.hidden = true`.

## 4. Filtro de setores do topo
- Aparece **só na Visão geral**. Nas outras telas fica escondido e volta para "Todos" (script "Filtro de setor só aparece na Visão geral").

## 5. Layout por aparelho (`/* RESPONSIVO POR DISPOSITIVO */`)
| Aparelho | Largura | Menu |
|---|---|---|
| Mac / computador | ≥ 1200px | Barra lateral aberta |
| iPad / tablet | 768–1199px | Coluna de ícones (76px) à esquerda; tema embaixo |
| iPhone 17 (402px) / XR (414px) | ≤ 767px | Abas embaixo (Geral, Por dia, Plataformas, Cupons, Ingressos, Tendências); cabeçalho com logo + tema; botão Sincronizar flutuante acima das abas |

- No iPhone, a régua de metas mostra só 5k, 6k, 7k, 8k, 9k e 10k, sem nomes (o nível aparece no selo). Sem rolagem lateral.
- **Regra:** não voltar o menu do tablet para barra horizontal rolável. Testar sempre em 402px, 414px, 820px e 1440px, sem rolagem lateral da página.

## 6. Acentos quebrados ("Â·", "PrÃ³xima")
- **Causa:** faltava `<meta charset="utf-8">` quando o painel é servido pelo `server.py`.
- **Regra:** manter `<meta charset="utf-8">` no topo do `index.html`.

## 7. Régua de metas
- Faixas de uma meta até a próxima, com a cor da meta (ver `design/DESIGN.md`). Valores em k. Selo "Nível atual · X".
- Classes `.trilho` / `.faixa`. **Nunca** usar `.seg` na régua, porque é o nome do filtro de setor.
- Confete uma vez por meta, por navegador (`moving_metas_comemoradas`).

## 8. Tela "Vendas por Dia"
- Usa `vendas_diarias` (dia, plataforma, setor, total, receita) e `vendas_hora_dia` (últimos 60 dias). Os dois vêm do banco.
- **Não** usar o cálculo inventado `receita = total × 130` nem tratar tudo como Uticket/Full Pass.
- O Detalhamento Diário lista as plataformas **em linhas embaixo de cada dia**, não em colunas.
- O gráfico "Ondas de venda do dia" mostra pico, vale e a média do período.

---

## Como testar depois de qualquer mudança
1. `python3 server.py` e abrir `http://localhost:7777`.
2. F5: tem que aparecer "carregando…" e depois o número real, sem piscar o número antigo.
3. Clicar em Sincronizar: tem que aparecer o aviso verde ou vermelho.
4. Diminuir a janela até a largura de celular (402px) e de iPad (820px): sem rolagem lateral, com o menu certo para cada tamanho.

---

## 9. Sincronização 100% na nuvem (nunca mais usar arquivos do computador)
- **Regra:** o app roda na **Cloudflare**. Nenhuma venda pode depender de pasta Downloads, planilha, `.env` ou Python do Mac.
- **Quem sincroniza:** a função **`moving-excluir-sync`** (Supabase Edge Function). Ela entra na Uticket, baixa o extrato de vendas, lê a API oficial da Sympla (só o evento Moving 2026, ID 3419289), grava em `moving_excluir_vendas` e registra a fonte em `moving_excluir_sync_log`.
- **Quando roda:** sozinha **a cada 15 min** (`pg_cron`, job `moving-excluir-sync-15min`) e quando clicar em **Sincronizar** (o `_worker.js` chama a função em `/api/sync`). Trava de 1 min contra disparos repetidos.
- **Segredos:** e-mail/senha da Uticket e token da Sympla ficam no **Vault do Supabase** (`moving_excluir_uticket_email`, `moving_excluir_uticket_senha`, `moving_excluir_sympla_token`). **Nunca** colocar no `_worker.js`, `wrangler.toml`, `index.html` ou GitHub.
- **Cancelamentos:** ingresso confirmado no banco que some da fonte ao vivo vira `CANCELADO` (trava: se sumir mais de 10% de uma vez, não mexe e avisa).
- **Fontes no painel:** o RPC `moving_excluir_resumo()` devolve `fontes` e a Visão geral mostra o quadro "De onde vêm os números" (AO VIVO / VALOR FIXO / FALHOU). Se uma API falhar, o painel **não inventa dado**: mantém o último salvo e mostra FALHOU.
- **Wix:** continua valor fixo (366 ingressos, 01/06). Não tem integração.
- **Cookie da Uticket:** não é usado. Login por e-mail/senha renova sozinho.
- **Não voltar:** `sync_worker.py`, `run_sync_daemon.py` e `server.py` são só para uso local de teste; não são a fonte oficial.
- Depois de mexer no `index.html`, copiar para `public/index.html` (é a pasta que a Cloudflare publica).

## 11. Sistema de Autenticação, Perfis de Acesso (RBAC) e Gestão de Usuários
- **Objetivo:** Acesso restrito ao painel com controle granular por tipo de usuário e personalização de telas visíveis para cada colaborador.
- **Banco Supabase (`etjqbqorawnnvdlmztka`):**
  - Tabela `moving_excluir_usuarios`: `id` (uuid), `login` (único, minúsculo), `nome`, `senha_hash` (bcrypt via `pgcrypto crypt(..., gen_salt('bf'))`), `papel` (superadmin | admin | usuario), `telas` (text[]), `ativo` (boolean), `tentativas` (int), `bloqueado_ate` (timestamptz), `ultimo_acesso` (timestamptz).
  - Tabela `moving_excluir_sessoes`: guarda tokens em hash SHA256 (`token_hash`, `usuario_id`, `expira_em`).
  - Funções `SECURITY DEFINER`: `moving_excluir_login`, `moving_excluir_me`, `moving_excluir_logout`, `moving_excluir_usuarios_listar`, `moving_excluir_usuario_salvar`, `moving_excluir_usuario_excluir`, `moving_excluir_senha_trocar`.
- **Proteção contra Brute Force:** Bloqueio automático de 15 minutos ao errar a senha 6 vezes.
- **Hierarquia de Papéis:**
  - `superadmin`: Acesso irrestrito a todas as telas + tela exclusiva de Gestão de Usuários (`#navUsuarios`). Permissão para criar, editar, alterar status e excluir usuários (salvaguarda: nunca permite excluir a si mesmo nem deixar o sistema sem superadmin ativo).
  - `admin`: Acesso a todos os relatórios analíticos de vendas e botão Sincronizar. Não tem acesso à tela de gestão de usuários.
  - `usuario`: Acesso restrito estritamente às telas autorizadas no seu cadastro (`telas text[]`). Botão Sincronizar ocultado na interface e bloqueado com 403 no backend.
- **Usuários Iniciais Configurados:**
  1. `evandro@startinc.com.br` | `superadmin` | `Ev@12101034` (acesso total + gestão de usuários)
  2. `movingadmin` | `admin` | `Moving@2026` (acesso total aos relatórios + sync)
  3. `carolamandoneves@gmail.com` | `usuario` | `Moving@1234` | telas iniciais: `['overview', 'diario']` (personalizáveis pelo SuperADMIN)
- **Segurança de Endpoints:** Todas as rotas de API no Cloudflare Worker (`_worker.js`) e no servidor local (`server.py`) exigem o header `X-Moving-Token`. Sessões inválidas respondem HTTP 401 e redirecionam para a tela de login.
- **Sincronia de Arquivos:** `index.html` e `public/index.html` mantidos rigorosamente idênticos.


## 10. Monitores largos (3440×1440, 2048×858, 1920×1080, 1720×720)
- Bloco `TELAS_GRANDES` no fim do `index.html`: conteúdo centralizado com largura máxima por faixa (1440 → 1720 → 2560 → 3000px) e compactação vertical quando a altura é ≤ 900px / ≤ 760px.
- Prints de referência em `design/dispositivos/monitor_*.jpg`. Não remover esse bloco ao mexer em `.content`.

## 11. Visão geral só com ingressos · aba Faturamento (antiga Tendências)
- **Visão geral não mostra receita.** É só venda de ingresso (o card "Vendidos (pagos)" mostra "ingressos pagos").
- A aba `tendencias` agora se chama **Faturamento** (o `data-view` continua `tendencias`). Mostra: faturamento real dos ingressos, ticket médio, estacionamento e bar estimados, total projetado, faturamento por setor e, no fim, os gráficos de tendência de vendas.
- **Premissas da estimativa** (público base, % que vai de carro, pessoas por carro, R$ por carro, ticket do bar) ficam no Supabase, na tabela `moving_excluir_estimativas`, lidas e gravadas por `GET/POST /api/estimativas` (Worker → RPCs `moving_excluir_estimativas_ler` / `moving_excluir_estimativas_salvar`). Valem para todos os usuários.
- Fluxo: botão **Editar** → campos → **Salvar** / **Cancelar**. O banco valida os limites.
- Permissão: o front usa `window.movingUsuario = {papel, nome}` e o header `X-Moving-Token` (token em `localStorage.moving_token`). Só `admin` e `superadmin` editam. **Enquanto o login não existir, qualquer um consegue editar.** A RPC de salvar já passa a exigir token de admin/superadmin automaticamente assim que existir a tabela `moving_excluir_usuarios` com algum usuário.

## 12. Faturamento completo: custos, lucro/prejuízo, ponto de equilíbrio e projeção por meta
- Aba Faturamento: KPIs (faturamento real, custos, resultado projetado hoje, ponto de equilíbrio) → DRE "Resultado projetado com as vendas de hoje" → receita por origem + por setor → tabela "Projeção de lucro por meta" (usa as mesmas metas de `moving_excluir_metas`, ticket médio e % de pagos atuais) → Premissas | Custos → tendência de vendas.
- Custos e investimentos: lista editável (item, categoria, valor, pago/previsto) com Editar / + Adicionar / Salvar / Cancelar. Premissas ganharam "custo do bar (%)" e "taxa das ticketeiras (%)".
- Tudo fica em `moving_excluir_estimativas.dados` (`custos`, `cmv_bar`, `taxa_ingresso` + premissas). A RPC `moving_excluir_estimativas_salvar` **mescla** com o que já está salvo, então salvar só os custos não apaga as premissas e vice-versa.
- Ponto de equilíbrio = custos cadastrados ÷ lucro que cada ingresso a mais traz (ingresso + estacionamento + bar − custo do bar − taxa).

## 13. Divergência de faturamento (Vendas por Dia × Faturamento) — corrigida
- Causa: Vendas por Dia somava **camping e copo** na quantidade e na receita, e o ticket médio dividia por todos os itens (incluindo cortesias/camping).
- Regra agora (fonte única = `moving_excluir_resumo()`):
  - **Quantidade de ingressos** (Visão geral e Vendas por Dia com "Todos os setores"): só `tipo = INGRESSO`.
  - **Faturamento** (aba Faturamento e "Faturamento no período" em Vendas por Dia): ingressos pagos **+ camping + copo** = receita real total.
  - **Ticket médio do ingresso** = receita de ingressos pagos ÷ ingressos pagos (em todas as telas).
- `vendas_diarias` agora vem só do RPC (fuso de São Paulo) e traz `tipo` e `pagos`; `extras` traz `pagos` e `receita`.
- Aba Faturamento dividida em sub-abas: **Resumo e metas** (KPIs reais, simulador "e se bater a meta", DRE, projeção por meta, tendência), **Receitas extras** (premissas de estacionamento/bar) e **Despesas** (lista editável). Despesa de R$ 2.000.000 cadastrada como **exemplo fictício** — substituir.

## 14. Faturamento: custo do evento, caixa e projeção do dia do evento
- Gráficos de tendência (vendas por dia/hora/semana) **removidos** da aba Faturamento (não eram usados). As chamadas `line/barv` ficaram protegidas com `if($('chartX'))`.
- Topo do Resumo: **Total faturado** (ingressos + camping + copo), **Custo atual do evento**, **Total pago**, **Falta pagar**, **Saldo (faturado − pago)** e barra de pagamento.
- Despesas têm **valor total** e **já pago** (pagamento parcial), botão **Quitar**, situação automática (Pago / Parcial / A pagar).
- **Projeção no dia do evento** = ingressos atuais + média diária dos últimos N dias completos × dias até a data do evento. Data do evento (padrão 17/10/2026) e N (padrão 7) editáveis em Receitas extras. Camping e copo projetados na mesma proporção dos ingressos.

## 15. Importar e conferir (planilha Sympla/Uticket × painel)
- Nova aba `conferencia` ("Importar e conferir"). Aceita CSV, XLSX e XLS (leitor SheetJS 0.18.5 carregado do cdnjs só quando precisa).
- O arquivo é lido **no navegador**. Detecta sozinho a linha de cabeçalho, as colunas (código, lote, valor, status, data) e a ticketeira; o usuário pode corrigir as colunas.
- Compara pelo **hash SHA-256** de `PLATAFORMA-código` com a RPC `moving_excluir_conferencia(plataforma, token)` (via `GET /api/conferencia`). O banco nunca devolve código, nome ou e-mail.
- Mostra: batem, faltam no painel, sobram no painel, valor diferente, status diferente, lote sem setor; totais por tipo (ingresso/camping/copo) e CSV das divergências.

## 16. Uticket cancelados, conferência com arquivos reais e recebimentos
- **Bug corrigido na sincronização (Edge Function v4):** o extrato da Uticket tem a coluna "Status do Pedido"; antes tudo entrava como CONFIRMADO. Agora "Cancelado" vira CANCELADO (95 ingressos corrigidos em 07/10).
- Importar e conferir: aceita a **Lista de participantes da Uticket**, a **Lista de participantes da Sympla** (o arquivo declara faixa só na coluna A; o painel recalcula) e o **Borderô da Uticket** (resumo por lote: compara quantidade por setor; o borderô usa preço de tabela e desconta cupons no fim).
- Sympla: quantidades batem 100% com a planilha; 400 ingressos ("PRÉ VENDA LOTE 2") têm no banco o valor com a taxa de 10% da Sympla (ex.: 141,08 × 128,25). Pendente decidir se o faturamento usa o valor sem taxa.
- Faturamento ganhou a sub-aba **Recebimentos** (repasses lançados por ticketeira, guardados na linha `id='repasses'` de `moving_excluir_estimativas`) e os cartões Recebido / A receber / Caixa hoje (recebido − pago).

## 17. Autenticação, Controle de Acesso (RBAC) e Gestão de Usuários
- **Banco (Supabase `etjqbqorawnnvdlmztka`):**
  - Tabela `moving_excluir_usuarios`: `id`, `login` (único, minúsculo), `nome`, `senha_hash` (`bcrypt` via `pgcrypto crypt/gen_salt('bf')`), `papel` (`superadmin | admin | usuario`), `telas text[]`, `ativo boolean`, `tentativas int`, `bloqueado_ate timestamptz`.
  - Tabela `moving_excluir_sessoes`: `id`, `usuario_id`, `token_hash` (`SHA-256`), `criado_em`, `expira_em` (sessão de 7 dias com auto-renovação).
  - Bloqueio por força bruta: 6 tentativas com erro bloqueiam por 15 minutos (`bloqueado_ate`).
  - Salvaguardas: superadmin não pode se auto-excluir e o sistema nunca pode ficar sem ao menos um superadmin ativo.
  - 7 RPCs `SECURITY DEFINER`: `moving_excluir_login`, `moving_excluir_me`, `moving_excluir_logout`, `moving_excluir_usuarios_listar`, `moving_excluir_usuario_salvar`, `moving_excluir_usuario_excluir`, `moving_excluir_senha_trocar`.
- **Perfis e Níveis de Acesso:**
  - `superadmin` (ex: `evandro@startinc.com.br`): acesso total irrestrito + tela exclusiva de Gestão de Usuários no menu lateral (adicionar/editar colaboradores, resetar senhas, bloquear contas e definir telas permitidas).
  - `admin` (ex: `movingadmin`): acesso a todas as telas analíticas, estimativas, conferência e botão Sincronizar. Sem acesso à tela de usuários.
  - `usuario` (ex: `carolamandoneves@gmail.com`): acesso restrito apenas às telas marcadas pelo SuperADMIN (padrão inicial: `overview` e `diario`). Botão Sincronizar oculto.
- **Frontend & Segurança:**
  - Tela de login com design ManyChat clean: overlay escuro, cartão flutuante com blur, campo com toggle de visualização de senha e feedback de erro em tempo real.
  - Rodapé da sidebar com perfil ativo: iniciais em avatar estilizado, badge colorido com o papel (`SuperADMIN`, `Administrador`, `Usuário`), botão de troca de senha própria (`/api/senha`) e botão de logout.
  - Todas as chamadas de dados usam o header `X-Moving-Token`. Sem token válido, o backend responde 401 e a interface direciona para o login.


## 17. Login pendente, IA e Sympla sem taxa (07/10)
- **Login travava o painel:** o login foi publicado mas as tabelas `moving_excluir_usuarios/sessoes` não existem no banco. Agora o Worker detecta isso (`loginAtivo`) e abre o painel em **acesso livre** (usuário "Acesso livre", papel admin). Quando o `migration_auth.sql` for aplicado, o login passa a ser exigido sozinho (cache de 60 s).
- Corrigido no front: `/api/me` devolve `{ok:true}` (o front esperava `status:'ok'` e deslogava todo mundo). Mesma correção em trocar senha / salvar / excluir usuário.
- `migration_auth.sql` estava com as senhas reais em texto. Trocadas por `TROQUE_PELA_SENHA` (preencher na hora de rodar). As senhas antigas ainda aparecem no histórico do Git.
- **Sympla sem taxa (Edge Function v5):** valor do ingresso = `ticket_sale_price × (order_total_net_value ÷ order_total_sale_price)` do pedido. Remove a taxa de conveniência de 10% que o comprador paga.
- **Análise com IA:** `POST /api/ia` (exige sessão ou acesso livre) usa `GEMINI_API_KEY` (modelo `GEMINI_MODEL`, padrão `gemini-2.5-flash`) ou `ANTHROPIC_API_KEY` (modelo `CLAUDE_MODEL`). Sem chave, responde 501 com instrução. Botões "Analisar com IA" no Resumo do Faturamento e no resultado da Conferência; só manda o texto com números da tela (sem nomes, e-mails ou códigos).
- Uticket financeiro: testados 20 endpoints prováveis da API (`/financial`, `/transfers`, `/withdraws`, …) — todos 404. Falta a chamada real da página Financeiro.

## 18. Entrar com código por e-mail / Esqueci minha senha
- Tela de login ganhou "Entrar com código por e-mail" e "Esqueci minha senha" (o segundo pede uma senha nova depois do código).
- Banco: `migration_codigo_email.sql` (tabela `moving_excluir_codigos`, coluna `via_codigo` em `moving_excluir_sessoes`, RPCs `moving_excluir_codigo_enviar`, `moving_excluir_codigo_entrar`, `moving_excluir_senha_redefinir`).
- O código (6 dígitos, 10 min, 5 tentativas, até 3 pedidos a cada 15 min) é gerado e enviado **pelo próprio banco** (pg_net → Resend), então nunca passa pelo Worker nem pelo navegador. Chave no cofre: `moving_excluir_resend_key`; remetente: `moving_excluir_email_remetente`.
- Senha nova sem a atual só vale numa sessão aberta por código há menos de 15 min; derruba as outras sessões do usuário.
- Worker: `POST /api/login/codigo`, `POST /api/login/codigo/entrar`, `POST /api/senha/redefinir`.
- Só funciona para usuários cujo login é um e-mail (o `movingadmin` não recebe código).

## 19. Cupons por canal (análise de ADS) — 07/10
- Mapa fixo em `_worker.js` (`MAPA_ANALISE`, match exato do código):
  STARTGRUPON / STARTGRUPOA = Grupo do WhatsApp · STARTADS = 100% ADS gestão nova ·
  MOVINGMANIACO15 = 100% ADS gestão antiga · MOVINGBIO = orgânico link na bio · MOVINGDIRECT = orgânico ManyChat.
- `/api/resumo` devolve `canais_analise` {ads (com gestao_nova/gestao_antiga), whatsapp, organico}.
- Tela Cupons: card "Análise de canais por cupom" (comentário `ANALISE_ADS`).
- MOVINGBIO e MOVINGDIRECT saíram de "Promoters" (não ganham recompensa de 10 vendas).
- ANINHA = lista interna Moving (prospecção direta), fora de Promoters.
- Todos os cupons START* = ações de venda da Start Inc. (agência contratada). STARTADSNATIVO entra em ADS gestão nova; STARTSMS = SMS Marketing.
- Para incluir cupom novo num canal, adicionar uma linha em `MAPA_ANALISE`.

## 20. Aba Recebimentos removida — 07/10
- A pedido do Evandro, a sub-aba "Recebimentos" saiu do Faturamento (botão removido; o bloco fica escondido no HTML). Quem tinha essa aba salva no navegador volta para "Resumo e metas".
- CUPOMGUTO (Uticket) e GUTO (Sympla) são o mesmo afiliado: na lista cada um fica na sua linha (igual à ticketeira, com a nota "mesmo cupom"); na análise de canais são somados. Novos pares: `ALIAS_CUPOM`.
- 07/10 (Carol): FULLDIVULGAÇÃO e GOLDDIVULGAÇÃO = equipe interna Moving; "DIVULGADOR + nome" = equipe Fran Saval (Júlia gera); BDAY e MEIA = atendimento WhatsApp da Carol; 5035 e códigos "___…" = origem não identificada. Regras em `analisePorRegra` (`_worker.js`). Acentos são ignorados na comparação.
- 07/10: Programa de afiliados = TRIPTRANCE, TRIP, NATANIELE5, KIOMA, KIOMA2, HELENA15, GUTO, GUTO2, DALETOUR, ALEMOA, FESTASRS (Lais). Lista `AFILIADOS` no `_worker.js`; origem PARCERIA (card renomeado "Programa de afiliados"). NATANIELE (Uticket, sem o 5) continua promoter.

## 21. Filtros da lista de cupons — 07/10
- 4 abas: Todos · Promoter / Afiliados (submenu Uticket 1 a cada 10 / Sympla 7%; inclui promoters, afiliados e equipe Fran Saval) · Aniversariantes (só Sympla) · Marketing (submenu Start Inc. "Champions League" / Jurássico "Íbis" = antiga gestão, só Uticket).
- O submenu de ticketeira só aparece em Promoter / Afiliados; ao sair dele volta para "Uticket + Sympla".

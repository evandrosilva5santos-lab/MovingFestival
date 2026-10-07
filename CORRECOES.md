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

## 10. Reconciliação Temporal Uticket (3.793 vs 3.960), Lote Wix e Motores de Validação
- **Divergência aparente Uticket (3.960 vs 3.793):** O número 3.793 era a contagem congelada na auditoria de 05/10 às 21:59. Entre 05/10 22:00 e 06/10 22:35, o festival vendeu +167 ingressos reais ao vivo (140 vendas apenas no dia 06/10), chegando a 3.960 ingressos válidos. Não há erro nem duplicidade.
- **Estrutura Uticket (5.073 linhas):** A API Uticket entrega 5.073 registros brutos no total: 3.960 ingressos oficiais + 1.038 campings (acomodações que não contam como ingresso) + 75 copos avulsos = 5.073. Reconciliação 100% matemática.
- **Wix (366 ingressos fixos):** Não possui API aberta. Mantido como lote estático de pré-lançamento (01/06) com 366 ingressos (197 Full Pass, 64 Zone, 56 Gold, 49 Black = R$ 52.750,00), protegido via chave única `WIX-HIST-*`.
- **Suite de Validação (`motores_validacao.py`):** Ferramenta com 5 motores autônomos que cruza os dados ao vivo, gera `relatorio_validacao_cruzada.json` e audita discrepâncias.


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

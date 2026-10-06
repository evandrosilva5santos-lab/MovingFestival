# DESIGN SYSTEM — Painel Moving Festival 2026

> Fonte de verdade do visual. Substitui o `DESIGN.md` antigo da raiz (dark neon), que não vale mais.
> Implementação de referência: `../index.html`.

---

## 1. Direção visual
- **Estilo:** app SaaS limpo, light, inspirado no ManyChat.
- **Sensação:** calmo, organizado, muito respiro. Nada de neon, brilho ou glassmorphism.
- **Regra de ouro:** o número é o herói. Cor serve para dar significado (setor, status), não para enfeitar.
- **Tema escuro:** automático quando o sistema do usuário está em dark. Mesmos tokens, valores trocados.

---

## 2. Cores (tokens CSS)

### Base — tema claro (padrão)
| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#F5F6F8` | Fundo da página |
| `--surface` | `#FFFFFF` | Cards, sidebar |
| `--surface-2` | `#F8F9FB` | Trilhos de barra, hover, cards de Extras |
| `--border` | `#E7E9EE` | Bordas de cards e tabelas |
| `--border-2` | `#EEF0F4` | Linhas internas de tabela |
| `--fg` | `#171A1F` | Texto principal e números |
| `--fg-muted` | `#656D78` | Rótulos, textos de apoio |
| `--fg-faint` | `#9AA1AC` | Legendas, cabeçalhos de tabela |
| `--accent` | `#2B6CF6` | Azul da marca: botões, item ativo, barra líder dos gráficos |
| `--accent-soft` | `rgba(43,108,246,.10)` | Fundo do item ativo na sidebar |
| `--accent-ink` | `#1E52C7` | Texto do item ativo |
| `--bar-muted` | `#DEE3EA` | Barras não-líderes nos gráficos |

### Base — tema escuro
| Token | Valor |
|---|---|
| `--bg` | `#0F1216` |
| `--surface` | `#171B21` |
| `--surface-2` | `#1C2128` |
| `--border` | `#262B33` |
| `--fg` | `#F2F4F7` |
| `--fg-muted` | `#9BA3AE` |
| `--accent` | `#4C86FF` |
| `--bar-muted` | `#2A313B` |

### Setores (fixos, um por setor)
| Setor | Claro | Escuro |
|---|---|---|
| Full Pass | `#0EA5E9` | `#38BDF8` |
| Zone | `#8B5CF6` | `#A855F7` |
| Gold | `#E08A00` | `#F59E0B` |
| Black | `#475569` | `#CBD5E1` |

### Status (semânticas)
| Token | Valor | Uso |
|---|---|---|
| `--c-success` | `#16A34A` | Sincronizado, ritmo subindo |
| `--c-warning` | `#D97706` | Atenção, dado de exemplo |
| `--c-danger` | `#DC2626` | Erro de sincronização |

### Régua de metas
Cada trecho da barra vai de uma meta até a próxima, com a cor da meta onde o trecho termina (as bordas coincidem com os traços dos rótulos).

| Meta | Classificação | Cor da barra | Texto (claro) |
|---|---|---|---|
| 5k | Ruim | `#DC2626` | `#B91C1C` |
| 6k | Ok | `#F97316` | `#C2410C` |
| 7k | Dá pra melhorar | `#EAB308` | `#A16207` |
| 7,5k | Saímos da merda | `#60A5FA` | `#2563EB` |
| 8k | Boa | `#2B6CF6` | `#1E52C7` |
| 8,5k | Ótima | `#4ADE80` | `#16A34A` |
| 9k | Excelente | `#22C55E` | `#15803D` |
| 9,5k | Magnífico | `#16A34A` | `#166534` |
| 10k | Estourar champanhe 🍾 | `#15803D` | `#14532D` |

- Valores sempre em **k** (5k, 7,5k, 10k). Nome da classificação quebrado em duas linhas ("Dá pra / melhorar"). Tudo numa linha só, alinhado.
- **Não usar "Meta 0, Meta 1…"** na tela. A meta é chamada pelo valor.
- Selo ao lado do total: **"Nível atual · <classificação>"** (não usar "batida"). À direita: "Próxima: 6k · Ok" + "faltam N".
- No escuro, o texto usa a cor da barra (mais clara). Classes CSS próprias (`.trilho`, `.faixa`), nunca `.seg`.
- **Confete:** ao atingir uma meta, confete + aviso no topo ("🎉 Bateu 6k · Ok"). Cada pessoa vê **uma vez por meta** (guardado no navegador, chave `moving_metas_comemoradas`). Na primeira visita com várias metas já batidas, comemora só a mais alta.
---

## 3. Tipografia
- **Títulos e números:** Plus Jakarta Sans (600–800).
- **Texto e interface:** Inter (400–700).
- Números sempre com `font-variant-numeric: tabular-nums` e separador de milhar `pt-BR` (4.963).

| Elemento | Fonte | Tamanho | Peso |
|---|---|---|---|
| Título da página | Plus Jakarta | 20px | 700 |
| Número do total na régua | Plus Jakarta | 38px | 800 |
| Número KPI | Plus Jakarta | 30px | 800 |
| Número de setor | Plus Jakarta | 32px | 800 |
| Título de card | Inter | 12px | 700 |
| Texto | Inter | 14px | 400 |
| Legenda | Inter | 11–12px | 500–600 |

---

## 4. Forma e espaço
- **Raio:** cards `14px` · botões e itens de menu `10px` · pílulas `999px`.
- **Sombra:** quase nenhuma. Cards: `0 1px 2px rgba(16,24,40,.05), 0 1px 3px rgba(16,24,40,.04)`.
- **Borda:** 1px `--border` em todo card.
- **Espaçamento:** `16px` entre cards · `18px` dentro do card · `24–26px` de margem do conteúdo.
- **Largura máxima do conteúdo:** 1180px.

---

## 5. Layout (app shell)
```
┌──────────┬──────────────────────────────────────────────┐
│          │ Topbar: título · filtro de setor · status ·   │
│ Sidebar  │         botão Sincronizar                     │
│ 244px    ├──────────────────────────────────────────────┤
│          │ Conteúdo da tela ativa                        │
│ logo     │                                              │
│ menu     │                                              │
│ usuário  │                                              │
└──────────┴──────────────────────────────────────────────┘
```
- **Sidebar:** branca, logo "M" em azul, 5 itens com ícone de linha (19px). Item ativo = fundo `--accent-soft` + texto `--accent-ink`.
- **Topbar:** fixa no topo, fundo translúcido com blur leve.
- **Mobile (< 860px):** a sidebar vira uma barra horizontal rolável no topo; o grid cai para 2 colunas e depois 1.

---

## 6. Telas
| Tela | Conteúdo |
|---|---|
| **Visão geral** | Régua de metas → 4 KPIs → 4 cards de setor → Extras (fora do total) → tabela por ticketeira + gráfico de plataformas |
| **Plataformas & canais** | Ranking de plataformas · ranking de canais · tabela plataforma × setor |
| **Promoters** | Ranking de afiliados da Sympla |
| **Ingressos** | Ranking de lotes que mais vendem |
| **Tendências** | Vendas por dia (linha) · por hora (barras) · por dia da semana (barras) |

---

## 7. Componentes

### Card
Fundo `--surface`, borda 1px, raio 14px, sombra mínima, padding 18px. Título pequeno (12px, 700, `--fg-muted`) no topo.

### KPI
Rótulo pequeno → número grande → linha de apoio. O "Total geral" leva o número em azul (`--accent`). "Ritmo" mostra ▲ em verde quando sobe.

### Card de setor
Bolinha com a cor do setor + nome · % do total à direita → número grande → "X pagos · Y cortesias" → barra de % na cor do setor → divisão por plataforma (uticket · sympla · wix).

### Card de Extras (Camping, Copo)
Mesmo formato do setor, mas **borda tracejada, fundo `--surface-2`, sem sombra** e selo "não soma". Fica sob o título "Extras" com a pílula "fora do total de ingressos". Nunca usar visual de setor para extras.

### Régua de metas
Barra horizontal de 4.000 a 10.000, dividida por meta. Cada trecho tem a cor da classificação; trechos já alcançados ficam cheios, os seguintes ficam claros. Marcador escuro "Agora · 4.963" no valor atual. Embaixo de cada divisão: valor, classificação e nome da meta. Acima: total atual, selo de status ("Meta 1 batida · Ok") e "Próxima: Meta X · faltam N".

### Filtro de setor
Controle segmentado (pílulas dentro de uma caixa cinza). Opções: Todos · Full Pass · Zone · Gold · Black · Camping. Selecionado = fundo branco + sombra leve. **Só aparece na tela Visão geral**; nas outras telas fica escondido e volta para "Todos".

### Botão principal
Fundo `--accent`, texto branco, raio 10px, ícone de 16px à esquerda. Ex.: "Sincronizar". **No celular (< 860px)** o "Sincronizar" vira botão flutuante redondo (56px) no canto inferior direito, só com o ícone; gira enquanto sincroniza. A topbar não pode ter `backdrop-filter` no celular, senão o botão não flutua.

### Status de sincronização
Bolinha verde pulsando + "há 2 min". Vermelha quando a última sincronização falhou.

### Tabela
Cabeçalho em maiúsculas pequenas (11px, `--fg-faint`), linhas separadas por `--border-2`, números alinhados à direita, linha de total em negrito. Bolinha de cor antes do nome do setor.

### Ranking (promoters)
Posição · nome + setor · barra fina na cor do setor · valor à direita.

### Gráficos
- Barras horizontais (rankings), barras verticais (hora, dia da semana), linha com área suave (por dia).
- **Barra líder em azul `--accent`**, as demais em `--bar-muted`. Valor escrito na ponta.
- Sem grade pesada, só a linha de base. Rótulos em Inter 10px `--fg-muted`.

### Aviso
Card com borda esquerda azul de 3px, texto 12px. Usado para "dados de exemplo".

---

## 8. Estados de tela
| Estado | Como aparece |
|---|---|
| Carregando | Esqueleto cinza (`--surface-2`) no lugar dos números |
| Preenchido | Dados normais |
| Vazio | "Nenhuma venda sincronizada ainda" + botão Sincronizar |
| Erro | Status vermelho + mensagem do último erro (ex.: "Falha de login na Uticket") + botão "Tentar novamente" |

---

## 9. Regras de conteúdo
- Dado que não é real recebe o selo **"exemplo"**.
- Camping e Copo nunca somam nos totais, metas ou gráficos de ingressos.
- Números sempre no formato brasileiro (4.963 · R$ 1.250,00).
- Textos curtos e diretos, em português.

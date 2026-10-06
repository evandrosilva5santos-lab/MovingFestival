# PRD - Plataforma de Inteligência e Vendas em Tempo Real (Moving Festival 2026)

## 1. Visão Geral do Produto
A **Plataforma de Inteligência e Vendas** é um dashboard executivo e motor de sincronização em tempo real desenvolvido para consolidar vendas de ingressos de múltiplas ticketeras (Uticket, Sympla e Wix) sem dependência de APIs públicas oficiais.

O sistema resolve a dor crítica de visibilidade de bilheteria e ritmo de vendas por setor em momentos de pico de campanhas (viradas de lote, disparos de WhatsApp e anúncios no Meta Ads).

---

## 2. Problema Central & Oportunidade
* **Falta de API Pública:** Plataformas como Uticket e Sympla não oferecem APIs REST abertas para consumo contínuo por terceiros.
* **Dados Fragmentados:** Vendas distribuídas entre Uticket, Sympla e Wix dificultam o cálculo rápido do total real de ingressos vendidos (Full Pass, Zone, Gold e Black).
* **Decisões Lentas de Tráfego:** Sem dados em tempo real, a equipe de marketing e tráfego não sabe exatamente quando pausar anúncios de um setor esgotado ou quando forçar a virada de lote.

---

## 3. Escopo do MVP (Versão 1.0)

### 3.1 Motor de Extração (Scraper / Ingestor Automático)
* **Robô Headless (Playwright):**
  * Autenticação segura e sessão persistente na Uticket e Sympla.
  * Captura periódica (ex: a cada 5, 10 ou 15 minutos) do Borderô e Lista de Participantes.
  * Deduplicação inteligente de registros por código de ingresso.
* **Importador / Sincronizador Wix:**
  * Endpoint / interface rápida para atualização dos números da Wix.

### 3.2 Motor de Métricas e Consolidação
* Agrupamento automático pelos 4 setores oficiais:
  * **FULL PASS** (todos os lotes, convocações e promoções)
  * **ZONE (PASS)** (todos os lotes e promoções)
  * **GOLD** (lotes convencionais e convocações VIP)
  * **BLACK** (lotes convencionais e promoções)
* **Regras de Exclusão:**
  * Exclusão automática de itens não-ingressos (Copos avulsos e Campings).
* **Separação Obrigatória:**
  * Total de Ingressos Vendidos (Pagos).
  * Total de Cortesias.
  * Total Geral (Pagos + Cortesias).

### 3.3 Dashboard Executivo em Tempo Real
* **Visão Geral (Hero Metrics):** Total consolidado geral de ingressos e receita acumulada.
* **Termômetro por Setor:** Cards individuais com contadores, percentual de ocupação e ritmo de vendas recente.
* **Detalhamento por Plataforma:** Comparativo claro lado a lado (Uticket vs Sympla vs Wix).
* **Modo TV / Live Display:** Interface responsiva otimizada para monitoramento no desktop e celular com suporte a Dark Mode e Sidebar retrátil.

### 3.4 Módulo Analítico de Vendas por Dia (Filtros Multidimensionais)
* **Filtros Dinâmicos:**
  * **Período / Temporal:** Chips de atalho (Hoje, Ontem, 7d, 14d, 30d, Todo o Período) e seletores De/Até com inputs de data nativos.
  * **Plataforma:** Todas as Plataformas, Uticket, Sympla, Wix.
  * **Setor:** Todos os Setores, Full Pass, Zone, Gold, Black, Camping.
* **KPIs da Seleção:** Total vendido no filtro, Receita gerada líquida, Média diária de vendas (dias ativos) e Melhor Dia (Pico de bilheteria).
* **Gráfico de Evolução:** SVG interativo com barras proporcionais por data.
* **Tabela Analítica Dia a Dia:** Detalhamento com colunas Data, Dia da Semana, Total Vendas, Quebra por Plataforma (Uticket, Sympla, Wix), Quebra por Setor (Full Pass, Zone, Gold, Black, Camping) e Receita Estimada em R$.

### 3.5 Inteligência Territorial & Telefones dos Compradores
* **Auditoria de 5.027 Telefones/WhatsApp:**
  * Identificação de País: 🇧🇷 Brasil (100% da base compradora).
  * Estados: RS (92,3%), SC (5,4%), SP (0,5%), PR (0,5%), Outros (1,3%).
  * Polos Metropolitanos: Porto Alegre & RM, Pelotas & Sul, Caxias & Serra, Florianópolis & Litoral, etc.

### 3.6 Gestão de Ações Start Inc. e Cupons
* Mapeamento de grupos VIP Start Inc:
  * `STARTGRUPON`: Grupo VIP Novos (Noturno 2026).
  * `STARTGRUPOA`: Grupo VIP Antigos (Base 2022/2023).
* Recompensas Uticket: Regra de 1 ingresso ganho a cada 10 vendas de promoter.
* Aniversariantes Sympla (BDAY): Status de liberação (mínimo 2 vendas).

---

## 4. Fora de Escopo (v1.0)
* Emissão de notas fiscais.
* Integração direta com gateways de pagamento de fora das ticketeras.
* Check-in de portaria física no dia do evento (mantido no app nativo da ticketeira).

---

## 5. Personas & Usuários
* **Produtor Executivo / Diretor de Vendas:** Quer abrir o celular e saber exatamente o número final para tomar decisão de lote.
* **Gestor de Tráfego & Lançamento:** Precisa saber o ritmo de vendas hora a hora para orquestrar criativos e orçamento de Meta Ads.

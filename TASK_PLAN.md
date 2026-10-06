# TASK PLAN - Execução Atômica da Plataforma (Metodologia ECC)

## 📌 Status Atual: Etapa 1 a 4 Concluídas (PRD + DESIGN + SCHEMA)
> Próximo passo: Execução atômica das tarefas abaixo, uma por vez, com validação a cada micro-passo.

---

## 📋 Checklist Atômico de Tarefas

- [ ] **Tarefa 1: Motor de Normalização de Dados (`data_engine.py`)**
  - Mapear e normalizar lotes da Uticket, Sympla e Wix em um único modelo de dados.
  - Implementar exclusão estrita de Copos e Campings.
  - Separar com precisão cirúrgica Vendidos (Pagos) de Cortesias.
  - *Critério de Aceite:* Retornar JSON idêntico à auditoria oficial (4.894 pagos + 69 cortesias = 4.963 total).

- [ ] **Tarefa 2: Robô Headless de Sincronização (`sync_uticket_bot.py`)**
  - Configurar script com Playwright headless para autenticação e exportação automatizada da Uticket.
  - Salvar snapshots atualizados com timestamp em cache local.
  - *Critério de Aceite:* Extração ponta a ponta funcionando com execução silenciosa e tratamento defensivo de erros.

- [ ] **Tarefa 3: API Local / Backend Fast Server (`server.py`)**
  - Rota `GET /api/vendas/summary` (totais consolidados e por setor).
  - Rota `GET /api/vendas/platforms` (comparativo Uticket, Sympla e Wix).
  - Rota `POST /api/sync` (gatilho de sincronização imediata).
  - *Critério de Aceite:* Respostas com validação de esquema em menos de 100ms.

- [ ] **Tarefa 4: Dashboard Web Frontend (`index.html` + `app.js` + `styles.css`)**
  - Construir interface Dark Mode moderna seguindo o `DESIGN.md`.
  - Cards por setor com cores temáticas (Cyan, Purple, Gold, Black).
  - Tabela comparativa interativa e contadores dinâmicos.
  - Cobertura dos 4 estados de tela (Loading, Empty, Success, Error).
  - *Critério de Aceite:* Dashboard renderizando perfeitamente no navegador, responsivo para desktop e mobile.

- [ ] **Tarefa 5: Validação Final & Browser QA (`browser-qa`)**
  - Testar no navegador com inspeção visual.
  - Validar ausência de erros no console.
  - Entregar comando de um clique para rodar e visualizar.

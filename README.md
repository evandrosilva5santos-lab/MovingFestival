# Moving Festival 2026 — Painel de Vendas Executivo

Dashboard em tempo real de inteligência de vendas, bilheteria, cupons, metas e análise territorial do Moving Festival 2026 (consolidando Uticket, Sympla e Wix).

---

## 🚀 Como Subir na Cloudflare em 2 Minutos

### Opção 1: Via Painel Web da Cloudflare (Recomendado - 100% Automático)
1. Acesse seu painel: [dash.cloudflare.com](https://dash.cloudflare.com)
2. No menu lateral esquerdo, clique em **Workers & Pages** -> **Create application**.
3. Selecione a aba **Pages** -> clique em **Connect to Git**.
4. Conecte sua conta do GitHub e selecione o repositório **`MovingFestival`**.
5. Em **Set up builds and deployments**:
   - **Framework preset:** `None`
   - **Build command:** *(deixar vazio)*
   - **Build output directory:** `.` *(raiz)*
6. Clique em **Save and Deploy**.
7. Pronto! A Cloudflare gerará uma URL pública global com SSL gratuito (ex: `moving-festival.pages.dev`).

---

### Opção 2: Via Terminal (Wrangler CLI)
```bash
# Na pasta do projeto:
npx wrangler pages deploy . --project-name moving-festival-painel
```

---

## 🛠️ Como Rodar Localmente

```bash
# 1. Servidor do painel executivo (porta 7777):
python3 server.py

# Acesse no navegador:
# http://localhost:7777

# 2. Sincronização em tempo real (background):
python3 sync_worker.py
```

---

## 🔒 Segurança de Segredos
- O arquivo `.env` **nunca** é versionado no Git.
- O Cloudflare Worker utiliza a `SUPABASE_ANON_KEY` para leitura autorizada do RPC de métricas agregadas sem expor credenciais sensíveis.
- Os scrapers e sincronizadores que gravam no banco utilizam a `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no ambiente local ou secrets protegidos.

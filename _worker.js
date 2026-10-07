/**
 * Cloudflare Worker — Moving Festival 2026
 * Motor de API, Sincronização Serverless e Cron Trigger de 15 minutos na nuvem.
 */

const SUPABASE_DEFAULT_URL = 'https://etjqbqorawnnvdlmztka.supabase.co';
const SUPABASE_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0anFicW9yYXdubnZkbG16dGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMDQ3MzYsImV4cCI6MjA4ODY4MDczNn0.LuLbWvZEt90ha53_36LgWQ_9tXY4tm0Fd03Q5lIruz0';

function classifyCupom(cupomRaw) {
  if (!cupomRaw) return { origem: 'OUTROS', canal: 'OUTROS' };
  const u = String(cupomRaw).toUpperCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  let origem = 'PROMOTER';
  if (u.includes('START')) origem = 'START_INC';
  else if (u.includes('BDAY')) origem = 'ANIVERSARIANTE';
  else if (u.includes('MANIACO')) origem = 'ANTIGA_GESTAO';
  else if (['FESTASRS', 'TRIPTRANCE', 'KIOMA'].some(k => u.includes(k))) origem = 'PARCERIA';

  let canal = 'PROMOTER';
  if (u.includes('STARTGRUPON')) canal = 'GRUPO_VIP_NOTURNO';
  else if (u.includes('STARTGRUPOA')) canal = 'GRUPO_VIP_ANTIGOS';
  else if (u.includes('STARTADS')) canal = 'META_ADS';
  else if (u.includes('STARTEMAIL')) canal = 'EMAIL_MARKETING';
  else if (u.includes('STARTSMS')) canal = 'SMS_MARKETING';
  else if (u.includes('STARTELEICAO')) canal = 'CAMPANHA_ELEICAO';
  else if (u.includes('STARTBLACK')) canal = 'CAMPANHA_BLACK';
  else if (u.includes('STARTCASAMENTO')) canal = 'CAMPANHA_CASAMENTO';
  else if (u.includes('START')) canal = 'START_OUTROS';
  else if (u.includes('MANIACO')) canal = 'ANTIGO_MKT';
  else if (origem === 'ANTIGA_GESTAO') canal = 'ANTIGO_MKT';
  else if (origem === 'ANIVERSARIANTE') canal = 'ANIVERSARIANTE';
  else if (origem === 'PARCERIA') canal = 'PARCERIA';

  // promoter unificado
  const promoter = u.includes('GUTO') ? 'GUTO' : (origem === 'PROMOTER' ? cupomRaw : null);

  // ANALISE_ADS — mapa definido pelo Evandro (07/10)
  let ac = analiseCanal(u);
  if (!ac) ac = analisePorRegra(u);
  if (ac) {
    canal = ac.canal;
    if (ac.origem) origem = ac.origem;
    else if (ac.grupo === 'ORGANICO') origem = 'ORGANICO';
    else if (ac.grupo === 'INTERNA') origem = 'INTERNA';
  }
  return { origem, canal, promoter, grupo: ac ? ac.grupo : null, gestao: ac ? ac.gestao : null };
}

// Cupons que entram na análise de ADS / canais (match exato do código do cupom).
const MAPA_ANALISE = {
  STARTGRUPON:    { grupo: 'WHATSAPP', canal: 'WHATSAPP_GRUPO', rotulo: 'Grupo do WhatsApp' },
  STARTGRUPOA:    { grupo: 'WHATSAPP', canal: 'WHATSAPP_GRUPO', rotulo: 'Grupo do WhatsApp' },
  STARTADS:       { grupo: 'ADS', canal: 'ADS_GESTAO_NOVA',   gestao: 'NOVA',   rotulo: 'Venda 100% ADS · gestão nova' },
  STARTADSNATIVO: { grupo: 'ADS', canal: 'ADS_NATIVO',        gestao: 'NOVA',   rotulo: 'Venda 100% ADS · nativo (gestão nova)' },
  MOVINGMANIACO15:{ grupo: 'ADS', canal: 'ADS_GESTAO_ANTIGA', gestao: 'ANTIGA', rotulo: 'Venda 100% ADS · gestão antiga' },
  MOVINGBIO:      { grupo: 'ORGANICO', canal: 'ORGANICO_BIO',      rotulo: 'Orgânico · link na bio' },
  MOVINGDIRECT:   { grupo: 'ORGANICO', canal: 'ORGANICO_MANYCHAT', rotulo: 'Orgânico · automação ManyChat' },
  ANINHA:         { grupo: 'INTERNA', canal: 'INTERNA_PROSPECCAO', rotulo: 'Lista interna Moving · prospecção direta' },
  FULLDIVULGACAO: { grupo: 'INTERNA', canal: 'INTERNA_DIVULGACAO', rotulo: 'Equipe de divulgação Moving (equipe direta)' },
  GOLDDIVULGACAO: { grupo: 'INTERNA', canal: 'INTERNA_DIVULGACAO', rotulo: 'Equipe de divulgação Moving (equipe direta)' }
};
const semAcento = (x) => String(x || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
// Regras por padrão de nome (informadas pela Carol, 07/10)
function analisePorRegra(u) {
  if (u.includes('DIVULGADOR')) return { grupo: 'FRAN', canal: 'EQUIPE_FRAN', origem: 'EQUIPE_FRAN', rotulo: 'Equipe Fran Saval (divulgador + nome, gerado pela Júlia)' };
  if (u.startsWith('BDAY')) return { grupo: 'ATENDIMENTO', canal: 'ANIVERSARIANTE', origem: 'ANIVERSARIANTE', rotulo: 'Aniversariante · atendimento WhatsApp (Carol)' };
  if (u.startsWith('MEIA')) return { grupo: 'ATENDIMENTO', canal: 'MEIA_ENTRADA', origem: 'MEIA_ENTRADA', rotulo: 'Meia-entrada · atendimento WhatsApp (Carol)' };
  if (u === '5035' || /^_{2,}[0-9A-F]{6,}$/.test(u)) return { grupo: 'DESCONHECIDO', canal: 'DESCONHECIDO', origem: 'DESCONHECIDO', rotulo: 'Origem não identificada (ninguém da equipe criou)' };
  return null;
}
function analiseCanal(u) {
  const k = String(u || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '');
  return MAPA_ANALISE[k] || null;
}

// SYNC_NUVEM — nenhum segredo neste arquivo. Uticket/Sympla são consultadas pela função
// "moving-excluir-sync" no Supabase (senhas ficam no cofre/Vault).
function funcaoUrl(env, query = '') {
  const base = env?.SUPABASE_URL || SUPABASE_DEFAULT_URL;
  return `${base}/functions/v1/moving-excluir-sync${query}`;
}
function funcaoHeaders(env) {
  const anon = env?.SUPABASE_ANON_KEY || SUPABASE_DEFAULT_ANON;
  return { 'Authorization': `Bearer ${anon}`, 'apikey': anon, 'Content-Type': 'application/json' };
}

async function chamarSyncNuvem(env) {
  try {
    const r = await fetch(funcaoUrl(env), { method: 'POST', headers: funcaoHeaders(env), body: '{}' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) return { status: 'ERRO', erro: `função de sincronização respondeu HTTP ${r.status}` };
    return j;
  } catch (err) {
    return { status: 'ERRO', erro: `não consegui chamar a sincronização na nuvem: ${String(err)}` };
  }
}

async function buscarCuponsNuvem(env) {
  try {
    const r = await fetch(funcaoUrl(env, '?cupons=1'), { method: 'POST', headers: funcaoHeaders(env), body: '{}' });
    if (!r.ok) return { uticket: [], sympla: [] };
    return await r.json();
  } catch (err) {
    console.error('Erro cupons nuvem:', err);
    return { uticket: [], sympla: [] };
  }
}

// Mesmo cupom com nomes diferentes em cada ticketeira -> nome único (mostrado somado)
const ALIAS_CUPOM = { CUPOMGUTO: 'GUTO' };
function nomeCupom(raw) {
  const code = String(raw || '').trim();
  return ALIAS_CUPOM[code.toUpperCase()] || code;
}
const CUPOM_UNIFICADO = new Set(Object.values(ALIAS_CUPOM));

function comClasse(lista, plataforma) {
  return (lista || []).map(c => {
    const original = String(c.cupom || '').trim().toUpperCase();
    const code = nomeCupom(c.cupom);
    const { origem, canal, promoter, grupo, gestao } = classifyCupom(code);
    return { cupom: code, promoter: promoter || code, nomes: [`${original} (${plataforma === 'UTICKET' ? 'Uticket' : 'Sympla'})`], plataforma, origem, canal, grupo, gestao, total: Number(c.total) || 0, pedidos: Number(c.pedidos) || 0,
             receita: Number(c.receita) || 0, desconto: Number(c.desconto) || 0, ativo: c.ativo !== false };
  });
}

async function consolidateLiveSources(env) {
  const cn = await buscarCuponsNuvem(env);
  const utCupons = comClasse(cn.uticket, 'UTICKET');
  const syCupons = comClasse(cn.sympla, 'SYMPLA');

  const map = new Map();
  for (const c of [...utCupons, ...syCupons]) {
    const unif = CUPOM_UNIFICADO.has(c.cupom.toUpperCase());
    const k = unif ? `${c.cupom.toUpperCase()}|*` : `${c.cupom}|${c.plataforma}`;
    if (!map.has(k)) {
      map.set(k, { ...c, plataformas: [c.plataforma], nomes: [...(c.nomes || [])] });
    } else {
      const ex = map.get(k);
      if (!ex.plataformas.includes(c.plataforma)) { ex.plataformas.push(c.plataforma); ex.plataforma = 'AMBAS'; }
      for (const n of c.nomes || []) if (!ex.nomes.includes(n)) ex.nomes.push(n);
      ex.total += c.total;
      ex.pedidos += c.pedidos;
      ex.receita += c.receita;
    }
  }

  const combined = Array.from(map.values()).sort((a, b) => b.total - a.total);

  // Recompensas Uticket
  for (const c of combined) {
    if (c.plataforma === 'UTICKET' && c.origem === 'PROMOTER') {
      const tot = c.total || 0;
      c.recompensa_10 = {
        meta: 10,
        ganhos: Math.floor(tot / 10),
        ciclo: tot % 10,
        falta: 10 - (tot % 10)
      };
    }
    if (c.cupom.toUpperCase().includes('BDAY')) {
      const tot = c.total || 0;
      c.bday_meta = {
        meta: 2,
        vendidos: tot,
        faltam: Math.max(0, 2 - tot),
        liberado: tot >= 2,
        status: tot >= 2 ? 'LIBERADO' : 'PENDENTE'
      };
    }
  }

  const startCoupons = combined.filter(c => c.origem === 'START_INC');
  const bdayCoupons = combined.filter(c => c.cupom.toUpperCase().includes('BDAY'));
  const promCoupons = combined.filter(c => c.origem === 'PROMOTER');
  const antCoupons = combined.filter(c => c.origem === 'ANTIGA_GESTAO');
  const parCoupons = combined.filter(c => c.origem === 'PARCERIA');

  const utProms = combined.filter(c => c.plataforma === 'UTICKET' && c.origem === 'PROMOTER' && c.recompensa_10?.ganhos > 0);
  const totGanhos = utProms.reduce((acc, c) => acc + (c.recompensa_10?.ganhos || 0), 0);

  const soma = (lst) => ({
    ingressos: lst.reduce((a, c) => a + c.total, 0),
    receita: lst.reduce((a, c) => a + c.receita, 0),
    pedidos: lst.reduce((a, c) => a + c.pedidos, 0)
  });
  const porCupom = (lst) => {
    const m = new Map();
    for (const c of lst) {
      const k = c.cupom.toUpperCase();
      const r = m.get(k) || { cupom: k, canal: c.canal, gestao: c.gestao, rotulo: (MAPA_ANALISE[semAcento(k)] || analisePorRegra(semAcento(k)) || {}).rotulo || c.canal, ingressos: 0, receita: 0, pedidos: 0, plataformas: [] };
      r.ingressos += c.total; r.receita += c.receita; r.pedidos += c.pedidos;
      if (!r.plataformas.includes(c.plataforma)) r.plataformas.push(c.plataforma);
      m.set(k, r);
    }
    // cupons do mapa que ainda não venderam aparecem zerados
    return Array.from(m.values());
  };
  const canaisAnalise = {};
  for (const g of ['ADS', 'WHATSAPP', 'ORGANICO', 'INTERNA', 'FRAN', 'ATENDIMENTO', 'DESCONHECIDO']) {
    const lst = combined.filter(c => c.grupo === g);
    const cps = porCupom(lst);
    for (const [k, v] of Object.entries(MAPA_ANALISE)) {
      if (v.grupo === g && !cps.some(x => semAcento(x.cupom) === k)) cps.push({ cupom: k, canal: v.canal, gestao: v.gestao || null, rotulo: v.rotulo, ingressos: 0, receita: 0, pedidos: 0, plataformas: [] });
    }
    canaisAnalise[g.toLowerCase()] = { ...soma(lst), cupons: cps.sort((a, b) => b.ingressos - a.ingressos) };
  }
  canaisAnalise.ads.gestao_nova = soma(combined.filter(c => c.gestao === 'NOVA'));
  canaisAnalise.ads.gestao_antiga = soma(combined.filter(c => c.gestao === 'ANTIGA'));

  return {
    cupons: combined,
    canais_analise: canaisAnalise,
    start_inc: {
      ingressos: startCoupons.reduce((a, c) => a + c.total, 0),
      receita: startCoupons.reduce((a, c) => a + c.receita, 0),
      pedidos: startCoupons.reduce((a, c) => a + c.pedidos, 0),
      cupons_count: startCoupons.length,
      campanhas: startCoupons
    },
    outras_acoes: {
      promoters: {
        ingressos: promCoupons.reduce((a, c) => a + c.total, 0),
        receita: promCoupons.reduce((a, c) => a + c.receita, 0),
        cupons_count: promCoupons.length
      },
      antiga_gestao: {
        ingressos: antCoupons.reduce((a, c) => a + c.total, 0),
        receita: antCoupons.reduce((a, c) => a + c.receita, 0),
        cupons_count: antCoupons.length
      },
      comunidade: {
        ingressos: 0,
        receita: 0,
        cupons_count: 0
      },
      aniversariantes: {
        ingressos: bdayCoupons.reduce((a, c) => a + c.total, 0),
        receita: bdayCoupons.reduce((a, c) => a + c.receita, 0),
        cupons_count: bdayCoupons.length,
        liberados: bdayCoupons.filter(c => c.total >= 2).length,
        pendentes: bdayCoupons.filter(c => c.total < 2).length
      },
      parcerias: {
        ingressos: parCoupons.reduce((a, c) => a + c.total, 0),
        receita: parCoupons.reduce((a, c) => a + c.receita, 0),
        cupons_count: parCoupons.length
      },
      uticket_recompensas: {
        total_ingressos_ganhos: totGanhos,
        promoters_premiados: utProms.length
      }
    }
  };
}

function normalizarLotes(listaLotes) {
  if (!Array.isArray(listaLotes)) return [];
  const SET = {
    FULLPASS: { nome: 'Full Pass' },
    ZONE: { nome: 'Zone' },
    GOLD: { nome: 'Gold' },
    BLACK: { nome: 'Black' }
  };
  const mapa = {};
  for (const item of listaLotes) {
    const raw = String(item.lote || '').trim().toUpperCase();
    let setor = String(item.setor || '').trim().toUpperCase();
    const total = Number(item.total) || 0;

    if (!setor) {
      if (raw.includes('FULLPASS') || raw.includes('FULL PASS')) setor = 'FULLPASS';
      else if (raw.includes('ZONE')) setor = 'ZONE';
      else if (raw.includes('GOLD')) setor = 'GOLD';
      else if (raw.includes('BLACK')) setor = 'BLACK';
      else setor = 'FULLPASS';
    }

    const setorNome = (SET[setor] || { nome: setor }).nome || setor;
    let nomeLote = '';

    // 1. Convocação (L1, L2, Extra, etc.)
    if (raw.includes('CONVOCA') || raw.includes('CONVOCACAO')) {
      nomeLote = `${setorNome.toUpperCase()} — CONVOCAÇÃO`;
    }
    // 2. Lote 2 / Segundo Lote
    else if (raw.includes('2º') || raw.includes('2ª') || raw.includes('2 LOTE') || raw.includes('LOTE 2') || raw.includes('SEGUNDO LOTE')) {
      nomeLote = `${setorNome.toUpperCase()} — 2º LOTE`;
    }
    // 3. Lote 3 / Terceiro Lote
    else if (raw.includes('3º') || raw.includes('3ª') || raw.includes('3 LOTE') || raw.includes('LOTE 3') || raw.includes('TERCEIRO LOTE')) {
      nomeLote = `${setorNome.toUpperCase()} — 3º LOTE`;
    }
    // 4. Lote 1 / Primeiro Lote
    else if (raw.includes('1º') || raw.includes('1ª') || raw.includes('1 LOTE') || raw.includes('LOTE 1') || raw.includes('PRIMEIRO LOTE')) {
      nomeLote = `${setorNome.toUpperCase()} — 1º LOTE`;
    }
    // 5. Lote Wix
    else if (raw.includes('WIX')) {
      nomeLote = `${setorNome.toUpperCase()} — LOTE WIX`;
    }
    // 6. Outros
    else {
      nomeLote = raw;
    }

    const chave = `${setor}|${nomeLote}`;
    if (!mapa[chave]) {
      mapa[chave] = { lote: nomeLote, setor, total: 0 };
    }
    mapa[chave].total += total;
  }

  return Object.values(mapa).sort((a, b) => b.total - a.total);
}

async function getFullResumo(env, supabaseUrl, supabaseAnon) {
  const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/moving_excluir_resumo`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnon,
      'Authorization': `Bearer ${supabaseAnon}`,
      'Content-Type': 'application/json'
    },
    body: '{}'
  });

  let data = rpcRes.ok ? await rpcRes.json() : {};

  // Lotes consolidados e normalizados (Convocação unificada, Lote 2/2º Lote unificado)
  if (data.lotes) {
    data.lotes = normalizarLotes(data.lotes);
  }

  // Vendas diárias já vêm calculadas com fuso de Brasília pelo RPC moving_excluir_resumo.
  // Somente faz fallback se o RPC vier vazio:
  if (!data.vendas_diarias || !data.vendas_diarias.length) {
    const diarioRes = await fetch(`${supabaseUrl}/rest/v1/moving_excluir_vendas?select=data_compra,plataforma,setor,tipo,valor&status=eq.CONFIRMADO&data_compra=not.is.null&order=data_compra.desc&limit=1000`, {
      headers: {
        'apikey': supabaseAnon,
        'Authorization': `Bearer ${supabaseAnon}`
      }
    });

    if (diarioRes.ok) {
      const vendas = await diarioRes.json();
      const aggr = {};
      for (const v of vendas) {
        if (!v.data_compra) continue;
        let dia;
        try {
          const dt = new Date(v.data_compra);
          dia = new Intl.DateTimeFormat('fr-CA', { timeZone: 'America/Sao_Paulo' }).format(dt);
        } catch (e) {
          dia = v.data_compra.slice(0, 10);
        }
        const plat = v.plataforma || 'OUTROS';
        const tipo = v.tipo || 'INGRESSO';
        const setor = v.setor || tipo;
        const key = `${dia}|${plat}|${setor}`;
        if (!aggr[key]) aggr[key] = { dia, plataforma: plat, setor, tipo, total: 0, pagos: 0, receita: 0 };
        aggr[key].total += 1;
        if ((Number(v.valor) || 0) > 0) aggr[key].pagos += 1;
        aggr[key].receita += (Number(v.valor) || 0);
      }
      data.vendas_diarias = Object.values(aggr).sort((a, b) => a.dia.localeCompare(b.dia));
    }
  }

  // Puxar consolidado de cupons e ações ao vivo na nuvem
  const live = await consolidateLiveSources(env);
  data.cupons = live.cupons;
  data.start_inc = live.start_inc;
  data.outras_acoes = live.outras_acoes;
  data.atualizado_em = new Date().toISOString();

  return data;
}

// ==============================================================================
// AUTH HELPERS (Supabase RPCs com prefixo moving_excluir_)
// ==============================================================================
async function chamarRpc(supabaseUrl, supabaseAnon, rpcName, params = {}) {
  const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${rpcName}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseAnon,
      'Authorization': `Bearer ${supabaseAnon}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(params)
  });
  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, erro: `Falha na API (${res.status}): ${errText}` };
  }
  return await res.json();
}

function extrairToken(request) {
  const headerToken = request.headers.get('X-Moving-Token');
  if (headerToken) return headerToken.trim();
  const auth = request.headers.get('Authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7).trim();
  }
  return null;
}

// LOGIN_PENDENTE: enquanto as tabelas/funções de login não existirem no Supabase, o painel abre em "acesso livre"
// (como era antes do login). Assim que o migration_auth.sql for aplicado, o login passa a ser exigido sozinho.
const USUARIO_LIVRE = { id: null, login: 'acesso-livre', nome: 'Acesso livre (login ainda não ativado)', papel: 'admin',
  telas: ['overview', 'diario', 'plataformas', 'promoters', 'ingressos', 'tendencias', 'conferencia'], modo_livre: true };
let cacheAuthAtivo = { valor: null, em: 0 };
async function loginAtivo(supabaseUrl, supabaseAnon) {
  if (cacheAuthAtivo.valor !== null && Date.now() - cacheAuthAtivo.em < 60000) return cacheAuthAtivo.valor;
  let ativo = true;
  try {
    const r = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_me', { p_token: 'verificacao' });
    if (r && r.ok === false && typeof r.erro === 'string' && /PGRST202|Could not find the function|\(404\)/.test(r.erro)) ativo = false;
  } catch (e) { ativo = true; }
  cacheAuthAtivo = { valor: ativo, em: Date.now() };
  return ativo;
}

async function autenticarUsuario(request, supabaseUrl, supabaseAnon) {
  if (!(await loginAtivo(supabaseUrl, supabaseAnon))) return { token: null, usuario: USUARIO_LIVRE };
  const token = extrairToken(request);
  if (!token) return null;
  try {
    const meRes = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_me', { p_token: token });
    if (meRes && meRes.ok && meRes.usuario) {
      return { token, usuario: meRes.usuario };
    }
  } catch (err) {
    console.error('[Auth] Erro ao validar token:', err);
  }
  return null;
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Moving-Token'
  };
}

export default {
  // Disparo Agendado (Cron Trigger na Cloudflare a cada 15 min 24/7)
  async scheduled(event, env, ctx) {
    console.log(`[Cloudflare Cron] Disparando sync periódico 15min às ${new Date().toISOString()}`);
    ctx.waitUntil(chamarSyncNuvem(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const supabaseUrl = env?.SUPABASE_URL || SUPABASE_DEFAULT_URL;
    const supabaseAnon = env?.SUPABASE_ANON_KEY || SUPABASE_DEFAULT_ANON;

    // Resposta para pré-voo CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // ============================================================================
    // ROTAS DE AUTENTICAÇÃO E CONTROLE DE ACESSO
    // ============================================================================

    // 1. POST /api/login
    if (url.pathname === '/api/login' && request.method === 'POST') {
      try {
        const body = await request.json().catch(() => ({}));
        const login = String(body.login || '').trim();
        const senha = String(body.senha || '').trim();
        const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_login', { p_login: login, p_senha: senha });
        if (!res.ok && res.erro && (res.erro.includes('PGRST202') || res.erro.includes('moving_excluir_login'))) {
          return new Response(JSON.stringify({
            ok: false,
            erro: 'Banco de dados pendente: execute o script migration_auth.sql no SQL Editor do Supabase para ativar o login.'
          }), { status: 503, headers: corsHeaders() });
        }
        const status = res.ok ? 200 : 401;
        return new Response(JSON.stringify(res), { status, headers: corsHeaders() });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, erro: String(err) }), { status: 500, headers: corsHeaders() });
      }
    }

    // LOGIN_CODIGO: entrar com código por e-mail / esqueci a senha
    if (url.pathname === '/api/login/codigo' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_codigo_enviar', { p_email: String(body.email || '').slice(0, 120) });
      if (res && res.ok === false && /PGRST202|Could not find the function|\(404\)/.test(String(res.erro || ''))) {
        return new Response(JSON.stringify({ ok: false, erro: 'O login por código ainda não foi ativado. Rode o migration_codigo_email.sql no Supabase.' }), { status: 503, headers: corsHeaders() });
      }
      return new Response(JSON.stringify(res), { status: res && res.ok ? 200 : 400, headers: corsHeaders() });
    }
    if (url.pathname === '/api/login/codigo/entrar' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_codigo_entrar', { p_email: String(body.email || '').slice(0, 120), p_codigo: String(body.codigo || '').slice(0, 12) });
      return new Response(JSON.stringify(res), { status: res && res.ok ? 200 : 401, headers: corsHeaders() });
    }
    if (url.pathname === '/api/senha/redefinir' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_senha_redefinir', { p_token: extrairToken(request) || '', p_nova: String(body.nova || '') });
      return new Response(JSON.stringify(res), { status: res && res.ok ? 200 : 400, headers: corsHeaders() });
    }

    // 2. GET /api/me
    if (url.pathname === '/api/me' && request.method === 'GET') {
      const auth = await autenticarUsuario(request, supabaseUrl, supabaseAnon);
      if (!auth) {
        return new Response(JSON.stringify({ ok: false, erro: 'Não autenticado ou sessão expirada' }), { status: 401, headers: corsHeaders() });
      }
      return new Response(JSON.stringify({ ok: true, usuario: auth.usuario }), { status: 200, headers: corsHeaders() });
    }

    // 3. POST /api/logout
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      const token = extrairToken(request);
      if (token) {
        await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_logout', { p_token: token }).catch(() => null);
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: corsHeaders() });
    }

    // 4. POST /api/senha (Alterar minha senha)
    if (url.pathname === '/api/senha' && request.method === 'POST') {
      const auth = await autenticarUsuario(request, supabaseUrl, supabaseAnon);
      if (!auth) {
        return new Response(JSON.stringify({ ok: false, erro: 'Não autenticado' }), { status: 401, headers: corsHeaders() });
      }
      try {
        const body = await request.json().catch(() => ({}));
        const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_senha_trocar', {
          p_token: auth.token,
          p_atual: String(body.atual || ''),
          p_nova: String(body.nova || '')
        });
        const status = res.ok ? 200 : 400;
        return new Response(JSON.stringify(res), { status, headers: corsHeaders() });
      } catch (err) {
        return new Response(JSON.stringify({ ok: false, erro: String(err) }), { status: 500, headers: corsHeaders() });
      }
    }

    // 5. GESTÃO DE USUÁRIOS (Apenas Superadmin)
    if (url.pathname === '/api/usuarios') {
      const auth = await autenticarUsuario(request, supabaseUrl, supabaseAnon);
      if (!auth) {
        return new Response(JSON.stringify({ ok: false, erro: 'Não autenticado' }), { status: 401, headers: corsHeaders() });
      }
      if (auth.usuario.papel !== 'superadmin') {
        return new Response(JSON.stringify({ ok: false, erro: 'Acesso negado: apenas superadmin pode gerenciar usuários' }), { status: 403, headers: corsHeaders() });
      }

      // 5.1 GET /api/usuarios
      if (request.method === 'GET') {
        const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_usuarios_listar', { p_token: auth.token });
        const status = res.ok ? 200 : 400;
        return new Response(JSON.stringify(res), { status, headers: corsHeaders() });
      }

      // 5.2 POST /api/usuarios (Salvar / Editar)
      if (request.method === 'POST') {
        try {
          const body = await request.json().catch(() => ({}));
          const rawId = body.id ? String(body.id).trim() : null;
          const id = (rawId && rawId !== 'null' && rawId !== 'undefined' && rawId !== 'NaN') ? rawId : null;
          const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_usuario_salvar', {
            p_token: auth.token,
            p_id: id,
            p_login: String(body.login || '').trim().toLowerCase(),
            p_nome: String(body.nome || '').trim(),
            p_senha: body.senha ? String(body.senha).trim() : '',
            p_papel: String(body.papel || 'usuario').toLowerCase(),
            p_telas: Array.isArray(body.telas) ? body.telas : [],
            p_ativo: body.ativo !== false
          });
          const status = res.ok ? 200 : 400;
          return new Response(JSON.stringify(res), { status, headers: corsHeaders() });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, erro: String(err) }), { status: 500, headers: corsHeaders() });
        }
      }

      // 5.3 DELETE /api/usuarios
      if (request.method === 'DELETE') {
        try {
          let id = url.searchParams.get('id');
          if (!id) {
            const body = await request.json().catch(() => ({}));
            id = body.id;
          }
          if (id) {
            id = String(id).trim();
            if (id === 'None' || id === 'null' || id === 'undefined' || id === 'NaN' || id === '') id = null;
          }
          if (!id) {
            return new Response(JSON.stringify({ ok: false, erro: 'ID do usuário não fornecido ou inválido' }), { status: 400, headers: corsHeaders() });
          }
          const res = await chamarRpc(supabaseUrl, supabaseAnon, 'moving_excluir_usuario_excluir', {
            p_token: auth.token,
            p_id: id
          });
          const status = res.ok ? 200 : 400;
          return new Response(JSON.stringify(res), { status, headers: corsHeaders() });
        } catch (err) {
          return new Response(JSON.stringify({ ok: false, erro: String(err) }), { status: 500, headers: corsHeaders() });
        }
      }
    }

    // IA: segunda opinião sobre os números (Gemini ou Claude). Recebe só texto com números agregados, sem dados pessoais.
    if (url.pathname === '/api/ia') {
      const jh = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      if (request.method !== 'POST') return new Response(JSON.stringify({ erro: 'Use POST' }), { status: 405, headers: jh });
      const authIa = await autenticarUsuario(request, supabaseUrl, supabaseAnon);
      if (!authIa) return new Response(JSON.stringify({ erro: 'Faça login para usar a análise com IA.' }), { status: 401, headers: jh });
      const corpo = await request.json().catch(() => ({}));
      const contexto = String(corpo.contexto || '').slice(0, 15000);
      const foco = String(corpo.foco || 'geral').slice(0, 40);
      if (contexto.length < 40) return new Response(JSON.stringify({ erro: 'Sem dados para analisar' }), { status: 400, headers: jh });
      const sistema = 'Você é um analista financeiro e de vendas de festivais de música no Brasil (Moving Festival 2026, 17 e 18/10). ' +
        'Responda em português do Brasil, direto, em tópicos curtos, no máximo 220 palavras. Estrutura: "O que chama atenção" (3 a 5 itens com números), ' +
        '"Riscos" (até 3) e "O que fazer agora" (até 4 ações práticas). Use só os números fornecidos; se faltar dado, diga o que falta. Não invente valores. Foco: ' + foco + '.';
      try {
        let texto = '';
        if (env.GEMINI_API_KEY) {
          const modelo = env.GEMINI_MODEL || 'gemini-2.5-flash';
          const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
            body: JSON.stringify({ systemInstruction: { parts: [{ text: sistema }] }, contents: [{ role: 'user', parts: [{ text: contexto }] }], generationConfig: { temperature: 0.3, maxOutputTokens: 900 } })
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return new Response(JSON.stringify({ erro: 'Gemini: ' + (j.error && j.error.message || r.status) }), { status: 502, headers: jh });
          texto = ((j.candidates || [])[0] || {}).content ? j.candidates[0].content.parts.map((p) => p.text || '').join('') : '';
        } else if (env.ANTHROPIC_API_KEY) {
          const r = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: env.CLAUDE_MODEL || 'claude-sonnet-5-5', max_tokens: 900, system: sistema, messages: [{ role: 'user', content: contexto }] })
          });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) return new Response(JSON.stringify({ erro: 'Claude: ' + (j.error && j.error.message || r.status) }), { status: 502, headers: jh });
          texto = (j.content || []).map((c) => c.text || '').join('');
        } else {
          return new Response(JSON.stringify({ erro: 'A análise com IA ainda não está ligada. Falta cadastrar na Cloudflare o segredo GEMINI_API_KEY (ou ANTHROPIC_API_KEY).', configurar: true }), { status: 501, headers: jh });
        }
        return new Response(JSON.stringify({ texto: texto || 'A IA não devolveu texto.' }), { headers: jh });
      } catch (err) {
        return new Response(JSON.stringify({ erro: String(err) }), { status: 500, headers: jh });
      }
    }

    // CONFERENCIA: lista do banco (só hash do código, sem dados pessoais) para cruzar com planilha importada
    if (url.pathname === '/api/conferencia') {
      const jh = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      const plataforma = (url.searchParams.get('plataforma') || '').toUpperCase();
      try {
        const r = await fetch(`${supabaseUrl}/rest/v1/rpc/moving_excluir_conferencia`, {
          method: 'POST',
          headers: { 'apikey': supabaseAnon, 'Authorization': `Bearer ${supabaseAnon}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_plataforma: plataforma, p_token: request.headers.get('X-Moving-Token') || null })
        });
        const t = await r.text();
        let st = r.ok ? 200 : 502;
        try { if (JSON.parse(t).erro) st = 400; } catch (e) {}
        return new Response(t, { status: st, headers: jh });
      } catch (err) {
        return new Response(JSON.stringify({ erro: String(err) }), { status: 500, headers: jh });
      }
    }

    // ============================================================================
    // ESTIMATIVAS: premissas da projeção de faturamento (estacionamento e bar)
    // ============================================================================
    if (url.pathname === '/api/estimativas') {
      const jh = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
      const rpc = (nome, corpo) => fetch(`${supabaseUrl}/rest/v1/rpc/${nome}`, {
        method: 'POST',
        headers: { 'apikey': supabaseAnon, 'Authorization': `Bearer ${supabaseAnon}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo || {})
      });
      try {
        if (request.method === 'GET') {
          const r = await rpc('moving_excluir_estimativas_ler');
          return new Response(await r.text(), { status: r.ok ? 200 : 502, headers: jh });
        }
        if (request.method === 'POST') {
          const corpo = await request.json().catch(() => ({}));
          const r = Array.isArray(corpo.repasses) ? await rpc('moving_excluir_estimativas_repasses_salvar', {
            p_repasses: corpo.repasses,
            p_quem: String(corpo.quem || '').slice(0, 60) || null,
            p_token: request.headers.get('X-Moving-Token') || null
          }) : await rpc('moving_excluir_estimativas_salvar', {
            p_dados: corpo.dados || {},
            p_quem: String(corpo.quem || '').slice(0, 60) || null,
            p_token: request.headers.get('X-Moving-Token') || null
          });
          const t = await r.text();
          let st = r.ok ? 200 : 502;
          try { if (JSON.parse(t).erro) st = 400; } catch (e) {}
          return new Response(t, { status: st, headers: jh });
        }
        return new Response(JSON.stringify({ erro: 'Método não permitido' }), { status: 405, headers: jh });
      } catch (err) {
        return new Response(JSON.stringify({ erro: String(err) }), { status: 500, headers: jh });
      }
    }

    // ============================================================================
    // ROTAS DE DADOS PROTEGIDAS POR X-Moving-Token
    // ============================================================================

    // 6. Rota POST /api/sync (Disparo manual protegido - Admin ou Superadmin)
    if (url.pathname === '/api/sync') {
      const auth = await autenticarUsuario(request, supabaseUrl, supabaseAnon);
      if (!auth) {
        return new Response(JSON.stringify({ status: 'ERRO', erro: 'Não autorizado. Faça login.' }), { status: 401, headers: corsHeaders() });
      }
      if (auth.usuario.papel !== 'admin' && auth.usuario.papel !== 'superadmin') {
        return new Response(JSON.stringify({ status: 'ERRO', erro: 'Acesso negado: apenas administradores podem sincronizar.' }), { status: 403, headers: corsHeaders() });
      }

      try {
        const sync = await chamarSyncNuvem(env);
        const resumoData = await getFullResumo(env, supabaseUrl, supabaseAnon);
        return new Response(JSON.stringify({
          status: sync.status === 'OK' ? 'OK' : 'ERRO',
          erro: sync.erro || null,
          fontes: sync.fontes || null,
          pulou: sync.pulou || null,
          resumo: resumoData
        }), { headers: corsHeaders() });
      } catch (err) {
        return new Response(JSON.stringify({ status: 'ERRO', erro: String(err) }), { status: 500, headers: corsHeaders() });
      }
    }

    // 7. Endpoint /api/resumo (Protegido por login)
    if (url.pathname === '/api/resumo') {
      const auth = await autenticarUsuario(request, supabaseUrl, supabaseAnon);
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Não autorizado. Faça login para acessar o painel.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
      }

      try {
        const data = await getFullResumo(env, supabaseUrl, supabaseAnon);
        const headers = corsHeaders();
        headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
        return new Response(JSON.stringify(data), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders() });
      }
    }

    // 8. Endpoint /api/vendas_diarias (Protegido por login)
    if (url.pathname === '/api/vendas_diarias') {
      const auth = await autenticarUsuario(request, supabaseUrl, supabaseAnon);
      if (!auth) {
        return new Response(JSON.stringify({ error: 'Não autorizado. Faça login para acessar os dados.' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
      }

      try {
        const full = await getFullResumo(env, supabaseUrl, supabaseAnon);
        const headers = corsHeaders();
        headers['Cache-Control'] = 'no-store, no-cache, must-revalidate';
        return new Response(JSON.stringify({ vendas_diarias: full.vendas_diarias || [] }), { headers });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), { status: 500, headers: corsHeaders() });
      }
    }

    // 9. Arquivos estáticos (index.html, etc)
    if (env && env.ASSETS) {
      const assetRes = await env.ASSETS.fetch(request);
      if (url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '') {
        const h = new Headers(assetRes.headers);
        h.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        h.set('Pragma', 'no-cache');
        h.set('Expires', '0');
        return new Response(assetRes.body, {
          status: assetRes.status,
          statusText: assetRes.statusText,
          headers: h
        });
      }
      return assetRes;
    }

    return new Response('Not found', { status: 404 });
  }
};

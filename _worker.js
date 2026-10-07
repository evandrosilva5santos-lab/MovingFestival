/**
 * Cloudflare Worker — Moving Festival 2026
 * Motor de API, Sincronização Serverless e Cron Trigger de 15 minutos na nuvem.
 */

const SUPABASE_DEFAULT_URL = 'https://etjqbqorawnnvdlmztka.supabase.co';
const SUPABASE_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0anFicW9yYXdubnZkbG16dGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMDQ3MzYsImV4cCI6MjA4ODY4MDczNn0.LuLbWvZEt90ha53_36LgWQ_9tXY4tm0Fd03Q5lIruz0';

function classifyCupom(cupomRaw) {
  if (!cupomRaw) return { origem: 'OUTROS', canal: 'OUTROS' };
  const u = String(cupomRaw).toUpperCase().trim();

  let origem = 'PROMOTER';
  if (u.includes('START')) origem = 'START_INC';
  else if (u.includes('BDAY')) origem = 'ANIVERSARIANTE';
  else if (u.includes('MANIACO')) origem = 'ANTIGA_GESTAO';
  else if (['FESTASRS', 'TRIPTRANCE', 'KIOMA', 'GUTO'].some(k => u.includes(k))) origem = 'PARCERIA';

  let canal = 'PROMOTER';
  if (u.includes('STARTGRUPON')) canal = 'GRUPO_VIP_NOTURNO';
  else if (u.includes('STARTGRUPOA')) canal = 'GRUPO_VIP_ANTIGOS';
  else if (u.includes('STARTADS')) canal = 'META_ADS';
  else if (u.includes('STARTEMAIL')) canal = 'EMAIL_MARKETING';
  else if (u.includes('STARTELEICAO')) canal = 'CAMPANHA_ELEICAO';
  else if (u.includes('STARTBLACK')) canal = 'CAMPANHA_BLACK';
  else if (u.includes('STARTCASAMENTO')) canal = 'CAMPANHA_CASAMENTO';
  else if (u.includes('START')) canal = 'START_OUTROS';
  else if (u.includes('MANIACO')) canal = 'ANTIGO_MKT';
  else if (origem === 'ANTIGA_GESTAO') canal = 'ANTIGO_MKT';
  else if (origem === 'ANIVERSARIANTE') canal = 'ANIVERSARIANTE';
  else if (origem === 'PARCERIA') canal = 'PARCERIA';

  return { origem, canal };
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

function comClasse(lista, plataforma) {
  return (lista || []).map(c => {
    const code = String(c.cupom || '').trim();
    const { origem, canal } = classifyCupom(code);
    return { cupom: code, plataforma, origem, canal, total: Number(c.total) || 0, pedidos: Number(c.pedidos) || 0,
             receita: Number(c.receita) || 0, desconto: Number(c.desconto) || 0, ativo: c.ativo !== false };
  });
}

async function consolidateLiveSources(env) {
  const cn = await buscarCuponsNuvem(env);
  const utCupons = comClasse(cn.uticket, 'UTICKET');
  const syCupons = comClasse(cn.sympla, 'SYMPLA');

  const map = new Map();
  for (const c of [...utCupons, ...syCupons]) {
    const k = `${c.cupom}|${c.plataforma}`;
    if (!map.has(k)) {
      map.set(k, { ...c });
    } else {
      const ex = map.get(k);
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

  return {
    cupons: combined,
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
        const setor = v.setor || (v.tipo === 'CAMPING' ? 'CAMPING' : 'OUTROS');
        const key = `${dia}|${plat}|${setor}`;
        if (!aggr[key]) aggr[key] = { dia, plataforma: plat, setor, total: 0, receita: 0 };
        aggr[key].total += 1;
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

    // Rota POST /api/sync (Disparo manual na nuvem)
    if (url.pathname === '/api/sync') {
      try {
        const sync = await chamarSyncNuvem(env);
        const resumoData = await getFullResumo(env, supabaseUrl, supabaseAnon);
        return new Response(JSON.stringify({
          status: sync.status === 'OK' ? 'OK' : 'ERRO',
          erro: sync.erro || null,
          fontes: sync.fontes || null,
          pulou: sync.pulou || null,
          resumo: resumoData
        }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ status: 'ERRO', erro: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 1. Endpoint /api/resumo
    if (url.pathname === '/api/resumo') {
      try {
        const data = await getFullResumo(env, supabaseUrl, supabaseAnon);
        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // 2. Endpoint /api/vendas_diarias
    if (url.pathname === '/api/vendas_diarias') {
      try {
        const full = await getFullResumo(env, supabaseUrl, supabaseAnon);
        return new Response(JSON.stringify({ vendas_diarias: full.vendas_diarias || [] }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-store'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: String(err) }), {
          status: 500,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          }
        });
      }
    }

    // 3. Arquivos estáticos (index.html, etc)
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

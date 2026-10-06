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

async function fetchUticketCouponsLive(env) {
  try {
    const email = env?.UTICKET_EMAIL || 'REMOVIDO';
    const password = env?.UTICKET_SENHA || 'REMOVIDO';
    const eventId = env?.UTICKET_EVENT_ID || '01M5QB24FA2PLL';

    // 1. Signin
    const signinRes = await fetch('https://auth.uticket.com.br/signin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Origin': 'https://uticket.com.br',
        'Referer': 'https://uticket.com.br/'
      },
      body: JSON.stringify({ email, password })
    });

    if (!signinRes.ok) return [];
    const signinData = await signinRes.json();
    const token = signinData?.token;
    if (!token) return [];

    // 2. Fetch coupons
    const authBasic = btoa(`${email}:${token}`);
    const coupRes = await fetch(`https://api.uticket.com.br/event/${eventId}/coupons`, {
      headers: {
        'Authorization': `Basic ${authBasic}`,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        'Origin': 'https://uticket.com.br',
        'Referer': `https://uticket.com.br/admin/event/${eventId}/coupons`
      }
    });

    if (!coupRes.ok) return [];
    const data = await coupRes.json();
    const eventCoupons = data?.eventCoupons || [];

    return eventCoupons.map(c => {
      const code = c.code || '';
      const { origem, canal } = classifyCupom(code);
      const usage = Number(c.usageCount) || Number(c.usage_count) || 0;
      const val = Number(c.totalValue) || Number(c.total_amount) || (usage * 182.68);
      return {
        cupom: code,
        plataforma: 'UTICKET',
        origem,
        canal,
        total: usage,
        pedidos: usage,
        receita: val
      };
    });
  } catch (err) {
    console.error('Erro fetchUticketCouponsLive:', err);
    return [];
  }
}

async function fetchSymplaCouponsLive(env) {
  try {
    const token = env?.SYMPLA_API_TOKEN || 'REMOVIDO';
    const eventId = env?.SYMPLA_EVENT_ID || '3419289';

    const res = await fetch(`https://api.sympla.com.br/public/v3/events/${eventId}/coupons?page=1`, {
      headers: {
        's_token': token,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)'
      }
    });

    if (!res.ok) return [];
    const json = await res.json();
    const data = json?.data || [];

    return data.map(c => {
      const code = c.code || '';
      const { origem, canal } = classifyCupom(code);
      const usage = Number(c.total_usage) || 0;
      const val = Number(c.total_amount) || (usage * 115.42);
      return {
        cupom: code,
        plataforma: 'SYMPLA',
        origem,
        canal,
        total: usage,
        pedidos: usage,
        receita: val
      };
    });
  } catch (err) {
    console.error('Erro fetchSymplaCouponsLive:', err);
    return [];
  }
}

async function consolidateLiveSources(env) {
  const [utCupons, syCupons] = await Promise.all([
    fetchUticketCouponsLive(env),
    fetchSymplaCouponsLive(env)
  ]);

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

export default {
  // Disparo Agendado (Cron Trigger na Cloudflare a cada 15 min 24/7)
  async scheduled(event, env, ctx) {
    console.log(`[Cloudflare Cron] Disparando sync periódico 15min às ${new Date().toISOString()}`);
    ctx.waitUntil(consolidateLiveSources(env));
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const supabaseUrl = env?.SUPABASE_URL || SUPABASE_DEFAULT_URL;
    const supabaseAnon = env?.SUPABASE_ANON_KEY || SUPABASE_DEFAULT_ANON;

    // Rota POST /api/sync (Disparo manual na nuvem)
    if (url.pathname === '/api/sync') {
      try {
        const live = await consolidateLiveSources(env);
        return new Response(JSON.stringify({
          status: 'ok',
          origem: 'cloudflare_cloud_worker',
          timestamp: new Date().toISOString(),
          cupons_count: live.cupons.length,
          start_inc_ingressos: live.start_inc.ingressos,
          antiga_gestao_ingressos: live.outras_acoes.antiga_gestao.ingressos
        }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ status: 'error', error: String(err) }), {
          status: 500,
          headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    // 1. Endpoint /api/resumo
    if (url.pathname === '/api/resumo') {
      try {
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

        // Buscar dados de vendas diárias
        const diarioRes = await fetch(`${supabaseUrl}/rest/v1/moving_excluir_vendas?select=data_compra,plataforma,setor,tipo,valor&status=eq.CONFIRMADO&limit=10000`, {
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
            const dia = v.data_compra.slice(0, 10);
            const plat = v.plataforma || 'OUTROS';
            const setor = v.setor || (v.tipo === 'CAMPING' ? 'CAMPING' : 'OUTROS');
            const key = `${dia}|${plat}|${setor}`;
            if (!aggr[key]) aggr[key] = { dia, plataforma: plat, setor, total: 0, receita: 0 };
            aggr[key].total += 1;
            aggr[key].receita += (Number(v.valor) || 0);
          }
          data.vendas_diarias = Object.values(aggr).sort((a, b) => a.dia.localeCompare(b.dia));
        }

        // Puxar consolidado de cupons e ações ao vivo na nuvem
        const live = await consolidateLiveSources(env);
        data.cupons = live.cupons;
        data.start_inc = live.start_inc;
        data.outras_acoes = live.outras_acoes;

        return new Response(JSON.stringify(data), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=30, s-maxage=60'
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
        const diarioRes = await fetch(`${supabaseUrl}/rest/v1/moving_excluir_vendas?select=data_compra,plataforma,setor,tipo,valor&status=eq.CONFIRMADO&limit=10000`, {
          headers: {
            'apikey': supabaseAnon,
            'Authorization': `Bearer ${supabaseAnon}`
          }
        });
        const vendas = diarioRes.ok ? await diarioRes.json() : [];
        const aggr = {};
        for (const v of vendas) {
          if (!v.data_compra) continue;
          const dia = v.data_compra.slice(0, 10);
          const plat = v.plataforma || 'OUTROS';
          const setor = v.setor || (v.tipo === 'CAMPING' ? 'CAMPING' : 'OUTROS');
          const key = `${dia}|${plat}|${setor}`;
          if (!aggr[key]) aggr[key] = { dia, plataforma: plat, setor, total: 0, receita: 0 };
          aggr[key].total += 1;
          aggr[key].receita += (Number(v.valor) || 0);
        }
        const vd = Object.values(aggr).sort((a, b) => a.dia.localeCompare(b.dia));
        return new Response(JSON.stringify({ vendas_diarias: vd }), {
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=30, s-maxage=60'
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
      return env.ASSETS.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};

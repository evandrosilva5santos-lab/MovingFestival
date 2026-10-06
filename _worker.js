/**
 * Cloudflare Worker / Pages Functions — Moving Festival 2026
 * Serve o painel estático (index.html) e fornece rotas de API serverless para o Supabase.
 */

const SUPABASE_DEFAULT_URL = 'https://etjqbqorawnnvdlmztka.supabase.co';
const SUPABASE_DEFAULT_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0anFicW9yYXdubnZkbG16dGthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMDQ3MzYsImV4cCI6MjA4ODY4MDczNn0.LuLbWvZEt90ha53_36LgWQ_9tXY4tm0Fd03Q5lIruz0';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const supabaseUrl = env?.SUPABASE_URL || SUPABASE_DEFAULT_URL;
    const supabaseAnon = env?.SUPABASE_ANON_KEY || SUPABASE_DEFAULT_ANON;

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

        if (!rpcRes.ok) {
          throw new Error(`Supabase HTTP ${rpcRes.status}`);
        }

        const data = await rpcRes.json();

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
            if (!aggr[key]) {
              aggr[key] = { dia, plataforma: plat, setor, total: 0, receita: 0 };
            }
            aggr[key].total += 1;
            aggr[key].receita += (Number(v.valor) || 0);
          }
          data.vendas_diarias = Object.values(aggr).sort((a,b) => a.dia.localeCompare(b.dia));
        }

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
        const vd = Object.values(aggr).sort((a,b) => a.dia.localeCompare(b.dia));
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

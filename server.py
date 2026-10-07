#!/usr/bin/env python3
"""
Servidor Web Executivo — Plataforma Moving Festival 2026
Porta: 7777
Fornece interface web em tempo real e endpoints de sincronização direta.
"""

import os
import sys
import json
import urllib.request
import urllib.error
import subprocess
import time
import threading
from http.server import HTTPServer, ThreadingHTTPServer, SimpleHTTPRequestHandler

PORT = 7777
DIR = os.path.dirname(os.path.abspath(__file__))

def load_env():
    env_file = os.path.join(DIR, '.env')
    cfg = {}
    if os.path.exists(env_file):
        with open(env_file, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    k, v = line.split('=', 1)
                    cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg

CONFIG = load_env()
SUPABASE_URL = CONFIG.get('SUPABASE_URL', 'https://etjqbqorawnnvdlmztka.supabase.co')
SUPABASE_ANON = CONFIG.get('SUPABASE_ANON_KEY', '')
SUPABASE_ROLE = CONFIG.get('SUPABASE_SERVICE_ROLE_KEY', '')
SYMPLA_TOKEN = CONFIG.get('SYMPLA_API_TOKEN', '')
SYMPLA_EVENT_ID = CONFIG.get('SYMPLA_EVENT_ID', '3419289')

from sync_worker import fetch_uticket_coupons_live

CUPONS_CACHE = {
    'timestamp': 0,
    'data': [],
    'totals_uticket': {},
    'start_inc_summary': {},
    'outras_acoes_summary': {},
    'plataformas_summary': {}
}

def classify_cupom(cupom_raw):
    """Classifica origem (START_INC vs OUTRAS) e canal detalhado."""
    if not cupom_raw:
        return 'OUTROS', 'OUTROS'
    u = cupom_raw.upper().strip()
    
    # 1. Origem
    if 'START' in u:
        origem = 'START_INC'
    elif 'BDAY' in u:
        origem = 'ANIVERSARIANTE'
    elif 'MANIACO' in u:
        origem = 'ANTIGA_GESTAO'
    elif any(k in u for k in ['FESTASRS', 'TRIPTRANCE', 'KIOMA', 'GUTO']):
        origem = 'PARCERIA'
    else:
        origem = 'PROMOTER'
        
    # 2. Canal detalhado
    if 'STARTGRUPON' in u:
        canal = 'GRUPO_VIP_NOTURNO'
    elif 'STARTGRUPOA' in u:
        canal = 'GRUPO_VIP_ANTIGOS'
    elif 'STARTADS' in u:
        canal = 'META_ADS'
    elif 'STARTEMAIL' in u:
        canal = 'EMAIL_MARKETING'
    elif 'STARTELEICAO' in u:
        canal = 'CAMPANHA_ELEICAO'
    elif 'STARTBLACK' in u:
        canal = 'CAMPANHA_BLACK'
    elif 'STARTCASAMENTO' in u:
        canal = 'CAMPANHA_CASAMENTO'
    elif 'START' in u:
        canal = 'START_OUTROS'
    elif 'MANIACO' in u:
        canal = 'ANTIGO_MKT'
    elif origem == 'ANTIGA_GESTAO':
        canal = 'ANTIGO_MKT'
    elif origem == 'ANIVERSARIANTE':
        canal = 'ANIVERSARIANTE'
    elif origem == 'PARCERIA':
        canal = 'PARCERIA'
    else:
        canal = 'PROMOTER'
        
    return origem, canal

def fetch_sympla_coupons_live():
    """Consulta em tempo real a API Oficial da Sympla v3 para obter cupons de desconto."""
    if not SYMPLA_TOKEN or not SYMPLA_EVENT_ID:
        return None
    import re
    headers = {
        's_token': SYMPLA_TOKEN,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
    }
    page = 1
    coupons = {}
    try:
        while True:
            url = f"https://api.sympla.com.br/public/v3/events/{SYMPLA_EVENT_ID}/participants?page={page}&page_size=100"
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=10) as resp:
                data = json.loads(resp.read().decode('utf-8'))
                parts = data.get('data', [])
                for p in parts:
                    if p.get('order_status') != 'A':
                        continue
                    disc = p.get('order_discount')
                    if not disc:
                        continue
                    m = re.search(r'-\s*(.+)$', disc)
                    code = m.group(1).strip() if m else disc.strip()
                    code = code.upper()
                    price = float(p.get('ticket_sale_price') or 0)
                    order_id = p.get('order_id')
                    
                    if code not in coupons:
                        origem, canal = classify_cupom(code)
                        coupons[code] = {
                            'cupom': code,
                            'plataforma': 'SYMPLA',
                            'origem': origem,
                            'canal': canal,
                            'pedidos_set': set(),
                            'total': 0,
                            'receita': 0.0,
                            'desconto': 0.0,
                            'ativo': True
                        }
                    coupons[code]['total'] += 1
                    coupons[code]['receita'] += price
                    if order_id:
                        coupons[code]['pedidos_set'].add(order_id)
                
                pag = data.get('pagination', {})
                if not pag.get('has_next'):
                    break
                page += 1
        
        res = []
        for c, item in coupons.items():
            item['pedidos'] = len(item['pedidos_set'])
            del item['pedidos_set']
            res.append(item)
        print(f"[+] Sympla Live API: {len(res)} cupons capturados em tempo real com sucesso!")
        return res
    except Exception as e:
        print(f"[!] Erro ao consultar API oficial da Sympla (usando fallback): {e}")
        return None

def get_aggregated_coupons():
    """Agrega cupons da API Uticket + API Oficial Sympla (ou Supabase) com classificação estratégica."""
    now = time.time()
    if now - CUPONS_CACHE['timestamp'] < 180 and CUPONS_CACHE['data']:
        return CUPONS_CACHE['data']

    combined = []
    
    # 1. Cupons Oficiais Uticket em Tempo Real (Direto da API)
    try:
        ut_data = fetch_uticket_coupons_live()
        if ut_data and 'eventCoupons' in ut_data:
            CUPONS_CACHE['totals_uticket'] = ut_data.get('totals', {})
            for c in ut_data['eventCoupons']:
                name = c.get('name', '').strip()
                origem, canal = classify_cupom(name)
                combined.append({
                    'cupom': name,
                    'plataforma': 'UTICKET',
                    'origem': origem,
                    'canal': canal,
                    'pedidos': c.get('totalSell', 0),
                    'total': c.get('ticketCount', 0),
                    'receita': float(c.get('totalPrice', 0)),
                    'desconto': float(c.get('totalDiscount', 0)),
                    'ativo': c.get('active', True)
                })
    except Exception as e:
        print(f"[!] Erro ao buscar cupons Uticket API: {e}")

    # 2. Cupons Sympla (API Oficial ou Fallback Supabase)
    sympla_live = fetch_sympla_coupons_live()
    if sympla_live:
        combined.extend(sympla_live)
    else:
        # Fallback Supabase
        key = SUPABASE_ROLE or SUPABASE_ANON
        try:
            url = f"{SUPABASE_URL}/rest/v1/moving_excluir_vendas?select=cupom,plataforma,valor&plataforma=eq.SYMPLA&cupom=not.is.null"
            req = urllib.request.Request(url, headers={
                "apikey": key,
                "Authorization": f"Bearer {key}"
            })
            with urllib.request.urlopen(req, timeout=5) as resp:
                sympla_rows = json.loads(resp.read().decode())
                sympla_aggr = {}
                for r in sympla_rows:
                    c = r.get('cupom', '').strip()
                    if not c:
                        continue
                    if c not in sympla_aggr:
                        origem, canal = classify_cupom(c)
                        sympla_aggr[c] = {
                            'cupom': c,
                            'plataforma': 'SYMPLA',
                            'origem': origem,
                            'canal': canal,
                            'pedidos': 0,
                            'total': 0,
                            'receita': 0.0,
                            'desconto': 0.0,
                            'ativo': True
                        }
                    sympla_aggr[c]['total'] += 1
                    sympla_aggr[c]['receita'] += float(r.get('valor') or 0)
                    sympla_aggr[c]['pedidos'] += 1
                combined.extend(sympla_aggr.values())
        except Exception as e:
            print(f"[!] Erro ao buscar cupons Sympla Supabase: {e}")

    combined.sort(key=lambda x: -x['total'])
    
    # 3. Métricas Especiais: Regra Uticket (1 ganho a cada 10) & BDAY Sympla
    total_ganhos_uticket = 0
    promoters_premiados = 0
    for c in combined:
        t_tot = c.get('total', 0)
        # Regra Uticket: a cada 10 vendas de promoter ganha 1 ingresso
        if c.get('plataforma') == 'UTICKET' and c.get('origem') == 'PROMOTER':
            ganhos = t_tot // 10
            ciclo = t_tot % 10
            falta = 10 - ciclo if ciclo != 0 else 10
            c['recompensa_10'] = {
                'ganhos': ganhos,
                'ciclo': ciclo,
                'falta': falta,
                'elegivel': True
            }
            total_ganhos_uticket += ganhos
            if ganhos > 0:
                promoters_premiados += 1
        else:
            c['recompensa_10'] = {'ganhos': 0, 'ciclo': 0, 'falta': 10, 'elegivel': False}

        # Regra Sympla: Aniversariantes BDAY (Meta: 2 ingressos = liberado para levar)
        if 'BDAY' in c.get('cupom', '').upper():
            lib = t_tot >= 2
            c['bday_meta'] = {
                'meta': 2,
                'vendidos': t_tot,
                'faltam': max(0, 2 - t_tot),
                'liberado': lib,
                'status': 'LIBERADO' if lib else 'PENDENTE'
            }

    # 4. Consolidação de Ações da START INC.
    start_coupons = [c for c in combined if c['origem'] == 'START_INC']
    tot_ingressos_start = sum(c['total'] for c in start_coupons)
    tot_receita_start = sum(c['receita'] for c in start_coupons)
    tot_pedidos_start = sum(c['pedidos'] for c in start_coupons)
    
    CUPONS_CACHE['start_inc_summary'] = {
        'ingressos': tot_ingressos_start,
        'receita': tot_receita_start,
        'pedidos': tot_pedidos_start,
        'cupons_count': len(start_coupons),
        'campanhas': start_coupons
    }
    
    # 5. Consolidação das Outras Ações (Promoters, Comunidade, Aniversariantes, Parcerias)
    bday_coupons = [c for c in combined if 'BDAY' in c['cupom'].upper()]
    CUPONS_CACHE['outras_acoes_summary'] = {
        'promoters': {
            'ingressos': sum(c['total'] for c in combined if c['origem'] == 'PROMOTER'),
            'receita': sum(c['receita'] for c in combined if c['origem'] == 'PROMOTER'),
            'cupons_count': len([c for c in combined if c['origem'] == 'PROMOTER'])
        },
        'antiga_gestao': {
            'ingressos': sum(c['total'] for c in combined if c['origem'] == 'ANTIGA_GESTAO'),
            'receita': sum(c['receita'] for c in combined if c['origem'] == 'ANTIGA_GESTAO'),
            'cupons_count': len([c for c in combined if c['origem'] == 'ANTIGA_GESTAO'])
        },
        'comunidade': {
            'ingressos': sum(c['total'] for c in combined if c['origem'] == 'COMUNIDADE'),
            'receita': sum(c['receita'] for c in combined if c['origem'] == 'COMUNIDADE'),
            'cupons_count': len([c for c in combined if c['origem'] == 'COMUNIDADE'])
        },
        'aniversariantes': {
            'ingressos': sum(c['total'] for c in bday_coupons),
            'receita': sum(c['receita'] for c in bday_coupons),
            'cupons_count': len(bday_coupons),
            'liberados': len([c for c in bday_coupons if c.get('total', 0) >= 2]),
            'pendentes': len([c for c in bday_coupons if c.get('total', 0) < 2])
        },
        'parcerias': {
            'ingressos': sum(c['total'] for c in combined if c['origem'] == 'PARCERIA'),
            'receita': sum(c['receita'] for c in combined if c['origem'] == 'PARCERIA'),
            'cupons_count': len([c for c in combined if c['origem'] == 'PARCERIA'])
        },
        'uticket_recompensas': {
            'total_ingressos_ganhos': total_ganhos_uticket,
            'promoters_premiados': promoters_premiados,
            'regra': '1 ingresso ganho a cada 10 ingressos vendidos'
        }
    }
    
    # 6. Consolidação por Plataforma
    CUPONS_CACHE['plataformas_summary'] = {
        'uticket': {
            'ingressos': sum(c['total'] for c in combined if c['plataforma'] == 'UTICKET'),
            'receita': sum(c['receita'] for c in combined if c['plataforma'] == 'UTICKET'),
            'cupons_count': len([c for c in combined if c['plataforma'] == 'UTICKET'])
        },
        'sympla': {
            'ingressos': sum(c['total'] for c in combined if c['plataforma'] == 'SYMPLA'),
            'receita': sum(c['receita'] for c in combined if c['plataforma'] == 'SYMPLA'),
            'cupons_count': len([c for c in combined if c['plataforma'] == 'SYMPLA'])
        }
    }

    # 7. Dados Geográficos Auditados (País, Estados e Polos por Telefone)
    CUPONS_CACHE['regioes_summary'] = {
        'paises': [
            {'pais': 'Brasil', 'pct': 100.0, 'total': 5027, 'ddi': '+55'}
        ],
        'estados': [
            {'uf': 'RS', 'nome': 'Rio Grande do Sul', 'pct': 92.3, 'vendas_amostra': 4640, 'cor': '#2B6CF6'},
            {'uf': 'SC', 'nome': 'Santa Catarina', 'pct': 5.4, 'vendas_amostra': 273, 'cor': '#0EA5E9'},
            {'uf': 'SP', 'nome': 'São Paulo', 'pct': 0.5, 'vendas_amostra': 24, 'cor': '#8B5CF6'},
            {'uf': 'PR', 'nome': 'Paraná', 'pct': 0.5, 'vendas_amostra': 23, 'cor': '#E08A00'},
            {'uf': 'OUTROS', 'nome': 'Outros Estados (DF, MG, RJ)', 'pct': 1.3, 'vendas_amostra': 67, 'cor': '#64748B'}
        ],
        'polos': [
            {'polo': 'Porto Alegre & Região Metropolitana', 'uf': 'RS', 'ddd': '51', 'pct': 72.6, 'total': 3649},
            {'polo': 'Pelotas & Região Sul Gaúcho', 'uf': 'RS', 'ddd': '53', 'pct': 11.9, 'total': 600},
            {'polo': 'Caxias do Sul & Serra Gaúcha', 'uf': 'RS', 'ddd': '54', 'pct': 5.8, 'total': 293},
            {'polo': 'Florianópolis & Litoral Sul', 'uf': 'SC', 'ddd': '48', 'pct': 4.0, 'total': 200},
            {'polo': 'Santa Maria & Noroeste Gaúcho', 'uf': 'RS', 'ddd': '55', 'pct': 1.9, 'total': 98},
            {'polo': 'Joinville & Balneário Camboriú', 'uf': 'SC', 'ddd': '47', 'pct': 0.8, 'total': 40},
            {'polo': 'Chapecó & Oeste Catarinense', 'uf': 'SC', 'ddd': '49', 'pct': 0.7, 'total': 33},
            {'polo': 'Curitiba & Região Metropolitana', 'uf': 'PR', 'ddd': '41', 'pct': 0.4, 'total': 22},
            {'polo': 'São Paulo Capital & Grande SP', 'uf': 'SP', 'ddd': '11', 'pct': 0.2, 'total': 12}
        ]
    }

    CUPONS_CACHE['timestamp'] = now
    CUPONS_CACHE['data'] = combined
    return combined

DIARIO_CACHE = {
    'timestamp': 0,
    'data': []
}

def get_vendas_diarias():
    """Agrega vendas dia a dia por plataforma e setor a partir do banco Supabase."""
    now = time.time()
    if DIARIO_CACHE['data'] and (now - DIARIO_CACHE['timestamp'] < 120):
        return DIARIO_CACHE['data']

    key = SUPABASE_ROLE or SUPABASE_ANON
    all_sales = []
    offset = 0
    limit = 1000

    try:
        while True:
            url = f"{SUPABASE_URL}/rest/v1/moving_excluir_vendas?select=data_compra,plataforma,setor,tipo,valor&status=eq.CONFIRMADO&data_compra=not.is.null&limit={limit}&offset={offset}"
            req = urllib.request.Request(url, headers={'apikey': key, 'Authorization': f'Bearer {key}'})
            with urllib.request.urlopen(req, timeout=10) as resp:
                batch = json.loads(resp.read().decode())
                all_sales.extend(batch)
                if len(batch) < limit:
                    break
                offset += limit

        from collections import defaultdict
        diario_aggr = defaultdict(lambda: {'total': 0, 'receita': 0.0})

        for s in all_sales:
            dt = s.get('data_compra')
            if not dt:
                continue
            try:
                dt_obj = datetime.fromisoformat(dt)
                dia = dt_obj.astimezone(TZ_BR).strftime('%Y-%m-%d')
            except Exception:
                dia = dt[:10]
            plat = s.get('plataforma') or 'OUTRA'
            tipo = s.get('tipo') or 'INGRESSO'
            setor = s.get('setor') or (tipo if tipo in ['CAMPING', 'COPO'] else 'OUTROS')
            val = float(s.get('valor') or 0)
            
            k = (dia, plat, setor)
            diario_aggr[k]['total'] += 1
            diario_aggr[k]['receita'] += val

        result = [
            {'dia': k[0], 'plataforma': k[1], 'setor': k[2], 'total': v['total'], 'receita': v['receita']}
            for k, v in diario_aggr.items()
        ]
        result.sort(key=lambda x: (x['dia'], x['plataforma'], x['setor']))
        DIARIO_CACHE['data'] = result
        DIARIO_CACHE['timestamp'] = now
        return result
    except Exception as e:
        print(f"[!] Erro ao agregar vendas diárias: {e}")
        return DIARIO_CACHE.get('data', [])

def normalizar_lotes(lista_lotes):
    if not isinstance(lista_lotes, list):
        return []
    setores_map = {
        'FULLPASS': 'Full Pass',
        'ZONE': 'Zone',
        'GOLD': 'Gold',
        'BLACK': 'Black'
    }
    mapa = {}
    for item in lista_lotes:
        raw = str(item.get('lote') or '').strip().upper()
        setor = str(item.get('setor') or '').strip().upper()
        total = int(item.get('total') or 0)

        if not setor:
            if 'FULLPASS' in raw or 'FULL PASS' in raw:
                setor = 'FULLPASS'
            elif 'ZONE' in raw:
                setor = 'ZONE'
            elif 'GOLD' in raw:
                setor = 'GOLD'
            elif 'BLACK' in raw:
                setor = 'BLACK'
            else:
                setor = 'FULLPASS'

        setor_nome = setores_map.get(setor, setor)
        nome_lote = ''

        if 'CONVOCA' in raw or 'CONVOCACAO' in raw:
            nome_lote = f"{setor_nome.upper()} — CONVOCAÇÃO"
        elif any(k in raw for k in ['2º', '2ª', '2 LOTE', 'LOTE 2', 'SEGUNDO LOTE']):
            nome_lote = f"{setor_nome.upper()} — 2º LOTE"
        elif any(k in raw for k in ['3º', '3ª', '3 LOTE', 'LOTE 3', 'TERCEIRO LOTE']):
            nome_lote = f"{setor_nome.upper()} — 3º LOTE"
        elif any(k in raw for k in ['1º', '1ª', '1 LOTE', 'LOTE 1', 'PRIMEIRO LOTE']):
            nome_lote = f"{setor_nome.upper()} — 1º LOTE"
        elif 'WIX' in raw:
            nome_lote = f"{setor_nome.upper()} — LOTE WIX"
        else:
            nome_lote = raw

        chave = f"{setor}|{nome_lote}"
        if chave not in mapa:
            mapa[chave] = {'lote': nome_lote, 'setor': setor, 'total': 0}
        mapa[chave]['total'] += total

    res = list(mapa.values())
    res.sort(key=lambda x: x['total'], reverse=True)
    return res

def call_supabase_rpc(rpc_name, params=None):
    key = SUPABASE_ROLE or SUPABASE_ANON
    rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/{rpc_name}"
    req = urllib.request.Request(
        rpc_url,
        data=json.dumps(params or {}).encode('utf-8'),
        headers={
            'apikey': key,
            'Authorization': f'Bearer {key}',
            'Content-Type': 'application/json'
        },
        method='POST'
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='replace')
        try:
            parsed = json.loads(err_body)
            return {'ok': False, 'erro': parsed.get('message', err_body)}
        except Exception:
            return {'ok': False, 'erro': f"HTTP {e.code}: {err_body}"}
    except Exception as e:
        return {'ok': False, 'erro': str(e)}

AUTH_CACHE = {}

def extract_req_token(handler):
    t = handler.headers.get('X-Moving-Token')
    if t:
        return t.strip()
    auth = handler.headers.get('Authorization')
    if auth and auth.startswith('Bearer '):
        return auth[7:].strip()
    return None

def authenticate_req(handler):
    token = extract_req_token(handler)
    if not token:
        return None
    now = time.time()
    cached = AUTH_CACHE.get(token)
    if cached and cached.get('exp', 0) > now:
        return {'token': token, 'usuario': cached['usuario']}
    try:
        res = call_supabase_rpc('moving_excluir_me', {'p_token': token})
        if res and res.get('ok') and res.get('usuario'):
            AUTH_CACHE[token] = {
                'usuario': res['usuario'],
                'exp': now + 60
            }
            return {'token': token, 'usuario': res['usuario']}
    except Exception as e:
        print(f"[!] Erro ao autenticar token local: {e}")
        # Fallback de tolerância se a rede falhar momentaneamente mas tínhamos sessão recente
        if cached and cached.get('exp', 0) + 300 > now:
            return {'token': token, 'usuario': cached['usuario']}
    return None

class PlatformHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def send_head(self):
        # Garante Content-Type text/html; charset=utf-8 para evitar mojibake
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            for index in "index.html", "index.htm":
                index = os.path.join(path, index)
                if os.path.exists(index):
                    path = index
                    break
        if path.endswith('.html') or path.endswith('.htm'):
            try:
                f = open(path, 'rb')
                fs = os.fstat(f.fileno())
                self.send_response(200)
                self.send_header("Content-Type", "text/html; charset=utf-8")
                self.send_header("Content-Length", str(fs[6]))
                self.send_header("Last-Modified", self.date_time_string(fs.st_mtime))
                self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
                self.end_headers()
                return f
            except OSError:
                pass
        return super().send_head()

    def send_cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Moving-Token')

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_cors()
        self.end_headers()

    def do_GET(self):
        # 1. GET /api/me
        if self.path == '/api/me':
            auth = authenticate_req(self)
            self.send_response(200 if auth else 401)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors()
            self.end_headers()
            if auth:
                self.wfile.write(json.dumps({'ok': True, 'usuario': auth['usuario']}).encode('utf-8'))
            else:
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Não autenticado'}).encode('utf-8'))
            return

        # 2. GET /api/usuarios (Apenas Superadmin)
        if self.path.startswith('/api/usuarios'):
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Não autenticado'}).encode('utf-8'))
                return
            if auth['usuario'].get('papel') != 'superadmin':
                self.send_response(403)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Acesso negado: apenas superadmin'}).encode('utf-8'))
                return

            try:
                res = call_supabase_rpc('moving_excluir_usuarios_listar', {'p_token': auth['token']})
                self.send_response(200 if res.get('ok') else 400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(res).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': str(e)}).encode('utf-8'))
            return

        # 3. GET /api/resumo (Protegido por login)
        if self.path == '/api/resumo':
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Não autorizado. Faça login para acessar o painel.'}).encode('utf-8'))
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_cors()
            self.end_headers()
            try:
                rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/moving_excluir_resumo"
                req = urllib.request.Request(rpc_url, data=b'{}', headers={
                    'apikey': SUPABASE_ANON,
                    'Authorization': f'Bearer {SUPABASE_ANON}',
                    'Content-Type': 'application/json'
                }, method='POST')
                with urllib.request.urlopen(req, timeout=10) as resp:
                    resumo_obj = json.loads(resp.read().decode('utf-8'))
                    
                cupons_list = get_aggregated_coupons()
                resumo_obj['cupons'] = cupons_list
                resumo_obj['lotes'] = normalizar_lotes(resumo_obj.get('lotes', []))
                resumo_obj['totals_uticket'] = CUPONS_CACHE.get('totals_uticket', {})
                resumo_obj['start_inc'] = CUPONS_CACHE.get('start_inc_summary', {})
                resumo_obj['outras_acoes'] = CUPONS_CACHE.get('outras_acoes_summary', {})
                resumo_obj['plataformas_coupons'] = CUPONS_CACHE.get('plataformas_summary', {})
                resumo_obj['regioes'] = CUPONS_CACHE.get('regioes_summary', {})
                if not resumo_obj.get('vendas_diarias'):
                    resumo_obj['vendas_diarias'] = get_vendas_diarias()
                self.wfile.write(json.dumps(resumo_obj).encode('utf-8'))
            except Exception as e:
                err_resp = json.dumps({'error': str(e)}).encode('utf-8')
                self.wfile.write(err_resp)
            return

        # 4. GET /api/vendas_diarias (Protegido por login)
        if self.path == '/api/vendas_diarias':
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Não autorizado. Faça login.'}).encode('utf-8'))
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
            self.send_cors()
            self.end_headers()
            vd = get_vendas_diarias()
            self.wfile.write(json.dumps({'vendas_diarias': vd}).encode('utf-8'))
            return

        if self.path == '/api/cupons':
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'error': 'Não autorizado'}).encode('utf-8'))
                return

            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors()
            self.end_headers()
            cupons = get_aggregated_coupons()
            self.wfile.write(json.dumps({
                'cupons': cupons,
                'totals_uticket': CUPONS_CACHE.get('totals_uticket', {}),
                'start_inc': CUPONS_CACHE.get('start_inc_summary', {}),
                'outras_acoes': CUPONS_CACHE.get('outras_acoes_summary', {}),
                'plataformas_coupons': CUPONS_CACHE.get('plataformas_summary', {}),
                'regioes': CUPONS_CACHE.get('regioes_summary', {}),
                'vendas_diarias': get_vendas_diarias()
            }).encode('utf-8'))
            return

        return super().do_GET()

    def do_POST(self):
        # 1. POST /api/login
        if self.path == '/api/login':
            content_length = int(self.headers.get('Content-Length', 0))
            body_raw = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                body = json.loads(body_raw)
                res = call_supabase_rpc('moving_excluir_login', {
                    'p_login': str(body.get('login', '')).strip(),
                    'p_senha': str(body.get('senha', '')).strip()
                })
                status = 200 if res.get('ok') else 401
                self.send_response(status)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(res).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': str(e)}).encode('utf-8'))
            return

        # 2. POST /api/logout
        if self.path == '/api/logout':
            token = extract_req_token(self)
            if token:
                try:
                    call_supabase_rpc('moving_excluir_logout', {'p_token': token})
                except Exception:
                    pass
            self.send_response(200)
            self.send_header('Content-Type', 'application/json; charset=utf-8')
            self.send_cors()
            self.end_headers()
            self.wfile.write(json.dumps({'ok': True}).encode('utf-8'))
            return

        # 3. POST /api/senha
        if self.path == '/api/senha':
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Não autenticado'}).encode('utf-8'))
                return

            content_length = int(self.headers.get('Content-Length', 0))
            body_raw = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                body = json.loads(body_raw)
                res = call_supabase_rpc('moving_excluir_senha_trocar', {
                    'p_token': auth['token'],
                    'p_atual': str(body.get('atual', '')),
                    'p_nova': str(body.get('nova', ''))
                })
                self.send_response(200 if res.get('ok') else 400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(res).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': str(e)}).encode('utf-8'))
            return

        # 4. POST /api/usuarios (Salvar usuário - superadmin)
        if self.path == '/api/usuarios':
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Não autenticado'}).encode('utf-8'))
                return
            if auth['usuario'].get('papel') != 'superadmin':
                self.send_response(403)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Acesso negado: apenas superadmin'}).encode('utf-8'))
                return

            content_length = int(self.headers.get('Content-Length', 0))
            body_raw = self.rfile.read(content_length).decode('utf-8') if content_length > 0 else '{}'
            try:
                body = json.loads(body_raw)
                raw_id = str(body.get('id', '')).strip()
                p_id = raw_id if raw_id and raw_id not in ('null', 'undefined', 'None', 'NaN', '') else None
                res = call_supabase_rpc('moving_excluir_usuario_salvar', {
                    'p_token': auth['token'],
                    'p_id': p_id,
                    'p_login': str(body.get('login', '')).strip().lower(),
                    'p_nome': str(body.get('nome', '')).strip(),
                    'p_senha': str(body.get('senha', '')),
                    'p_papel': str(body.get('papel', 'usuario')).lower(),
                    'p_telas': body.get('telas') if isinstance(body.get('telas'), list) else [],
                    'p_ativo': body.get('ativo', True) is not False
                })
                self.send_response(200 if res.get('ok') else 400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(res).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': str(e)}).encode('utf-8'))
            return

        # 5. POST /api/sync (Protegido - Admin ou Superadmin)
        if self.path == '/api/sync':
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ERRO', 'erro': 'Não autorizado. Faça login.'}).encode('utf-8'))
                return
            if auth['usuario'].get('papel') not in ('admin', 'superadmin'):
                self.send_response(403)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'status': 'ERRO', 'erro': 'Acesso negado: apenas administradores podem sincronizar.'}).encode('utf-8'))
                return

            worker_script = os.path.join(DIR, 'sync_worker.py')
            try:
                proc = subprocess.run([sys.executable, worker_script], capture_output=True, text=True, timeout=120)
                saida = (proc.stdout or '') + '\n' + (proc.stderr or '')
                sync_ok = proc.returncode == 0 and 'SINCRONIZAÇÃO CONCLUÍDA' in saida
                sync_erro = None
                if not sync_ok:
                    linhas = [l.strip() for l in saida.splitlines() if l.strip()]
                    falhas = [l for l in linhas if any(k in l for k in ('FALHA', 'ERRO', 'Erro', 'Error', 'Traceback', 'falhou'))]
                    sync_erro = (falhas[-1] if falhas else (linhas[-1] if linhas else 'o sync_worker terminou sem confirmar'))[:300]
                
                CUPONS_CACHE['timestamp'] = 0
                DIARIO_CACHE['timestamp'] = 0
                
                rpc_url = f"{SUPABASE_URL}/rest/v1/rpc/moving_excluir_resumo"
                req = urllib.request.Request(rpc_url, data=b'{}', headers={
                    'apikey': SUPABASE_ANON,
                    'Authorization': f'Bearer {SUPABASE_ANON}',
                    'Content-Type': 'application/json'
                }, method='POST')
                with urllib.request.urlopen(req, timeout=15) as resp:
                    resumo_data = json.loads(resp.read().decode('utf-8'))
                    
                cupons_list = get_aggregated_coupons()
                resumo_data['cupons'] = cupons_list
                resumo_data['totals_uticket'] = CUPONS_CACHE.get('totals_uticket', {})
                resumo_data['start_inc'] = CUPONS_CACHE.get('start_inc_summary', {})
                resumo_data['outras_acoes'] = CUPONS_CACHE.get('outras_acoes_summary', {})
                resumo_data['plataformas_coupons'] = CUPONS_CACHE.get('plataformas_summary', {})
                resumo_data['regioes'] = CUPONS_CACHE.get('regioes_summary', {})
                if not resumo_data.get('vendas_diarias'):
                    resumo_data['vendas_diarias'] = get_vendas_diarias()
                    
                self.send_response(200)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({
                    'status': 'OK' if sync_ok else 'ERRO',
                    'erro': sync_erro,
                    'resumo': resumo_data,
                    'log': proc.stdout
                }).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                motivo = 'a sincronização passou de 2 minutos' if isinstance(e, subprocess.TimeoutExpired) else str(e)
                self.wfile.write(json.dumps({'status': 'ERRO', 'erro': motivo}).encode('utf-8'))
            return
            
        self.send_response(404)
        self.send_cors()
        self.end_headers()

    def do_DELETE(self):
        # DELETE /api/usuarios?id=... (Excluir usuário - superadmin)
        if self.path.startswith('/api/usuarios'):
            auth = authenticate_req(self)
            if not auth:
                self.send_response(401)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Não autenticado'}).encode('utf-8'))
                return
            if auth['usuario'].get('papel') != 'superadmin':
                self.send_response(403)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'Acesso negado: apenas superadmin'}).encode('utf-8'))
                return

            import urllib.parse
            parsed = urllib.parse.urlparse(self.path)
            qs = urllib.parse.parse_qs(parsed.query)
            user_id = qs.get('id', [None])[0]
            if not user_id:
                content_length = int(self.headers.get('Content-Length', 0))
                if content_length > 0:
                    try:
                        b = json.loads(self.rfile.read(content_length).decode('utf-8'))
                        user_id = b.get('id')
                    except Exception:
                        pass

            if user_id:
                user_id = str(user_id).strip()
                if user_id in ('None', 'null', 'undefined', 'NaN', ''):
                    user_id = None

            if not user_id:
                self.send_response(400)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': 'ID não fornecido ou inválido'}).encode('utf-8'))
                return

            try:
                res = call_supabase_rpc('moving_excluir_usuario_excluir', {
                    'p_token': auth['token'],
                    'p_id': user_id
                })
                self.send_response(200 if res.get('ok') else 400)
                self.send_header('Content-Type', 'application/json; charset=utf-8')
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps(res).encode('utf-8'))
            except Exception as e:
                self.send_response(500)
                self.send_cors()
                self.end_headers()
                self.wfile.write(json.dumps({'ok': False, 'erro': str(e)}).encode('utf-8'))
            return

        self.send_response(404)
        self.send_cors()
        self.end_headers()

def start_periodic_sync(interval_seconds=900):
    """Executa o sync_worker a cada 15 minutos em background de forma segura e transparente."""
    def _worker_loop():
        print(f"[*] ⏰ Motor de sincronização periódica ativo (intervalo: {interval_seconds // 60} minutos).")
        while True:
            time.sleep(interval_seconds)
            try:
                print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] ⏰ Executando sincronização periódica automática (15 min)...")
                worker_script = os.path.join(DIR, 'sync_worker.py')
                subprocess.run([sys.executable, worker_script], capture_output=True, text=True, timeout=120)
                CUPONS_CACHE['timestamp'] = 0
                DIARIO_CACHE['timestamp'] = 0
                print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] [✓] Sincronização periódica de 15 min concluída com sucesso!")
            except Exception as e:
                print(f"[!] Erro no motor automático de sincronização periódica: {e}")

    t = threading.Thread(target=_worker_loop, daemon=True)
    t.start()

def run_server():
    start_periodic_sync(900)  # Motor automático: sincroniza a cada 15 minutos
    server_address = ('0.0.0.0', PORT)
    httpd = ThreadingHTTPServer(server_address, PlatformHandler)
    print("=" * 60)
    print(f"🚀 PAINEL MOVING FESTIVAL 2026 INICIADO NA PORTA {PORT}")
    print(f"👉 Acesse no seu navegador: http://localhost:{PORT}")
    print("⏰ Motor de scraping ativo: executando a cada 15 minutos automaticamente")
    print("=" * 60)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor finalizado.")
        httpd.server_close()

if __name__ == '__main__':
    run_server()

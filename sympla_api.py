#!/usr/bin/env python3
"""
Sympla — API oficial (conta do dono do evento) — Moving Festival 2026
=====================================================================
- Puxa SOMENTE o evento Moving 2026 (SYMPLA_EVENT_ID, padrão 3419289).
  Antes de qualquer coisa confere pela API se o nome do evento contém "MOVING".
  Se não contiver, para tudo e não grava nada.
- Gera os registros no MESMO formato e com os MESMOS IDs da planilha
  ("SYMPLA-<nº do ingresso>"), para o upsert não duplicar.
- Valida: compara API x planilha (scraping/exportação) e gera um relatório
  em validacao_sympla.json. A API é a fonte oficial; a planilha só confere.

Uso:
  python3 sympla_api.py              -> só consulta e valida (NÃO grava no banco)
  (o sync_worker.py importa este módulo e grava)

Token: SYMPLA_API_TOKEN no .env (nunca escrever o token no código).
"""

import os
import re
import sys
import json
import time
import glob
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta

TZ_BR = timezone(timedelta(hours=-3))
DIR = os.path.dirname(os.path.abspath(__file__))
BASE = "https://api.sympla.com.br/public"
VERSOES = ["v3", "v1.5.1"]          # tenta v3 (já usada no server.py) e cai para v1.5.1
STATUS_OK = {"A"}                   # A = aprovado. Outros (P pendente, C cancelado, R reembolsado...) = CANCELADO
PLANILHA_GLOB = os.path.expanduser(
    "~/Downloads/Lista de participantes - Moving_Festival_-_Felizes_para_Sempre (3419289)*.xlsx")


# ---------------------------------------------------------------- config
def _load_env():
    cfg = {}
    p = os.path.join(DIR, ".env")
    if os.path.exists(p):
        with open(p, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    cfg[k.strip()] = v.strip().strip('"').strip("'")
    return cfg

CFG = _load_env()
TOKEN = CFG.get("SYMPLA_API_TOKEN", "")
EVENT_ID = CFG.get("SYMPLA_EVENT_ID", "3419289")


# ---------------------------------------------------------------- HTTP
def _get(path, params=None, tentativas=3):
    if not TOKEN:
        raise RuntimeError("SYMPLA_API_TOKEN não está no .env")
    q = ""
    if params:
        q = "?" + "&".join(f"{k}={urllib.request.quote(str(v))}" for k, v in params.items())
    url = f"{BASE}/{path}{q}"
    req = urllib.request.Request(url, headers={"s_token": TOKEN, "Accept": "application/json",
                                               "User-Agent": "MovingPainel/1.0"})
    ultimo = None
    for i in range(tentativas):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code in (401, 403, 404):
                raise
            ultimo = e
        except Exception as e:
            ultimo = e
        time.sleep(2 * (i + 1))
    raise ultimo


def _get_versao(rota, params=None):
    """Tenta a mesma rota em v3 e v1.5.1. Retorna (versao, json)."""
    erro = None
    for v in VERSOES:
        try:
            return v, _get(f"{v}/{rota}", params)
        except urllib.error.HTTPError as e:
            erro = e
            if e.code in (401, 403):
                raise RuntimeError(f"Sympla recusou o token ({e.code}). Confira SYMPLA_API_TOKEN.")
            continue
    raise erro


# ---------------------------------------------------------------- evento
def conferir_evento():
    """Garante que o ID configurado é o Moving 2026. Para tudo se não for."""
    try:
        _, j = _get_versao(f"events/{EVENT_ID}")
    except Exception as e:
        raise RuntimeError(f"Não consegui ler o evento {EVENT_ID} na Sympla: {e}")
    ev = j.get("data", j)
    if isinstance(ev, list):
        ev = ev[0] if ev else {}
    nome = str(ev.get("name") or ev.get("nome") or "")
    if "MOVING" not in nome.upper():
        raise RuntimeError(f"O evento {EVENT_ID} na Sympla se chama '{nome}', não é o Moving 2026. "
                           f"Nada foi puxado.")
    print(f"[✓] Evento confirmado: {nome} (ID {EVENT_ID})")
    return nome


# ---------------------------------------------------------------- participantes
def buscar_participantes():
    """Todas as páginas de participantes do evento Moving 2026."""
    todos, page, versao = [], 1, None
    while True:
        params = {"page": page, "page_size": 100}
        if versao:
            j = _get(f"{versao}/events/{EVENT_ID}/participants", params)
        else:
            versao, j = _get_versao(f"events/{EVENT_ID}/participants", params)
        dados = j.get("data", []) or []
        todos.extend(dados)
        pag = j.get("pagination", {}) or {}
        if not pag.get("has_next") or not dados:
            break
        page += 1
        if page > 500:
            raise RuntimeError("Paginação passou de 500 páginas; algo está errado.")
    print(f"[+] Sympla API ({versao}): {len(todos)} participantes lidos do evento {EVENT_ID}")
    return todos


# ---------------------------------------------------------------- classificação (igual à da planilha)
def classificar(tipo_raw):
    t = (tipo_raw or "").upper()
    setor = None
    if "FULLPASS" in t or "FULL PASS" in t: setor = "FULLPASS"
    elif "ZONE" in t: setor = "ZONE"
    elif "GOLD" in t: setor = "GOLD"
    elif "BLACK" in t: setor = "BLACK"
    if setor:
        return "INGRESSO", setor
    if "CAMPING" in t: return "CAMPING", None
    if "COPO" in t: return "COPO", None
    return "INGRESSO", None


def canal_do_cupom(cupom):
    """Mesma regra do extract_sympla_records (sync_worker.py)."""
    if not cupom:
        return "ORGANICO", None
    c = cupom.upper()
    if "DIVULGADOR" in c or "DIVULGAÇAO" in c or "DIVULGACAO" in c:
        return "AFILIADO_PROMOTER", cupom
    if "BDAY" in c:
        return "ANIVERSARIANTE", cupom
    if "MEIA" in c or "ESTUDANTE" in c or "PCD" in c:
        return "MEIA_ENTRADA", None
    if any(k in c for k in ["KIOMA", "TRIP", "FESTASRS", "GUTO"]):
        return "PARCERIA", cupom
    return "CUPOM_CAMPANHA", cupom


def _data_iso(s):
    if not s:
        return None
    s = str(s).strip()
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%d/%m/%Y %H:%M", "%Y-%m-%d"):
        try:
            return datetime.strptime(s[:19], fmt).replace(tzinfo=TZ_BR).isoformat()
        except ValueError:
            pass
    return s  # já vem ISO com fuso


def montar_registros(participantes):
    regs, sem_setor = [], []
    for p in participantes:
        num = str(p.get("ticket_number") or "").strip()
        if not num:
            continue
        lote = str(p.get("ticket_name") or "").strip()
        tipo, setor = classificar(lote)
        if tipo == "INGRESSO" and not setor:
            sem_setor.append(lote)
            continue
        valor = float(p.get("ticket_sale_price") or 0)
        disc = str(p.get("order_discount") or "").strip()
        cupom = disc.split(" - ", 1)[1].strip() if " - " in disc else (disc or None)
        canal, promoter = canal_do_cupom(cupom)
        st = str(p.get("order_status") or "").upper()
        nome = f"{p.get('first_name') or ''} {p.get('last_name') or ''}".strip()
        regs.append({
            "id": f"SYMPLA-{num}",
            "plataforma": "SYMPLA",
            "tipo": tipo,
            "setor": setor,
            "lote": lote,
            "categoria": "CORTESIA" if (valor == 0 or "CORTESIA" in lote.upper()) else "PAGO",
            "status": "CONFIRMADO" if st in STATUS_OK else "CANCELADO",
            "valor": valor,
            "comprador_nome": nome or None,
            "comprador_email": p.get("email") or None,
            "comprador_telefone": None,
            "data_compra": _data_iso(p.get("order_date") or p.get("order_approved_date")),
            "pedido_id": p.get("order_id"),
            "cupom": cupom,
            "canal": canal if tipo == "INGRESSO" else None,
            "promoter": promoter if tipo == "INGRESSO" else None,
        })
    if sem_setor:
        print(f"[!] {len(sem_setor)} ingressos sem setor reconhecido (não gravados): "
              f"{sorted(set(sem_setor))[:10]}")
    return regs, sorted(set(sem_setor))


# ---------------------------------------------------------------- validação API x planilha
def _resumo(regs):
    r = {}
    for x in regs:
        if x["tipo"] != "INGRESSO" or x["status"] != "CONFIRMADO":
            continue
        k = r.setdefault(x["setor"], {"total": 0, "pagos": 0, "cortesias": 0, "receita": 0.0})
        k["total"] += 1
        k["pagos" if x["categoria"] == "PAGO" else "cortesias"] += 1
        if x["categoria"] == "PAGO":
            k["receita"] += float(x["valor"] or 0)
    for k in r.values():
        k["receita"] = round(k["receita"], 2)
    return r


def validar(api_regs, planilha_regs):
    api_ok = {x["id"]: x for x in api_regs if x["tipo"] == "INGRESSO" and x["status"] == "CONFIRMADO"}
    pla = {x["id"]: x for x in planilha_regs}
    so_api = sorted(set(api_ok) - set(pla))
    so_pla = sorted(set(pla) - set(api_ok))
    dif_valor = [i for i in set(api_ok) & set(pla)
                 if abs(float(api_ok[i]["valor"] or 0) - float(pla[i]["valor"] or 0)) > 0.01]
    dif_setor = [i for i in set(api_ok) & set(pla) if api_ok[i]["setor"] != pla[i]["setor"]]
    rel = {
        "gerado_em": datetime.now(TZ_BR).isoformat(),
        "evento": EVENT_ID,
        "api": {"ingressos_confirmados": len(api_ok), "por_setor": _resumo(api_regs)},
        "planilha": {"ingressos": len(pla), "por_setor": _resumo(planilha_regs)},
        "batem": not (so_api or so_pla or dif_valor or dif_setor),
        "so_na_api": {"qtd": len(so_api), "exemplos": so_api[:20]},
        "so_na_planilha": {"qtd": len(so_pla), "exemplos": so_pla[:20]},
        "valor_diferente": {"qtd": len(dif_valor), "exemplos": dif_valor[:20]},
        "setor_diferente": {"qtd": len(dif_setor), "exemplos": dif_setor[:20]},
    }
    with open(os.path.join(DIR, "validacao_sympla.json"), "w", encoding="utf-8") as f:
        json.dump(rel, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print("VALIDAÇÃO SYMPLA — API oficial x planilha")
    print(f"  API:      {len(api_ok)} ingressos confirmados")
    print(f"  Planilha: {len(pla)} ingressos")
    if rel["batem"]:
        print("  [✓] BATEM 100%")
    else:
        print(f"  Só na API:        {len(so_api)}  (vendas novas depois da planilha, normalmente)")
        print(f"  Só na planilha:   {len(so_pla)}  (cancelados/reembolsados depois, normalmente)")
        print(f"  Valor diferente:  {len(dif_valor)}")
        print(f"  Setor diferente:  {len(dif_setor)}")
    print("  Detalhes: validacao_sympla.json")
    print("=" * 60 + "\n")
    return rel


def planilha_mais_recente():
    arqs = glob.glob(PLANILHA_GLOB)
    return max(arqs, key=os.path.getmtime) if arqs else None


# ---------------------------------------------------------------- ponto de entrada para o sync_worker
def sincronizar(extrair_planilha=None, validar_com_planilha=True):
    """Retorna (registros_para_gravar, relatorio_validacao_ou_None)."""
    conferir_evento()
    regs, _ = montar_registros(buscar_participantes())
    rel = None
    if validar_com_planilha and extrair_planilha:
        caminho = planilha_mais_recente()
        if caminho:
            print(f"[*] Validando contra a planilha: {os.path.basename(caminho)}")
            rel = validar(regs, extrair_planilha(caminho))
        else:
            print("[i] Nenhuma planilha da Sympla em Downloads; validação pulada.")
    return regs, rel


if __name__ == "__main__":
    # Modo teste: consulta a API e valida, sem gravar nada no banco.
    try:
        sys.path.insert(0, DIR)
        try:
            from sync_worker import extract_sympla_records
        except Exception:
            extract_sympla_records = None
        regs, rel = sincronizar(extrair_planilha=extract_sympla_records)
        tipos = {}
        for r in regs:
            tipos[(r["tipo"], r["status"])] = tipos.get((r["tipo"], r["status"]), 0) + 1
        print("Registros montados pela API (nada foi gravado):")
        for (t, s), q in sorted(tipos.items()):
            print(f"  {t:9} {s:11} {q}")
    except Exception as e:
        print(f"[✗] {e}")
        sys.exit(1)

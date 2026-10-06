#!/usr/bin/env python3
"""
Daemon de Sincronização Periódica — Moving Festival 2026
Executa o sync_worker.py a cada N minutos (padrão: 5 minutos).
Pode ser executado em segundo plano no terminal.
"""

import time
import subprocess
import sys
import os

INTERVALO_SEGUNDOS = 300  # 5 minutos

script_dir = os.path.dirname(os.path.abspath(__file__))
worker_path = os.path.join(script_dir, "sync_worker.py")

print(f"[*] Iniciando Daemon de Sincronização Contínua...")
print(f"[*] Intervalo: {INTERVALO_SEGUNDOS // 60} minutos.")
print(f"[*] Pressione Ctrl+C para encerrar.\n")

while True:
    try:
        print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] Disparando sync_worker...")
        res = subprocess.run([sys.executable, worker_path], capture_output=True, text=True)
        print(res.stdout)
        if res.stderr:
            print("[STDERR]:", res.stderr)
    except KeyboardInterrupt:
        print("\n[!] Daemon finalizado pelo usuário.")
        break
    except Exception as e:
        print(f"[!] Erro no loop de sincronização: {e}")
        
    print(f"[*] Próxima busca em {INTERVALO_SEGUNDOS // 60} minutos...")
    time.sleep(INTERVALO_SEGUNDOS)

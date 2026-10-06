#!/usr/bin/env bash
# Inicia o motor de sincronização automática a cada 15 minutos em background
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "🚀 Iniciando Motor de Sincronização Moving Festival (15 em 15 minutos)..."
nohup python3 run_sync_daemon.py > sync_daemon.log 2>&1 &
PID=$!
echo "✅ Motor rodando em segundo plano com PID $PID."
echo "📄 Logs disponíveis em: $DIR/sync_daemon.log"
echo "Para parar o motor a qualquer momento, execute: kill $PID"

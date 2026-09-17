#!/bin/bash
PIDS=$(pgrep -d, -f 'next-server')
echo "Monitoring Node Worker PIDs: $PIDS on $(hostname)"
COUNT=${1:-10}
for i in $(seq 1 $COUNT); do
  date +"[%H:%M:%S]"
  ps -p $PIDS -o pid,psr,%cpu,%mem,rss,cmd --no-headers
  echo "---"
  sleep 1
done

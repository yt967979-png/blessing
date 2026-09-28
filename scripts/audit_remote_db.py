import subprocess
import json

sql = """
SELECT 
  state,
  count(*) 
FROM pg_stat_activity 
WHERE datname = 'blessing' 
GROUP BY state;

SELECT 
  pid, 
  now() - xact_start AS duration, 
  state, 
  query 
FROM pg_stat_activity 
WHERE datname = 'blessing' 
  AND state = 'idle in transaction' 
  AND now() - xact_start > interval '10 seconds';

SELECT 
  count(*) AS deadlocks 
FROM pg_stat_database 
WHERE datname = 'blessing';

SELECT 
  relname AS table_name, 
  pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
  n_live_tup AS row_estimate,
  last_autovacuum
FROM pg_stat_user_tables 
ORDER BY pg_total_relation_size(relid) DESC;
"""

p = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", "blessing"], input=sql, text=True, capture_output=True)
print(p.stdout)

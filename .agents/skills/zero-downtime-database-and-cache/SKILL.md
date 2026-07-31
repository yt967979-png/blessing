---
name: zero-downtime-database-and-cache
description: Standards for maintaining 100% 24/7 PostgreSQL pool connectivity, RAM query cache, and sub-15ms execution.
---

# Zero Downtime Database & Cache Skill

## Instructions

1. **Warm Pool Execution**:
   - Always use `queryDb()` from `@/lib/db` for non-transactional database reads.
   - Do NOT hold single client instances across multiple queries unless inside an explicit SQL transaction block (`BEGIN` ... `COMMIT`).

2. **Parallel Promise.all Execution**:
   - Combine independent queries into `Promise.all([queryDb(...), queryDb(...)])`.

3. **RAM Cache Invalidation**:
   - Maintain catalog cache in `queryCache` for fast (<5ms) product catalog delivery.
   - Invalidate cache automatically whenever an Admin modifies inventory or prices.

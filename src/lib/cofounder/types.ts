export type CofounderDepartment =
  | 'CEO'
  | 'CTO'
  | 'SUPPORT'
  | 'INTEL'
  | 'SALES'
  | 'PAYMENT'
  | 'INVENTORY'
  | 'SHIPPING'
  | 'SECURITY'
  | 'SEO'
  | 'FINANCE'
  | 'LEARNING';

export type IncidentSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type IncidentStatus = 'OPEN' | 'INVESTIGATING' | 'RESOLVED';
export type TaskPermissionLevel = 1 | 2 | 3;
export type TaskStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'EXECUTED' | 'COMPLETED';

export interface CofounderIncident {
  id: string;
  severity: IncidentSeverity;
  department: CofounderDepartment;
  title: string;
  symptoms: string;
  root_cause?: string;
  resolution?: string;
  confidence_score?: number;
  status: IncidentStatus;
  detected_at: string;
  resolved_at?: string;
}

export interface CofounderTask {
  id: string;
  title: string;
  description: string;
  department: CofounderDepartment;
  permission_level: TaskPermissionLevel;
  status: TaskStatus;
  proposed_action?: any;
  execution_result?: any;
  created_at: string;
  updated_at: string;
}

export interface CofounderDigest {
  id: string;
  digest_type: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  period_date: string;
  metrics_summary: Record<string, any>;
  ai_synthesis: string;
  delivered_telegram: boolean;
  created_at: string;
}

export interface CofounderObservedMetrics {
  timestamp: string;
  business: {
    todayOrders: number;
    todayRevenue: number;
    yesterdayOrders: number;
    yesterdayRevenue: number;
    paidOrders: number;
    cancelledOrders: number;
    avgOrderValue: number;
    topBookToday: string;
    unfulfilledOrders: number;
  };
  technical: {
    uptimeSeconds: number;
    uptimeFormatted: string;
    memoryUsedMb: number;
    memoryTotalMb: number;
    memoryPercent: number;
    cpuCount: number;
    recentErrorsCount: number;
    dbHealthy: boolean;
    redisHealthy: boolean;
  };
  customer: {
    activeVisitorsNow: number;
    abandonedCarts24h: number;
    openSupportTickets: number;
    avgCsatRating: number;
  };
  logistics: {
    ordersAwaitingAwb: number;
    inTransitCount: number;
    deliveredCount: number;
  };
  inventory: {
    lowStockCount: number;
    outOfStockCount: number;
    lowStockItems: Array<{ id: string; title: string; stock: number; standard?: string }>;
  };
}

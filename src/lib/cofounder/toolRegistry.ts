import { executeCreateCoupon, executeGetCoupon, executeToggleCoupon, executeDeleteCoupon, CreateCouponParams, CouponToolResult } from './tools/couponTool';
import {
  updateProductAvailability,
  deactivateInstruction,
  addBusinessInstruction,
  executeLaunchExperience,
  getProductStatusExplanation,
} from './businessControls';
import { createBulkOrderPaymentLink, verifyBulkProductAvailability } from './bulkOrderWorkflow';
import { activateFestiveTheme, deactivateTheme, StorefrontThemeId } from './themeEngine';
import { deployExamCampaign, removeExamCampaign } from './researchEngine';
import { gatherCoFounderMetrics } from './observer';

export interface ToolDefinition {
  name: string;
  description: string;
  execute: (params: any) => Promise<any>;
}

/**
 * The Central Business Tool Registry for Blessing AI Co-Founder.
 * Enforces real tool execution with database verification.
 */
export const businessToolRegistry = {
  // ── 1. COUPON MANAGEMENT ──────────────────────────────────────────
  create_coupon: async (params: CreateCouponParams): Promise<CouponToolResult> => {
    return await executeCreateCoupon(params);
  },

  get_coupon: async (code: string): Promise<CouponToolResult> => {
    return await executeGetCoupon(code);
  },

  toggle_coupon: async (code: string, isActive: boolean): Promise<CouponToolResult> => {
    return await executeToggleCoupon(code, isActive);
  },

  delete_coupon: async (code: string): Promise<CouponToolResult> => {
    return await executeDeleteCoupon(code);
  },

  // ── 2. PRODUCT & INVENTORY CONTROLS ───────────────────────────────
  update_stock: async (params: {
    bookId: string;
    stock?: number;
    isComingSoon?: boolean;
    reason?: string;
  }) => {
    return await updateProductAvailability(params.bookId, {
      stock: params.stock,
      isComingSoon: params.isComingSoon,
      availabilityReason: params.reason,
    });
  },

  get_product_status: async (params?: { query?: string }) => {
    return await getProductStatusExplanation(params?.query);
  },

  verify_product: async (productQuery: string, medium?: string, quantity: number = 1) => {
    return await verifyBulkProductAvailability(productQuery, medium, quantity);
  },

  // ── 3. BULK ORDERS & PAYMENTS ────────────────────────────────────
  create_bulk_payment_link: async (params: {
    sessionId: string;
    schoolName: string;
    product: { id: string; title: string; medium: string };
    quantity: number;
    unitPrice: number;
    totalAmount: number;
    shippingFee: number;
    contactPhone?: string;
  }) => {
    return await createBulkOrderPaymentLink(params);
  },

  // ── 4. STOREFRONT THEMES & ANNOUNCEMENTS ─────────────────────────
  execute_launch_experience: async (params?: { customHeadline?: string; durationHours?: number }) => {
    return await executeLaunchExperience(params);
  },

  activate_theme: async (themeId: StorefrontThemeId, durationHours: number = 72) => {
    return await activateFestiveTheme({ themeId, durationHours });
  },

  deactivate_theme: async () => {
    return await deactivateTheme();
  },

  publish_announcement: async (params: {
    type: 'MAINTENANCE' | 'NOTICE' | 'PROMOTION';
    content: string;
    durationHours?: number;
    severity?: 'CRITICAL' | 'WARNING' | 'INFO';
  }) => {
    return await addBusinessInstruction({
      type: params.type,
      content: params.content,
      durationHours: params.durationHours,
      severity: params.severity,
    });
  },

  remove_announcement: async (typeOrId: string) => {
    return await deactivateInstruction(typeOrId);
  },

  deploy_exam_timetable: async (params?: { standards?: '10th' | '12th' | 'both'; durationDays?: number }) => {
    return await deployExamCampaign(params);
  },

  remove_exam_timetable: async () => {
    return await removeExamCampaign();
  },

  // ── 5. SALES & METRICS ───────────────────────────────────────────
  get_sales_metrics: async () => {
    return await gatherCoFounderMetrics();
  },

  // ── 6. ORDER LOOKUP & CUSTOMER CARE ──────────────────────────────
  query_order: async (params: { lookupQuery: string }) => {
    const q = (params.lookupQuery || '').trim();
    if (!q) return { success: false, message: 'Please provide an order number, phone number, or customer name.' };

    const { queryDb } = await import('@/lib/db');
    const res = await queryDb(
      `SELECT id, order_number, total_amount, order_status, payment_status, courier_name, awb_number, tracking_url, shipping_address, created_at
       FROM orders
       WHERE order_number ILIKE $1
          OR id ILIKE $1
          OR (shipping_address->>'phone' ILIKE $1)
          OR (shipping_address->>'fullName' ILIKE $2)
       ORDER BY created_at DESC
       LIMIT 3`,
      [`%${q}%`, `%${q}%`]
    );

    if (res.rows.length === 0) {
      return { success: false, message: `No orders found matching "${q}".` };
    }

    const orders = res.rows.map((row: any) => ({
      orderNumber: row.order_number,
      totalAmount: Number(row.total_amount),
      orderStatus: row.order_status,
      paymentStatus: row.payment_status,
      courierName: row.courier_name || 'ST Courier',
      awbNumber: row.awb_number || 'Awaiting docket',
      trackingUrl: row.tracking_url,
      customerName: row.shipping_address?.fullName || 'Customer',
      phone: row.shipping_address?.phone,
      city: row.shipping_address?.city,
      placedAt: row.created_at,
    }));

    return { success: true, count: orders.length, orders };
  },

  // ── 7. INVENTORY HEALTH AUDIT ─────────────────────────────────────
  get_inventory_health: async () => {
    const { queryDb } = await import('@/lib/db');
    const res = await queryDb(
      `SELECT id, title, medium, stock, status, is_coming_soon
       FROM books
       WHERE status = 'published' AND is_coming_soon = false
       ORDER BY stock ASC
       LIMIT 10`
    );

    const lowStock = res.rows.filter((b: any) => Number(b.stock) <= 15);
    const totalTitles = res.rows.length;

    return {
      success: true,
      totalTitles,
      criticalLowStock: lowStock.map((b: any) => ({
        id: b.id,
        title: b.title,
        medium: b.medium,
        stock: Number(b.stock),
      })),
    };
  },

  // ── 8. WEBSITE DESIGN INTELLIGENCE & VIEWPORT AUDITS ───────────────
  diagnose_responsive_ui: async (params?: { targetSection?: string }) => {
    const { runMobileUiAuditAndRepair } = await import('./problemDiagnostics');
    const report = await runMobileUiAuditAndRepair(params?.targetSection);
    return {
      success: true,
      reportFormatted: report.fullReportFormatted,
      summary: report.storefrontOutcome,
    };
  },

  audit_and_fix_website_bugs: async () => {
    const { runFullWebsiteBugAuditAndRepair } = await import('./problemDiagnostics');
    const report = await runFullWebsiteBugAuditAndRepair();
    return {
      success: true,
      reportFormatted: report.fullReportFormatted,
      summary: report.storefrontOutcome,
    };
  },

  diagnose_checkout_pipeline: async () => {
    const { diagnoseAndRepairCheckoutPipeline } = await import('./problemDiagnostics');
    const report = await diagnoseAndRepairCheckoutPipeline();
    return {
      success: true,
      reportFormatted: report.fullReportFormatted,
      summary: report.storefrontOutcome,
    };
  },

  repair_cofounder_pipeline: async (params?: { chatId?: string | number }) => {
    const { diagnoseAndRepairCoFounderPipeline } = await import('./problemDiagnostics');
    const report = await diagnoseAndRepairCoFounderPipeline(params?.chatId);
    return {
      success: true,
      reportFormatted: report.fullReportFormatted,
      summary: report.storefrontOutcome,
    };
  },

  analyze_design_reference: async (params: { url?: string; imageDescription?: string; rawBrief?: string }) => {
    const { analyzeDesignReference } = await import('./websiteEngine');
    const analysis = await analyzeDesignReference(params);
    return {
      success: true,
      creativeTone: analysis.creativeTone,
      palette: analysis.palette,
      typography: analysis.typography,
      layoutArchitecture: analysis.layoutArchitecture,
      microInteractions: analysis.microInteractions,
      conversionFeatures: analysis.conversionFeatures,
    };
  },

  execute_website_design_upgrade: async (params?: { scope?: string }) => {
    const { executeAutonomousWebsiteUpgrade } = await import('./websiteEngine');
    return await executeAutonomousWebsiteUpgrade(params?.scope);
  },

  // ── 9. TASK GOVERNANCE & ROLLBACK ─────────────────────────────────
  list_active_tasks: async (params?: { limit?: number }) => {
    const { getRecentManagedTasks } = await import('./taskEngine');
    const tasks = await getRecentManagedTasks(params?.limit || 10);
    return {
      success: true,
      count: tasks.length,
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        department: t.department,
        checksPassed: t.verification_checks.filter((c) => c.passed).length,
        totalChecks: t.verification_checks.length,
        updatedAt: t.updated_at,
      })),
    };
  },

  rollback_task: async (params: { taskId: string }) => {
    const { rollbackManagedTask } = await import('./taskEngine');
    return await rollbackManagedTask(params.taskId);
  },
};


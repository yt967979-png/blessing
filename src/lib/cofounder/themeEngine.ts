import { queryDb } from '@/lib/db';
import { getRedisClient } from '@/lib/redis';

export type StorefrontThemeId = 'default' | 'deepavali' | 'pongal' | 'new_year' | 'exam_season' | 'bookstore' | 'grand_launch';

export type NoticeSeverity = 'CRITICAL' | 'WARNING' | 'INFO' | 'PROMO' | 'FESTIVE';

export interface StorefrontThemeConfig {
  id: StorefrontThemeId;
  name: string;
  festivalName?: string;
  greeting: string;
  accentColor: string;
  secondaryColor: string;
  badgeText?: string;
  ambientEffect: 'none' | 'sparkles' | 'harvest' | 'stars' | 'focus';
  isActive: boolean;
  expiresAt?: string;
  scheduledRevertAt?: string;
}

export interface StorefrontAnnouncement {
  id: string;
  type: 'MAINTENANCE' | 'NOTICE' | 'PROMOTION' | 'POLICY' | 'THEME';
  severity: NoticeSeverity;
  content: string;
  expectedEnd?: string;
  expiresAt?: string;
  dismissible: boolean;
  scope: string;
}

import type { ExamCampaignPayload, ExamScheduleItem } from './researchEngine';
export type { ExamCampaignPayload, ExamScheduleItem } from './researchEngine';

export interface StorefrontContextPayload {
  theme: StorefrontThemeConfig;
  announcement: StorefrontAnnouncement | null;
  examCampaign?: ExamCampaignPayload | null;
  timestamp: number;
}

export const THEME_PRESETS: Record<StorefrontThemeId, Omit<StorefrontThemeConfig, 'isActive' | 'expiresAt' | 'scheduledRevertAt'>> = {
  default: {
    id: 'default',
    name: 'Standard Academic Excellence',
    greeting: 'Welcome to Blessing Power Guide — Tamil Nadu’s Premier 10th Standard Study Resources',
    accentColor: '#f59e0b', // Amber-500
    secondaryColor: '#0ea5e9', // Sky-500
    badgeText: 'Official Publisher',
    ambientEffect: 'none',
  },
  grand_launch: {
    id: 'grand_launch',
    name: 'Official 2026 Grand Storefront Launch',
    festivalName: 'Official Store Launch',
    greeting: '🚀 Welcome to the Official Launch of Blessing Power Guide! Tamil Nadu’s Premier 10th Standard 5-in-1 Combo Guides are now live with Free Fast Doorstep Delivery across all 38 districts!',
    accentColor: '#f59e0b', // Radiant Gold
    secondaryColor: '#10b981', // Emerald Success
    badgeText: '🚀 Official Grand Launch Live',
    ambientEffect: 'sparkles',
  },
  deepavali: {
    id: 'deepavali',
    name: 'Deepavali Festival of Lights',
    festivalName: 'Deepavali',
    greeting: '🪔 Happy Deepavali! May the light of knowledge bring 100% success in your Class 10 exams. Free doorstep delivery on all 5-in-1 Combo Box Sets! ✨',
    accentColor: '#f59e0b', // Golden Amber
    secondaryColor: '#d97706', // Rich Deep Gold
    badgeText: '🪔 Deepavali Special Edition',
    ambientEffect: 'sparkles',
  },
  pongal: {
    id: 'pongal',
    name: 'Pongal Harvest Festival',
    festivalName: 'Pongal',
    greeting: '🌾 Iniya Pongal Nalvazhthukkal! Celebrate with Tamil & English Medium 10th Study Guides. Free Doorstep Delivery across Tamil Nadu! ☀️',
    accentColor: '#eab308', // Harvest Gold
    secondaryColor: '#ca8a04', // Rich Harvest Sun
    badgeText: '🌾 Pongal Festival Offer',
    ambientEffect: 'harvest',
  },
  new_year: {
    id: 'new_year',
    name: 'New Year Academic Leap',
    festivalName: 'New Year',
    greeting: '✨ Happy New Year! Academic Success Pass: Free Doorstep Delivery on all 5-in-1 Combo Guides across Tamil Nadu.',
    accentColor: '#10b981', // Emerald
    secondaryColor: '#f59e0b', // Amber
    badgeText: '✨ New Year Academic Edition',
    ambientEffect: 'stars',
  },
  exam_season: {
    id: 'exam_season',
    name: 'Board Exam Revision Sprint',
    festivalName: 'Board Exam Season',
    greeting: '🎯 Tamil Nadu 10th Board Exam Prep Season: Master all 5 subjects with top-scoring Blessing Guides!',
    accentColor: '#0284c7', // Sky Blue
    secondaryColor: '#10b981', // Emerald
    badgeText: '🎯 Exam Revision Pass',
    ambientEffect: 'focus',
  },
  bookstore: {
    id: 'bookstore',
    name: 'Classic Academic Bookstore',
    greeting: '📖 Blessing Power Guide — Tamil Nadu’s Trusted Publisher of 10th Standard Academic Guides.',
    accentColor: '#b45309', // Classic Amber Bronze
    secondaryColor: '#78350f', // Deep Wood
    badgeText: 'Heritage Publisher',
    ambientEffect: 'none',
  },
};

// ── FAST IN-MEMORY CACHE FOR HIGH TRAFFIC (5-Second TTL) ─────────────────────
let memoryCache: { data: StorefrontContextPayload; expiresAt: number } | null = null;

export function invalidateStorefrontCache() {
  memoryCache = null;
  const redis = getRedisClient();
  if (redis) {
    redis.del('bpg:storefront_context').catch(() => {});
  }
}

/**
 * Activate a festive or promotional theme with automatic scheduling & reversibility.
 * Stores instruction in PostgreSQL `cofounder_instructions` table.
 */
export async function activateFestiveTheme(opts: {
  themeId: StorefrontThemeId;
  durationHours?: number;
  customGreeting?: string;
  scope?: string;
}): Promise<{ success: boolean; theme: StorefrontThemeConfig; expiresAt: Date }> {
  const { themeId, durationHours = 48, customGreeting } = opts;
  const preset = THEME_PRESETS[themeId] || THEME_PRESETS.default;

  const hours = Math.max(1, durationHours);
  const expiresAt = new Date(Date.now() + hours * 3600 * 1000);
  const id = `theme_${themeId}_${Date.now()}`;

  // 1. Deactivate existing active themes
  await queryDb(
    `UPDATE cofounder_instructions 
     SET is_active = false, updated_at = NOW() 
     WHERE instruction_type = 'THEME' AND is_active = true`
  ).catch(() => {});

  // 2. If activating default, just clearing active theme is sufficient
  if (themeId === 'default') {
    invalidateStorefrontCache();
    return {
      success: true,
      theme: { ...preset, isActive: true },
      expiresAt,
    };
  }

  const greeting = customGreeting || preset.greeting;
  const config = {
    ...preset,
    greeting,
    expiresAt: expiresAt.toISOString(),
  };

  // 3. Save new active theme in PostgreSQL
  await queryDb(
    `INSERT INTO cofounder_instructions (
      id, instruction_type, scope, content, expected_end, expires_at, is_active, severity, theme_id, theme_config, dismissible, created_at, updated_at
    ) VALUES ($1, 'THEME', $2, $3, $4, $5, true, 'FESTIVE', $6, $7, false, NOW(), NOW())`,
    [
      id,
      opts.scope || 'all',
      greeting,
      `${hours} hours (${expiresAt.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' })} IST)`,
      expiresAt.toISOString(),
      themeId,
      JSON.stringify(config),
    ]
  );

  invalidateStorefrontCache();

  return {
    success: true,
    theme: {
      ...preset,
      greeting,
      isActive: true,
      expiresAt: expiresAt.toISOString(),
      scheduledRevertAt: expiresAt.toISOString(),
    },
    expiresAt,
  };
}

/**
 * Reverts website theme to default. Safe, instant, reversible.
 */
export async function deactivateTheme(): Promise<boolean> {
  const res = await queryDb(
    `UPDATE cofounder_instructions 
     SET is_active = false, updated_at = NOW() 
     WHERE instruction_type = 'THEME' AND is_active = true`
  ).catch(() => ({ rowCount: 0 }));

  invalidateStorefrontCache();
  return (res.rowCount || 0) > 0;
}

/**
 * Retrieves the live active storefront context (theme + prioritized announcement).
 * Ultra-fast with Redis / in-memory layer so it never slows down page loads.
 */
export async function getActiveStorefrontContext(): Promise<StorefrontContextPayload> {
  const now = Date.now();
  if (memoryCache && memoryCache.expiresAt > now) {
    return memoryCache.data;
  }

  const redis = getRedisClient();
  if (redis) {
    try {
      const cachedStr = await redis.get('bpg:storefront_context');
      if (cachedStr) {
        const parsed = JSON.parse(cachedStr) as StorefrontContextPayload;
        memoryCache = { data: parsed, expiresAt: now + 1000 };
        return parsed;
      }
    } catch (_) {}
  }

  try {
    // 1. Auto-expire outdated instructions in PostgreSQL
    await queryDb(
      `UPDATE cofounder_instructions 
       SET is_active = false, updated_at = NOW() 
       WHERE is_active = true AND expires_at IS NOT NULL AND expires_at <= NOW()`
    ).catch(() => {});

    // 2. Fetch all active instructions
    const res = await queryDb(
      `SELECT id, instruction_type, scope, content, expected_end, expires_at, is_active, severity, theme_id, theme_config, dismissible, created_at
       FROM cofounder_instructions
       WHERE is_active = true
       ORDER BY created_at DESC`
    );

    const rows = res.rows || [];

    // Find active theme row
    const themeRow = rows.find((r) => r.instruction_type === 'THEME');
    let themeConfig: StorefrontThemeConfig;

    if (themeRow && themeRow.theme_id && THEME_PRESETS[themeRow.theme_id as StorefrontThemeId]) {
      const preset = THEME_PRESETS[themeRow.theme_id as StorefrontThemeId];
      const custom = themeRow.theme_config || {};
      themeConfig = {
        ...preset,
        ...custom,
        greeting: custom.greeting || themeRow.content || preset.greeting,
        isActive: true,
        expiresAt: themeRow.expires_at ? new Date(themeRow.expires_at).toISOString() : undefined,
        scheduledRevertAt: themeRow.expires_at ? new Date(themeRow.expires_at).toISOString() : undefined,
      };
    } else {
      themeConfig = {
        ...THEME_PRESETS.default,
        isActive: true,
      };
    }

    // Check for active EXAM_CAMPAIGN
    const examRow = rows.find((r) => r.instruction_type === 'EXAM_CAMPAIGN');
    let examCampaign: ExamCampaignPayload | null = null;
    if (examRow) {
      try {
        examCampaign = typeof examRow.theme_config === 'string'
          ? JSON.parse(examRow.theme_config)
          : (examRow.theme_config as any);
      } catch (_) {}
    }

    // Filter announcement rows (exclude THEME and EXAM_CAMPAIGN)
    const announcementRows = rows.filter((r) => r.instruction_type !== 'THEME' && r.instruction_type !== 'EXAM_CAMPAIGN');

    // Severity rank: CRITICAL > WARNING > INFO > PROMO > FESTIVE
    const severityRank: Record<string, number> = {
      CRITICAL: 1,
      WARNING: 2,
      INFO: 3,
      PROMO: 4,
      FESTIVE: 5,
    };

    announcementRows.sort((a, b) => {
      const sA = severityRank[a.severity || 'INFO'] || 99;
      const sB = severityRank[b.severity || 'INFO'] || 99;
      return sA - sB;
    });

    let activeAnnouncement: StorefrontAnnouncement | null = null;
    if (announcementRows.length > 0) {
      const top = announcementRows[0];
      activeAnnouncement = {
        id: top.id,
        type: top.instruction_type as any,
        severity: (top.severity as NoticeSeverity) || (top.instruction_type === 'MAINTENANCE' ? 'CRITICAL' : 'INFO'),
        content: top.content,
        expectedEnd: top.expected_end || undefined,
        expiresAt: top.expires_at ? new Date(top.expires_at).toISOString() : undefined,
        dismissible: top.dismissible !== false,
        scope: top.scope || 'all',
      };
    }

    const payload: StorefrontContextPayload = {
      theme: themeConfig,
      announcement: activeAnnouncement,
      examCampaign,
      timestamp: now,
    };

    if (redis) {
      redis.set('bpg:storefront_context', JSON.stringify(payload), 'EX', 30).catch(() => {});
    }

    memoryCache = {
      data: payload,
      expiresAt: now + 1000, // 1 second fast fallback
    };

    return payload;
  } catch (err) {
    console.warn('[themeEngine] Failed to load storefront context:', err);
    return {
      theme: { ...THEME_PRESETS.default, isActive: true },
      announcement: null,
      timestamp: now,
    };
  }
}

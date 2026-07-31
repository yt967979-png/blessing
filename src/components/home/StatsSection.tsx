'use client';

import React, { useEffect, useState } from 'react';
import { Users, School, BookMarked, Star } from 'lucide-react';

interface LiveStats {
  students: number;
  books: number;
  avgRating: number;
  orders: number;
}

// Format counts for display (e.g. 1000 → "1,000+")
function fmtCount(n: number, suffix = '+'): string {
  if (n <= 0) return '—';
  return n.toLocaleString('en-IN') + suffix;
}

export const StatsSection = () => {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    // Public endpoints only — /api/db-status is admin-only (security).
    Promise.all([
      fetch('/api/products').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/reviews').then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([products, reviews]) => {
      const ratingList: number[] = Array.isArray(reviews)
        ? reviews.map((r: { rating?: number }) => Number(r.rating || 5))
        : [];
      const avgRating =
        ratingList.length > 0
          ? ratingList.reduce((a, b) => a + b, 0) / ratingList.length
          : 5.0;

      setStats({
        students: 0,
        books: Array.isArray(products) ? products.length : 0,
        orders: 0,
        avgRating: Math.min(5, Number(avgRating.toFixed(1))),
      });
    });
  }, []);

  const items = [
    {
      icon: Users,
      value: stats
        ? stats.students > 0
          ? stats.students >= 100
            ? fmtCount(Math.floor(stats.students / 100) * 100)
            : fmtCount(stats.students, '')
          : '—'
        : '…',
      label: 'Registered Customers',
    },
    {
      icon: School,
      value: '6th–12th',
      label: 'Classes Covered',
    },
    {
      icon: BookMarked,
      value: stats
        ? stats.books > 0
          ? fmtCount(stats.books)
          : '—'
        : '…',
      label: 'Guide Titles',
    },
    {
      icon: Star,
      value: stats
        ? stats.avgRating > 0
          ? `${stats.avgRating} / 5.0`
          : '—'
        : '…',
      label: 'Average Rating',
    },
  ];

  return (
    <section className="py-12 bg-gradient-to-r from-[#001B3A] to-[#003B73] text-white">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
          {items.map((item) => (
            <div key={item.label}>
              <item.icon className="w-8 h-8 text-amber-400 mx-auto mb-2" />
              <div
                className={`font-heading font-black text-3xl md:text-4xl text-amber-300 transition-all duration-700 ${
                  stats ? 'opacity-100' : 'opacity-40 blur-sm'
                }`}
              >
                {item.value}
              </div>
              <div className="text-xs font-semibold text-slate-300 mt-1 uppercase tracking-wider">
                {item.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

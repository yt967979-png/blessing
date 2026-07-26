'use client';

import React, { useEffect, useState } from 'react';
import { Users, School, BookMarked, Star } from 'lucide-react';

interface LiveStats {
  students: number;
  books: number;
  avgRating: number;
  orders: number;
}

// Format large numbers: 10000 → "10,000+"
function fmtCount(n: number, suffix = '+'): string {
  if (n <= 0) return '—';
  return n.toLocaleString('en-IN') + suffix;
}

export const StatsSection = () => {
  const [stats, setStats] = useState<LiveStats | null>(null);

  useEffect(() => {
    // Fetch live counts from DB status + reviews endpoints in parallel
    Promise.all([
      fetch('/api/db-status').then((r) => r.json()).catch(() => null),
      fetch('/api/reviews').then((r) => r.json()).catch(() => []),
    ]).then(([dbData, reviews]) => {
      const counts = dbData?.tableRowCounts || {};
      const ratingList: number[] = Array.isArray(reviews) ? reviews.map((r: { rating?: number }) => Number(r.rating || 5)) : [];
      const avgRating = ratingList.length > 0
        ? ratingList.reduce((a, b) => a + b, 0) / ratingList.length
        : 5.0;

      setStats({
        students: Number(counts.users  || 0),
        books:    Number(counts.books  || 0),
        orders:   Number(counts.orders || 0),
        avgRating: Math.min(5, Number(avgRating.toFixed(1))),
      });
    });
  }, []);

  const items = [
    {
      icon: Users,
      // Show real user count; floor to nearest 100 and add "+" so it looks credible
      value: stats
        ? stats.students >= 100
          ? fmtCount(Math.floor(stats.students / 100) * 100)
          : stats.students > 0
          ? fmtCount(stats.students)
          : '10,000+'          // brand baseline while DB is empty
        : '10,000+',
      label: 'Happy Students',
    },
    {
      icon: School,
      // Partner schools — keep as brand constant (not in DB)
      value: '500+',
      label: 'Partner Schools',
    },
    {
      icon: BookMarked,
      value: stats
        ? stats.books > 0
          ? fmtCount(stats.books)
          : '50+'
        : '50+',
      label: 'Guide Titles',
    },
    {
      icon: Star,
      value: stats ? `${stats.avgRating} / 5.0` : '4.9 / 5.0',
      label: 'Student Rating',
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

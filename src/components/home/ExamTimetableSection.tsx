'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Calendar,
  Clock,
  BookOpen,
  Award,
  Sparkles,
  Printer,
  Share2,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  ShoppingBag,
  ExternalLink,
  Search,
  X,
  FileText,
  ShieldCheck,
  Flame,
  Check,
} from 'lucide-react';
import { StorefrontContextPayload, ExamCampaignPayload, ExamScheduleItem } from '@/lib/cofounder/themeEngine';
import { useStore } from '@/context/StoreContext';
import { imageNeedsUnoptimized } from '@/lib/productImage';

export const ExamTimetableSection: React.FC<{ forceShow?: boolean }> = ({ forceShow = false }) => {
  const [context, setContext] = useState<StorefrontContextPayload | null>(null);
  const [activeStandard, setActiveStandard] = useState<'10th' | '12th'>('10th');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [isAddingToCart, setIsAddingToCart] = useState(false);
  const { setSelectedClass, addToCart, products } = useStore();

  // Fetch live storefront context (themes + active exam campaign)
  useEffect(() => {
    let isMounted = true;
    const fetchContext = async () => {
      try {
        const res = await fetch('/api/cofounder/storefront-context', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok && isMounted) {
          const data: StorefrontContextPayload = await res.json();
          setContext(data);
          if (data.examCampaign?.defaultStandard) {
            setActiveStandard(data.examCampaign.defaultStandard);
          }
        }
      } catch (_) {}
    };
    fetchContext();
    return () => {
      isMounted = false;
    };
  }, []);

  const campaign: ExamCampaignPayload | undefined | null = context?.examCampaign;

  // Determine target date for the active standard's first exam
  const targetDate = useMemo(() => {
    const schedule = campaign?.schedule || [];
    const standardPapers = schedule.filter((s) => s.standard === activeStandard);
    if (standardPapers.length > 0) {
      return new Date(`${standardPapers[0].date}T10:00:00+05:30`).getTime();
    }
    if (campaign?.startDate) {
      return new Date(campaign.startDate).getTime();
    }
    return activeStandard === '10th'
      ? new Date('2026-03-27T10:00:00+05:30').getTime()
      : new Date('2026-03-02T10:00:00+05:30').getTime();
  }, [campaign, activeStandard]);

  // Live countdown state
  const [timeLeft, setTimeLeft] = useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  }>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const calc = () => {
      const now = Date.now();
      const diff = Math.max(0, targetDate - now);
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const minutes = Math.floor((diff / (1000 * 60)) % 60);
      const seconds = Math.floor((diff / 1000) % 60);
      setTimeLeft({ days, hours, minutes, seconds });
    };
    calc();
    const timer = setInterval(calc, 1000);
    return () => clearInterval(timer);
  }, [targetDate]);

  // Identify next upcoming paper title
  const nextTargetPaper = useMemo(() => {
    const schedule = campaign?.schedule || [];
    const standardPapers = schedule.filter((s) => s.standard === activeStandard);
    if (standardPapers.length > 0) {
      const first = standardPapers[0];
      const d = new Date(first.date);
      const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric', year: 'numeric' });
      return `${first.subject.split('(')[0].trim()} • ${dateStr}`;
    }
    return activeStandard === '10th' ? 'Part-I Language (Tamil) • Mar 27, 2026' : 'Part-I Language • Mar 2, 2026';
  }, [campaign, activeStandard]);

  // Find 10th combo product in store context
  const comboProduct = useMemo(() => {
    return (
      products.find(
        (p) =>
          (p.title.toLowerCase().includes('5 in 1') || p.title.toLowerCase().includes('combo')) &&
          p.title.toLowerCase().includes('10th')
      ) || null
    );
  }, [products]);

  // If campaign is not active and not forceShow, don't render
  if (!forceShow && (!campaign || !campaign.isActive)) {
    return null;
  }

  const scheduleList: ExamScheduleItem[] = campaign?.schedule || [];

  const filteredSchedule = scheduleList
    .filter((item) => item.standard === activeStandard)
    .filter((item) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase().trim();
      return (
        item.subject.toLowerCase().includes(q) ||
        (item.subjectTa && item.subjectTa.toLowerCase().includes(q)) ||
        item.code.toLowerCase().includes(q) ||
        item.day.toLowerCase().includes(q)
      );
    });

  const handlePrint = () => {
    window.print();
  };

  const handleShare = async () => {
    const shareUrl =
      typeof window !== 'undefined'
        ? `${window.location.origin}/exam-timetable`
        : 'https://blessingpowerguide.in/exam-timetable';
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Tamil Nadu 10th & 12th Board Public Exam Timetable 2026–2027',
          text: 'Official TN DGE Board Exam Timetable, Countdown & Centum Revision Guides by Blessing Power Guide',
          url: shareUrl,
        });
      } catch (_) {}
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 3000);
      } catch (_) {}
    }
  };

  const handleQuickAddCombo = () => {
    if (comboProduct) {
      setIsAddingToCart(true);
      addToCart(comboProduct, 1);
      setTimeout(() => setIsAddingToCart(false), 1200);
    } else {
      setSelectedClass('Class 10');
      const el = document.getElementById('products');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <section
      id="exam-timetable"
      className="relative w-full max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-10 z-20 scroll-mt-20 font-sans"
    >
      {/* ── PRINT-SPECIFIC HIGH-CONTRAST STYLESHEET ────────────────────────────── */}
      <style jsx global>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #print-timetable-desk-sheet,
          #print-timetable-desk-sheet * {
            visibility: visible !important;
          }
          #print-timetable-desk-sheet {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 20px !important;
            background: #ffffff !important;
            color: #000000 !important;
            display: block !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* ── PRINTABLE DESK TIMETABLE SHEET (RENDERED ON PRINT) ──────────────────── */}
      <div id="print-timetable-desk-sheet" className="hidden print:block text-black">
        <div className="border-b-2 border-black pb-4 mb-6 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-black uppercase tracking-wider">
              BLESSING POWER GUIDE — TAMIL NADU PUBLIC EXAMINATION TIMETABLE
            </h1>
            <p className="text-sm font-semibold text-gray-700 mt-1">
              {activeStandard === '10th' ? '10TH STANDARD (SSLC)' : '12TH STANDARD (HSC)'} — ACADEMIC YEAR {campaign?.academicYear || '2026–2027'}
            </p>
            <p className="text-xs text-gray-500">
              Official Directorate of Government Examinations (DGE) Tamil Nadu Notification
            </p>
          </div>
          <div className="text-right text-xs">
            <p className="font-bold">Printed: {new Date().toLocaleDateString('en-IN')}</p>
            <p className="text-gray-600">Daily Timing: 10:00 AM – 1:15 PM</p>
          </div>
        </div>

        <div className="mb-4 grid grid-cols-2 gap-4 p-3 border border-gray-400 text-xs">
          <div>
            <span className="font-bold">Student Name:</span> ____________________________________
          </div>
          <div>
            <span className="font-bold">Exam Roll Number:</span> ____________________________________
          </div>
          <div>
            <span className="font-bold">School Name:</span> ____________________________________
          </div>
          <div>
            <span className="font-bold">Examination Centre:</span> ____________________________________
          </div>
        </div>

        <table className="w-full text-left border-collapse text-xs mt-4">
          <thead>
            <tr className="border-y-2 border-black bg-gray-100">
              <th className="p-2.5 font-bold">DATE</th>
              <th className="p-2.5 font-bold">DAY</th>
              <th className="p-2.5 font-bold">TIME</th>
              <th className="p-2.5 font-bold">CODE</th>
              <th className="p-2.5 font-bold">SUBJECT NAME</th>
              <th className="p-2.5 font-bold">REVISION FOCUS</th>
            </tr>
          </thead>
          <tbody>
            {filteredSchedule.map((item, idx) => (
              <tr key={idx} className="border-b border-gray-300">
                <td className="p-2.5 font-bold">{item.date}</td>
                <td className="p-2.5">{item.day}</td>
                <td className="p-2.5">{item.time}</td>
                <td className="p-2.5 font-mono">{item.code}</td>
                <td className="p-2.5 font-semibold">
                  {item.subject}
                  {item.subjectTa && <span className="block text-[11px] text-gray-600">{item.subjectTa}</span>}
                </td>
                <td className="p-2.5 text-[11px] text-gray-700">{item.keyTips}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-8 pt-4 border-t border-gray-400 flex justify-between items-center text-xs text-gray-600">
          <p>Timing Breakdown: 10:00–10:10 AM Reading • 10:10–10:15 AM Verification • 10:15 AM–1:15 PM Writing</p>
          <p className="font-bold text-black">Blessing Power Guide Centum Revision Partner (blessingpowerguide.in)</p>
        </div>
      </div>

      {/* ── MAIN INTERACTIVE STOREFRONT PANEL ──────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl border border-sky-500/25 bg-gradient-to-br from-[#071321] via-[#0a182b] to-[#040b14] p-5 sm:p-8 lg:p-10 shadow-[0_20px_70px_rgba(2,132,199,0.18)]">
        {/* Ambient Top & Bottom Lighting */}
        <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-full rounded-full bg-sky-600/5 blur-[120px]" />

        {/* ── 1. HEADER WITH BADGES & ACTIONS ─────────────────────────────────── */}
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 sm:pb-8 border-b border-white/10">
          <div className="max-w-3xl">
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-sky-500/15 border border-sky-400/30 text-sky-300 text-xs font-black uppercase tracking-wider shadow-sm">
                <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                <span>TN DGE OFFICIAL NOTIFICATION</span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-400/25 text-emerald-300 text-[11px] font-bold">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>SAMACHEER KALVI {campaign?.academicYear || '2026–2027'}</span>
              </span>
            </div>

            {/* Main Editorial Heading */}
            <h2 className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-white tracking-tight leading-snug">
              {campaign?.title || 'Tamil Nadu Board Public Examination Timetable'}
            </h2>
            <p className="mt-1.5 text-xs sm:text-sm md:text-base text-sky-200/90 font-medium leading-relaxed">
              {campaign?.titleTa || '10 மற்றும் 12-ஆம் வகுப்பு பொதுத்தேர்வு கால அட்டவணை மற்றும் சென்டம் கையேடு'}
            </p>
          </div>

          {/* Action Buttons: Print & Share */}
          <div className="no-print flex items-center gap-2.5 self-start md:self-center shrink-0">
            <button
              onClick={handlePrint}
              className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white border border-white/20 text-xs sm:text-sm font-semibold transition-all shadow-sm active:scale-95 hover:border-sky-400/40"
              title="Print clean Study Desk Timetable Sheet"
            >
              <Printer className="w-4 h-4 text-sky-300" />
              <span>Print Schedule</span>
            </button>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-sky-600 to-sky-500 hover:from-sky-500 hover:to-sky-400 text-white text-xs sm:text-sm font-bold transition-all shadow-md active:scale-95"
              title="Share timetable link"
            >
              <Share2 className="w-4 h-4" />
              <span>{copiedLink ? 'Link Copied!' : 'Share Timetable'}</span>
            </button>
          </div>
        </div>

        {/* ── 2. VISUALLY PROMINENT COUNTDOWN TIMER ───────────────────────────── */}
        <div className="relative z-10 py-6 border-b border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="flex items-center gap-3.5">
            <div className="p-3.5 rounded-2xl bg-gradient-to-br from-sky-500/20 to-sky-600/10 border border-sky-400/30 text-sky-300 shrink-0 shadow-inner">
              <Clock className="w-6 h-6 animate-pulse text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-xs font-extrabold text-sky-300 uppercase tracking-wider">
                <Flame className="w-3.5 h-3.5 text-amber-400" />
                <span>Public Examination Countdown</span>
              </div>
              <div className="text-sm sm:text-base text-white font-bold mt-0.5">
                Next Target: <span className="text-amber-300 font-semibold">{nextTargetPaper}</span>
              </div>
            </div>
          </div>

          {/* 4 Distinct Glow Countdown Numerals */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-md w-full">
            <div className="flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl bg-[#030912]/80 border border-sky-500/30 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
              <span className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-amber-400 tabular-nums">
                {String(timeLeft.days).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider mt-0.5">
                Days
              </span>
            </div>
            <div className="flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl bg-[#030912]/80 border border-sky-500/30 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
              <span className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-sky-400 tabular-nums">
                {String(timeLeft.hours).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider mt-0.5">
                Hours
              </span>
            </div>
            <div className="flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl bg-[#030912]/80 border border-sky-500/30 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
              <span className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-emerald-400 tabular-nums">
                {String(timeLeft.minutes).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider mt-0.5">
                Mins
              </span>
            </div>
            <div className="flex flex-col items-center justify-center py-2.5 px-2 rounded-2xl bg-[#030912]/80 border border-sky-500/30 shadow-[0_4px_16px_rgba(0,0,0,0.4)]">
              <span className="font-heading font-black text-2xl sm:text-3xl lg:text-4xl text-rose-400 tabular-nums">
                {String(timeLeft.seconds).padStart(2, '0')}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 uppercase font-bold tracking-wider mt-0.5">
                Secs
              </span>
            </div>
          </div>
        </div>

        {/* ── 3. STANDARD SELECTOR & LIVE SUBJECT SEARCH ───────────────────────── */}
        <div className="no-print relative z-10 pt-6 pb-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
          {/* 10th vs 12th Segmented Tabs */}
          <div className="inline-flex p-1.5 rounded-2xl bg-white/[0.06] border border-white/10 shadow-inner self-start">
            <button
              onClick={() => setActiveStandard('10th')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                activeStandard === '10th'
                  ? 'bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>10th Standard (SSLC)</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  activeStandard === '10th' ? 'bg-sky-400/25 text-white' : 'bg-white/10 text-slate-400'
                }`}
              >
                6 Papers
              </span>
            </button>
            <button
              onClick={() => setActiveStandard('12th')}
              className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs sm:text-sm font-black transition-all ${
                activeStandard === '12th'
                  ? 'bg-gradient-to-r from-sky-600 to-sky-500 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>12th Standard (+2 HSC)</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${
                  activeStandard === '12th' ? 'bg-sky-400/25 text-white' : 'bg-white/10 text-slate-400'
                }`}
              >
                7 Core Papers
              </span>
            </button>
          </div>

          {/* Quick Search Input */}
          <div className="relative max-w-sm w-full">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search subject (e.g. Maths, Science, தமிழ்)..."
              className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-white/[0.05] border border-white/15 text-white placeholder-slate-400 text-xs sm:text-sm focus:outline-none focus:border-sky-400 focus:bg-white/[0.08] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-white transition-colors"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* ── 4. OFFICIAL DGE TIMING PROTOCOL BAR ──────────────────────────────── */}
        <div className="relative z-10 my-4 p-4 rounded-2xl bg-sky-950/40 border border-sky-400/20 text-xs sm:text-sm text-sky-200/90 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-sky-400 shrink-0" />
            <span className="font-black text-white uppercase tracking-wide text-xs">Official Daily Schedule:</span>
            <span className="font-semibold text-sky-100">10:00 AM – 1:15 PM (Total: 3h 15m)</span>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono text-sky-300">
            <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/20">
              10:00–10:10 AM Reading (10m)
            </span>
            <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/20">
              10:10–10:15 AM Verification (5m)
            </span>
            <span className="px-2 py-0.5 rounded bg-sky-500/15 border border-sky-400/20">
              10:15 AM–1:15 PM Writing (3h)
            </span>
          </div>
        </div>

        {/* ── 5. SUBJECT-WISE EXAMINATION CARDS ────────────────────────────────── */}
        <div className="relative z-10 space-y-3.5 mt-4">
          {filteredSchedule.length === 0 ? (
            <div className="p-10 text-center rounded-2xl bg-white/[0.02] border border-white/10 text-slate-400">
              <BookOpen className="w-8 h-8 text-slate-500 mx-auto mb-2 opacity-50" />
              <p className="text-sm font-semibold">No subjects found matching &ldquo;{searchQuery}&rdquo;</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-xs text-sky-400 hover:underline font-bold"
              >
                Reset search filter
              </button>
            </div>
          ) : (
            filteredSchedule.map((item, idx) => {
              const dateObj = new Date(item.date);
              const dayNum = dateObj.getDate();
              const monthStr = dateObj.toLocaleString('en-IN', { month: 'short' }).toUpperCase();
              const is10th = item.standard === '10th';

              return (
                <div
                  key={`${item.standard}_${item.code}_${idx}`}
                  className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-sky-500/40 transition-all p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 group shadow-sm"
                >
                  {/* Left & Centre Container */}
                  <div className="flex items-start sm:items-center gap-4">
                    {/* Distinct Calendar Date Badge */}
                    <div className="flex flex-col items-center justify-center h-16 w-16 sm:h-20 sm:w-20 rounded-2xl bg-gradient-to-br from-sky-500/25 to-sky-700/15 border border-sky-400/40 text-white shrink-0 shadow-md group-hover:border-sky-300 transition-colors">
                      <span className="text-[10px] sm:text-xs font-black text-sky-300 uppercase tracking-wider">
                        {monthStr}
                      </span>
                      <span className="font-heading font-black text-2xl sm:text-3xl text-white leading-none my-0.5">
                        {dayNum}
                      </span>
                      <span className="text-[9px] sm:text-[10px] font-bold text-slate-300 uppercase">
                        {item.day.slice(0, 3)}
                      </span>
                    </div>

                    {/* Subject Information */}
                    <div>
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <span className="px-2 py-0.5 rounded-md bg-white/10 text-sky-200 text-[10px] font-mono font-bold border border-white/10">
                          CODE {item.code}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-sky-500/10 text-sky-400 text-[10px] font-semibold border border-sky-400/20">
                          {item.time}
                        </span>
                        <span className="text-[10px] text-slate-400 font-semibold">{item.session} Session</span>
                      </div>
                      <h3 className="font-heading font-black text-base sm:text-lg text-white group-hover:text-sky-300 transition-colors">
                        {item.subject}
                      </h3>
                      {item.subjectTa && (
                        <p className="text-xs sm:text-sm text-sky-200/90 font-medium mt-0.5">
                          {item.subjectTa}
                        </p>
                      )}
                      {item.keyTips && (
                        <p className="text-xs text-slate-300/80 mt-1.5 flex items-start sm:items-center gap-1.5 leading-relaxed">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
                          <span>
                            <strong className="text-slate-200 font-semibold">Centum Tip:</strong> {item.keyTips}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Right: Companion 5-in-1 Combo Action */}
                  {is10th && (
                    <div className="no-print shrink-0 flex items-center gap-2 pt-3 md:pt-0 border-t md:border-t-0 border-white/10">
                      <button
                        onClick={handleQuickAddCombo}
                        className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/30 text-amber-300 hover:text-white text-xs sm:text-sm font-bold transition-all shadow-sm group/btn active:scale-95"
                        title="Solved in Blessing 10th 5-in-1 Combo Guide"
                      >
                        <BookOpen className="w-4 h-4 text-amber-400 group-hover/btn:scale-110 transition-transform" />
                        <span>Solved in 5-in-1 Combo</span>
                        <ChevronRight className="w-3.5 h-3.5 opacity-70 group-hover/btn:translate-x-0.5 transition-transform" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* ── 6. REAL BPG PRODUCT PROMOTION (10TH 5-IN-1 COMBO SHOWCASE) ──────── */}
        {activeStandard === '10th' && (
          <div className="no-print relative z-10 mt-10 p-6 sm:p-8 rounded-3xl bg-gradient-to-r from-amber-500/15 via-amber-600/10 to-transparent border border-amber-400/35 flex flex-col lg:flex-row items-center justify-between gap-6 shadow-[0_10px_40px_rgba(245,158,11,0.12)]">
            {/* Real 3D Book Cover Image */}
            <div className="relative w-36 h-48 sm:w-44 sm:h-56 shrink-0 rounded-2xl overflow-hidden shadow-2xl border border-amber-400/40 bg-slate-950 p-2">
              <Image
                src="/uploads/catalog/img-1790146292664-eqgiz5.webp"
                alt="Blessing 10th Standard 5 in 1 Complete Guide Combo Box"
                fill
                className="object-contain p-1"
                sizes="(max-width: 640px) 144px, 176px"
                unoptimized={imageNeedsUnoptimized('/uploads/catalog/img-1790146292664-eqgiz5.webp')}
              />
              <span className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow">
                COMBO SET
              </span>
            </div>

            {/* Product Copy & USPs */}
            <div className="max-w-xl text-center lg:text-left">
              <div className="inline-flex items-center gap-1.5 text-amber-300 text-xs font-black uppercase tracking-wider mb-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>OFFICIAL CENTUM REVISION PARTNER</span>
              </div>
              <h4 className="font-heading font-black text-xl sm:text-2xl text-white">
                Blessing 10th Standard 5-in-1 Complete Guide Combo Box
              </h4>
              <p className="mt-1.5 text-xs sm:text-sm text-slate-300 leading-relaxed">
                All 5 subjects in one comprehensive box set: <strong className="text-white">Tamil, English, Maths, Science & Social Science</strong>.
                Includes QR code video solutions for tough questions, official PTA model question papers, and centum formula sheets.
              </p>
              <div className="mt-3.5 flex flex-wrap justify-center lg:justify-start gap-2 text-xs font-semibold">
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/25 text-amber-200">
                  ✓ Free Express Delivery (ST Courier)
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/25 text-amber-200">
                  ✓ Tamil & English Medium
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-amber-400/10 border border-amber-400/25 text-amber-200">
                  ✓ 100% Exam-Oriented
                </span>
              </div>
            </div>

            {/* Price & CTA Action */}
            <div className="flex flex-col items-center lg:items-end gap-3 shrink-0">
              <div className="text-center lg:text-right">
                <div className="text-xs text-slate-400 line-through">MRP ₹1,650</div>
                <div className="font-heading font-black text-3xl sm:text-4xl text-amber-400">
                  ₹1,300
                </div>
                <div className="text-[11px] text-emerald-400 font-bold">All 5 Books Included • Save ₹350</div>
              </div>

              <button
                onClick={handleQuickAddCombo}
                disabled={isAddingToCart}
                className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm tracking-wide transition-all shadow-[0_4px_24px_rgba(245,158,11,0.4)] active:scale-95 disabled:opacity-75"
              >
                {isAddingToCart ? (
                  <>
                    <Check className="w-4 h-4 text-slate-950" />
                    <span>Added to Cart!</span>
                  </>
                ) : (
                  <>
                    <ShoppingBag className="w-4 h-4 text-slate-950" />
                    <span>Order 5-in-1 Combo (₹1,300)</span>
                  </>
                )}
              </button>

              <Link
                href="/products/10th-std-5-in-1-guide-combo-copy-725369"
                className="text-xs text-amber-300/80 hover:text-white underline transition-colors"
              >
                View Full Book Specifications →
              </Link>
            </div>
          </div>
        )}

        {/* ── 7. OFFICIAL SOURCE & TRANSPARENCY ATTRIBUTION ────────────────────── */}
        <div className="relative z-10 mt-10 pt-5 border-t border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Timetable Source:{' '}
            <a
              href="https://www.dge.tn.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-300 font-bold hover:underline inline-flex items-center gap-1"
            >
              <span>{campaign?.officialSource || 'Directorate of Government Examinations (DGE), Government of Tamil Nadu'}</span>
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="block text-[11px] text-slate-500 mt-0.5">
              Verified on {new Date().toLocaleDateString('en-IN')}. Refer to official DGE circulars for subsequent revisions.
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs font-medium">
            <Link href="/help" className="hover:text-sky-300 transition-colors underline decoration-sky-500/40">
              Exam Help & Support
            </Link>
            <span>•</span>
            <Link href="/track" className="hover:text-sky-300 transition-colors underline decoration-sky-500/40">
              Track Book Order
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
};

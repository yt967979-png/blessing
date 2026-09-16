'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Star, Trash2, MessageSquare, Search, RefreshCw, ExternalLink, ThumbsUp, Image as ImageIcon } from 'lucide-react';
import { authHeaders } from '@/lib/clientAuth';
import type { UserData } from '@/context/StoreContext';
import Link from 'next/link';

type AdminReview = {
  id: string;
  bookId: string;
  bookTitle: string;
  userName: string;
  userEmail: string;
  studentName: string;
  rating: number;
  comment: string;
  images?: string[];
  helpfulCount?: number;
  verifiedPurchase?: boolean;
  createdAt: string;
};

export default function AdminReviewsTab({
  user,
  showToast,
}: {
  user: UserData;
  showToast: (msg: string) => void;
}) {
  const [reviews, setReviews] = useState<AdminReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [ratingFilter, setRatingFilter] = useState<number | 'all'>('all');
  const [photosOnly, setPhotosOnly] = useState(false);

  const load = useCallback(async () => {
    if (!user?.token) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const r = await fetch('/api/reviews?admin=1', {
        headers: authHeaders(user),
        signal: AbortSignal.timeout(20000),
      });
      if (r.ok) {
        const data = await r.json();
        if (Array.isArray(data)) setReviews(data);
      } else {
        showToast('❌ Could not load reviews');
        setReviews([]);
      }
    } catch {
      showToast('❌ Could not load reviews');
      setReviews([]);
    } finally {
      setLoading(false);
    }
  }, [user, showToast]);

  useEffect(() => {
    void load();
  }, [load]);

  const remove = async (id: string) => {
    if (!confirm('Delete this review permanently?')) return;
    setDeletingId(id);
    try {
      const r = await fetch(`/api/reviews?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(user),
      });
      if (r.ok) {
        setReviews((prev) => prev.filter((rev) => rev.id !== id));
        showToast('✅ Review deleted');
      } else {
        const d = await r.json();
        showToast(`❌ ${d.error || 'Delete failed'}`);
      }
    } catch {
      showToast('❌ Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const filteredReviews = useMemo(() => {
    return reviews.filter((rev) => {
      if (ratingFilter !== 'all' && rev.rating !== ratingFilter) return false;
      if (photosOnly && (!rev.images || rev.images.length === 0)) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = (rev.bookTitle || '').toLowerCase().includes(q);
        const matchName = (rev.studentName || rev.userName || '').toLowerCase().includes(q);
        const matchEmail = (rev.userEmail || '').toLowerCase().includes(q);
        const matchComment = (rev.comment || '').toLowerCase().includes(q);
        if (!matchTitle && !matchName && !matchEmail && !matchComment) return false;
      }
      return true;
    });
  }, [reviews, ratingFilter, photosOnly, searchQuery]);

  const avgRating = useMemo(() => {
    if (!reviews.length) return 0;
    const sum = reviews.reduce((acc, r) => acc + Number(r.rating || 0), 0);
    return (sum / reviews.length).toFixed(1);
  }, [reviews]);

  const fiveStarCount = useMemo(() => {
    return reviews.filter((r) => r.rating === 5).length;
  }, [reviews]);

  return (
    <div className="space-y-4">
      {/* Header & Stats Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-[#2874f0]" />
              Verified Review Moderation & Quality Control
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage student ratings, review photos, and maintain customer trust
            </p>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="self-start sm:self-auto px-3.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* Quick KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-5 border-t border-slate-100">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/60">
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Total Reviews</span>
            <span className="text-lg font-black text-slate-900">{reviews.length}</span>
          </div>
          <div className="bg-amber-50/60 p-3 rounded-xl border border-amber-200/60">
            <span className="text-[10px] font-bold text-amber-700 uppercase tracking-wider block">Average Rating</span>
            <div className="flex items-center gap-1 text-amber-900">
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="text-lg font-black">{avgRating} / 5</span>
            </div>
          </div>
          <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-200/60">
            <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">5-Star Reviews</span>
            <span className="text-lg font-black text-emerald-900">
              {fiveStarCount} {reviews.length > 0 ? `(${Math.round((fiveStarCount / reviews.length) * 100)}%)` : ''}
            </span>
          </div>
          <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-200/60">
            <span className="text-[10px] font-bold text-purple-700 uppercase tracking-wider block">With Student Photos</span>
            <span className="text-lg font-black text-purple-900">
              {reviews.filter((r) => r.images && r.images.length > 0).length}
            </span>
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by student, book, comment..."
            className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-[#2874f0] focus:bg-white text-slate-900 font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 flex-wrap w-full sm:w-auto justify-start sm:justify-end">
          <button
            type="button"
            onClick={() => setRatingFilter('all')}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
              ratingFilter === 'all' ? 'bg-[#2874f0] text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All ({reviews.length})
          </button>
          {[5, 4, 3, 2, 1].map((star) => {
            const count = reviews.filter((r) => r.rating === star).length;
            return (
              <button
                key={star}
                type="button"
                onClick={() => setRatingFilter(star)}
                className={`px-2.5 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                  ratingFilter === star
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{star}</span>
                <Star className={`w-3 h-3 ${ratingFilter === star ? 'fill-white text-white' : 'fill-amber-400 text-amber-400'}`} />
                <span className="text-[10px] opacity-80">({count})</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setPhotosOnly(!photosOnly)}
            className={`px-3 py-1.5 text-xs font-bold rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
              photosOnly ? 'bg-purple-600 text-white shadow-xs' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Photos</span>
          </button>
        </div>
      </div>

      {/* Review List */}
      <div className="space-y-3">
        {loading ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#2874f0]" />
            Loading verified reviews…
          </div>
        ) : filteredReviews.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
            <Star className="w-10 h-10 mx-auto mb-2 text-slate-300" />
            <p className="text-sm font-bold text-slate-700">No reviews found matching filters</p>
            <p className="text-xs text-slate-400 mt-1">Try resetting your search query or rating filter.</p>
          </div>
        ) : (
          filteredReviews.map((rev) => (
            <div key={rev.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:border-slate-300 transition-all">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-slate-900">{rev.studentName || rev.userName}</span>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200">
                      Verified Purchase
                    </span>
                    <span className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3.5 h-3.5 ${i < rev.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`}
                        />
                      ))}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      {rev.createdAt
                        ? new Date(rev.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="text-xs font-bold text-[#2874f0]">{rev.bookTitle}</span>
                    <Link
                      href={`/products/${rev.bookId}`}
                      target="_blank"
                      className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-slate-500 hover:text-blue-600 transition-colors"
                    >
                      <span>View Book</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>

                  <p className="text-xs text-slate-700 mt-2.5 leading-relaxed bg-slate-50/70 p-3 rounded-xl border border-slate-100">
                    &ldquo;{rev.comment}&rdquo;
                  </p>

                  {rev.images && rev.images.length > 0 && (
                    <div className="flex gap-2.5 mt-3 flex-wrap">
                      {rev.images.map((img, idx) => (
                        <a key={idx} href={img} target="_blank" rel="noopener noreferrer">
                          <img
                            src={img}
                            alt=""
                            className="w-14 h-14 object-cover rounded-xl border border-slate-200 hover:opacity-90 hover:scale-105 transition-transform"
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-4 mt-3 text-[11px] text-slate-400 flex-wrap">
                    <span>Account: {rev.userEmail || 'Guest Student'}</span>
                    {Number(rev.helpfulCount || 0) > 0 && (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">
                        <ThumbsUp className="w-3 h-3" />
                        <span>{rev.helpfulCount} students found this helpful</span>
                      </span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  disabled={deletingId === rev.id}
                  onClick={() => void remove(rev.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-red-600 bg-red-50 hover:bg-red-100 rounded-xl cursor-pointer disabled:opacity-50 shrink-0 self-start transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingId === rev.id ? 'Deleting…' : 'Delete'}</span>
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

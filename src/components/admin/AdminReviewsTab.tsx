'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Star, Trash2, MessageSquare } from 'lucide-react';
import { authHeaders } from '@/lib/clientAuth';
import type { UserData } from '@/context/StoreContext';

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
  }, [user?.token, user?.id, showToast]);

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

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-[#2874f0]" />
          Review moderation
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">
          {reviews.length} verified customer reviews — remove spam or inappropriate content
        </p>
      </div>

      <div className="space-y-3">
        {loading ? (
          <p className="text-center text-sm text-gray-400 py-12">Loading reviews…</p>
        ) : reviews.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <Star className="w-10 h-10 mx-auto mb-2 text-gray-300" />
            <p className="text-sm text-gray-500">No reviews yet</p>
          </div>
        ) : (
          reviews.map((rev) => (
            <div key={rev.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-bold text-gray-900">{rev.studentName || rev.userName}</span>
                    <span className="flex items-center gap-0.5 text-amber-500">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star
                          key={i}
                          className={`w-3 h-3 ${i < rev.rating ? 'fill-amber-400' : 'text-gray-200'}`}
                        />
                      ))}
                    </span>
                    <span className="text-[10px] text-gray-400">
                      {rev.createdAt
                        ? new Date(rev.createdAt).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : ''}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#2874f0] mt-1">{rev.bookTitle}</p>
                  <p className="text-xs text-gray-600 mt-2 leading-relaxed">{rev.comment}</p>
                  {rev.images && rev.images.length > 0 && (
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {rev.images.map((img) => (
                        <img
                          key={img}
                          src={img}
                          alt=""
                          className="w-12 h-12 object-cover rounded-lg border border-gray-200"
                        />
                      ))}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 mt-2">{rev.userEmail}</p>
                </div>
                <button
                  type="button"
                  disabled={deletingId === rev.id}
                  onClick={() => void remove(rev.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg cursor-pointer disabled:opacity-50 shrink-0 self-start"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {deletingId === rev.id ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

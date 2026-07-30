'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, User, Phone, ShieldCheck, AlertCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { BrandLogo } from '@/components/ui/BrandLogo';
import { isValidMobileNumber, normalizeMobileDigits } from '@/lib/authValidation';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: Record<string, unknown>) => void;
          renderButton: (el: HTMLElement, config: Record<string, unknown>) => void;
          prompt: () => void;
        };
      };
    };
  }
}

type Step = 'google' | 'profile';

export function GoogleAuthModal({
  onClose,
  forceProfileStep = false,
}: {
  onClose: () => void;
  forceProfileStep?: boolean;
}) {
  const router = useRouter();
  const { loginUser, showToast, user } = useStore();
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '';

  const [step, setStep] = useState<Step>(forceProfileStep ? 'profile' : 'google');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(user?.token || null);

  useEffect(() => {
    if (forceProfileStep && user) {
      setProfileName(user.name || '');
      setSessionToken(user.token || null);
      setStep('profile');
    }
  }, [forceProfileStep, user]);

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setIsSubmitting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        const data = await res.json();
        if (!res.ok || data.error) {
          setAuthError(data.error || 'Google sign-in failed.');
          return;
        }

        // Ask name + number only when profile is incomplete
        if (data.user?.needsProfile) {
          setProfileName(data.user.name || '');
          setProfilePhone('');
          setSessionToken(data.user.token || null);
          setStep('profile');
          return;
        }

        loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
        onClose();
        if (data.user?.role === 'admin') router.push('/admin');
      } catch {
        setAuthError('Connection error. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [loginUser, onClose, router]
  );

  useEffect(() => {
    if (!clientId || step !== 'google') return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (response: { credential?: string }) => {
          if (response.credential) void handleGoogleCredential(response.credential);
        },
        auto_select: false,
      });
      googleBtnRef.current.innerHTML = '';
      window.google.accounts.id.renderButton(googleBtnRef.current, {
        type: 'standard',
        theme: 'filled_blue',
        size: 'large',
        shape: 'pill',
        text: 'continue_with',
        width: 320,
      });
    };

    if (window.google?.accounts?.id) {
      initGoogle();
      return;
    }

    const existing = document.querySelector('script[data-bpg-google-gsi]');
    if (existing) {
      existing.addEventListener('load', initGoogle);
      return () => existing.removeEventListener('load', initGoogle);
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.dataset.bpgGoogleGsi = '1';
    script.onload = initGoogle;
    document.head.appendChild(script);
  }, [clientId, step, handleGoogleCredential]);

  const submitProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!profileName.trim() || profileName.trim().length < 2) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!isValidMobileNumber(profilePhone)) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/complete-profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          name: profileName.trim(),
          phone: normalizeMobileDigits(profilePhone),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAuthError(data.error || 'Could not save details.');
        return;
      }
      loginUser(data.user, data.cart || [], data.wishlist || [], []);
      showToast('✓ Profile saved — you can shop and get WhatsApp order updates!');
      onClose();
      if (data.user?.role === 'admin') router.push('/admin');
    } catch {
      setAuthError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto"
    >
      <motion.div
        initial={{ y: 48, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 48, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full relative shadow-2xl border border-slate-100 overflow-hidden"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        <div className="sm:hidden w-12 h-1 rounded-full bg-slate-200 mx-auto mt-3" />

        <div className="bg-gradient-to-r from-[#001B3A] via-[#002B5B] to-[#0044AA] text-white p-5 sm:p-6 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center touch-target"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <BrandLogo size={32} className="w-8 h-8 shadow-md" />
            <span className="font-heading font-black text-xs text-amber-300 tracking-wider uppercase">
              BLESSING POWER GUIDE
            </span>
          </div>
          <h3 className="font-heading font-black text-xl text-white">
            {step === 'google' ? 'Continue with Google' : 'Enter your name & number'}
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            {step === 'google'
              ? 'Sign in with Google to continue'
              : 'Required for COD orders and WhatsApp delivery updates'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {authError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-600 font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {step === 'google' ? (
            <>
              {!clientId ? (
                <div className="text-center text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  Google Sign-In is not configured. Contact support or set{' '}
                  <code className="text-[10px]">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code>.
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-2">
                  <div ref={googleBtnRef} className="min-h-[44px] flex items-center justify-center" />
                  {isSubmitting && (
                    <p className="text-xs text-slate-500 font-medium">Signing in with Google…</p>
                  )}
                </div>
              )}
              <ul className="text-[11px] text-slate-500 space-y-1.5 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <li>• Sign in with your Google account</li>
                <li>• First time only: enter name &amp; WhatsApp number</li>
                <li>• You stay signed in — cart &amp; orders saved</li>
              </ul>
            </>
          ) : (
            <form onSubmit={submitProfile} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1" htmlFor="profile-name">
                  Full name *
                </label>
                <div className="relative">
                  <input
                    id="profile-name"
                    type="text"
                    required
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1" htmlFor="profile-phone">
                  Mobile number (WhatsApp) *
                </label>
                <div className="relative">
                  <input
                    id="profile-phone"
                    type="tel"
                    required
                    placeholder="e.g. 9840418228"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  For order updates &amp; delivery — not used for login OTP.
                </p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md uppercase tracking-wider disabled:opacity-50"
              >
                {isSubmitting ? 'SAVING…' : 'SAVE & CONTINUE SHOPPING'}
              </button>
            </form>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Secured sign-in via Google only</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { X, User, Phone, ShieldCheck, AlertCircle, KeyRound, MessageSquare, ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { BrandLogo } from '@/components/ui/BrandLogo';

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

type AuthMode = 'otp_register' | 'phone_login' | 'google';

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

  const [mode, setMode] = useState<AuthMode>('otp_register');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Google Fallback
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
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          setAuthError(data.error || 'Google sign-in failed. Please try again.');
          return;
        }

        loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
        onClose();
        if (data.user?.role === 'admin' || data.user?.role === 'super_admin') router.push('/admin');
      } catch {
        setAuthError('Connection error. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [loginUser, onClose, router]
  );

  useEffect(() => {
    if (!clientId || mode !== 'google') return;
    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (res: { credential?: string }) => {
            if (res?.credential) void handleGoogleCredential(res.credential);
          },
          auto_select: false,
        });
        googleBtnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          theme: 'outline',
          size: 'large',
          width: 280,
          text: 'continue_with',
          shape: 'pill',
        });
      } catch (_) {}
    };

    if (window.google?.accounts?.id) {
      initGoogle();
    } else {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initGoogle;
      document.head.appendChild(script);
    }
  }, [clientId, handleGoogleCredential, mode]);

  // Request WhatsApp OTP
  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Failed to send OTP.');
        return;
      }
      setOtpSent(true);
      showToast('💬 WhatsApp OTP sent to your phone!');
    } catch {
      setAuthError('Network error sending OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify OTP & Register
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!otpCode || otpCode.length !== 6) {
      setAuthError('Please enter the 6-digit OTP code sent on WhatsApp.');
      return;
    }
    if (!password || password.length < 4) {
      setAuthError('Please set a password (min 4 characters).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          otp: otpCode,
          name: name || 'Verified Student',
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'OTP verification failed.');
        return;
      }

      loginUser(data.user, [], [], []);
      showToast('🎉 Account registered successfully!');
      onClose();
      if (data.user?.role === 'admin' || data.user?.role === 'super_admin') router.push('/admin');
    } catch {
      setAuthError('Network error verifying OTP.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Phone + Password Login
  const handlePhonePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!password) {
      setAuthError('Please enter your password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/login-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Login failed.');
        return;
      }

      loginUser(data.user, [], [], []);
      showToast('🔑 Logged in successfully!');
      onClose();
      if (data.user?.role === 'admin' || data.user?.role === 'super_admin') router.push('/admin');
    } catch {
      setAuthError('Network error during login.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md overflow-hidden bg-white shadow-2xl rounded-3xl border border-slate-200"
      >
        {/* Header Banner */}
        <div className="relative bg-gradient-to-br from-[#002B66] to-[#0044AA] p-6 text-white text-center">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="inline-flex p-3 mb-3 bg-white/10 rounded-2xl border border-white/20 backdrop-blur-md">
            <BrandLogo size={36} />
          </div>
          <h2 className="text-xl font-black tracking-tight">Blessing Power Guide</h2>
          <p className="text-xs text-blue-100 mt-1">
            {mode === 'otp_register' ? 'WhatsApp OTP Fast Registration' : mode === 'phone_login' ? 'Phone & Password Sign In' : 'Google Sign In'}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => { setMode('otp_register'); setAuthError(null); }}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${
              mode === 'otp_register' ? 'border-[#0044AA] text-[#0044AA] bg-white' : 'border-transparent hover:text-slate-900'
            }`}
          >
            💬 WhatsApp OTP
          </button>
          <button
            type="button"
            onClick={() => { setMode('phone_login'); setAuthError(null); }}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${
              mode === 'phone_login' ? 'border-[#0044AA] text-[#0044AA] bg-white' : 'border-transparent hover:text-slate-900'
            }`}
          >
            🔑 Phone Login
          </button>
          <button
            type="button"
            onClick={() => { setMode('google'); setAuthError(null); }}
            className={`flex-1 py-3 text-center border-b-2 transition-all ${
              mode === 'google' ? 'border-[#0044AA] text-[#0044AA] bg-white' : 'border-transparent hover:text-slate-900'
            }`}
          >
            🌐 Google
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {authError && (
            <div className="flex items-start gap-2.5 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {/* Mode 1: WhatsApp OTP Registration */}
          {mode === 'otp_register' && (
            <>
              {!otpSent ? (
                <form onSubmit={handleSendOtp} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Full Name</label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="e.g. Ramesh Kumar"
                        className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">WhatsApp Mobile Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="10-digit mobile number"
                        className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#0044AA] hover:bg-[#003388] active:bg-[#002266] text-white font-extrabold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{isSubmitting ? 'Sending OTP…' : 'Send WhatsApp OTP'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-3.5">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>OTP sent to <strong>+91 {phone}</strong> on WhatsApp.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">6-Digit WhatsApp OTP Code</label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="Enter 6-digit code"
                        className="w-full pl-9 pr-3 py-2.5 text-xs font-mono text-center tracking-widest text-lg border border-slate-300 rounded-xl outline-none focus:border-[#0044AA]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Set Password</label>
                    <div className="relative">
                      <KeyRound className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Min 4 characters"
                        className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-extrabold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
                  >
                    <span>{isSubmitting ? 'Verifying…' : 'Verify & Register Account'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <button
                    type="button"
                    onClick={() => setOtpSent(false)}
                    className="w-full text-center text-xs text-slate-500 hover:text-slate-800"
                  >
                    Change phone number
                  </button>
                </form>
              )}
            </>
          )}

          {/* Mode 2: Phone & Password Login */}
          {mode === 'phone_login' && (
            <form onSubmit={handlePhonePasswordLogin} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile number"
                    className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Password</label>
                <div className="relative">
                  <KeyRound className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <input
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0044AA] hover:bg-[#003388] active:bg-[#002266] text-white font-extrabold text-xs py-3 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md disabled:opacity-50"
              >
                <span>{isSubmitting ? 'Signing In…' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}

          {/* Mode 3: Google Sign-In */}
          {mode === 'google' && (
            <div className="flex flex-col items-center justify-center py-4 space-y-4">
              <p className="text-xs text-slate-500 text-center">Sign in using your Google Account for fast 1-tap authentication.</p>
              <div ref={googleBtnRef} className="min-h-[44px]" />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>256-Bit Encrypted & Verified Authentication</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

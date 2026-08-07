'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  User,
  Phone,
  ShieldCheck,
  AlertCircle,
  KeyRound,
  Mail,
  ArrowRight,
  ChevronDown,
  Eye,
  EyeOff,
  Check,
} from 'lucide-react';
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

type Step = 'auth' | 'profile';
type EmailMode = 'login' | 'register';

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

  const [step, setStep] = useState<Step>(forceProfileStep ? 'profile' : 'auth');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [emailMode, setEmailMode] = useState<EmailMode>('login');

  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [sessionToken, setSessionToken] = useState<string | null>(user?.token || null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const profileIncomplete = Boolean(user?.needsProfile) || forceProfileStep;

  useEffect(() => {
    if (user && !user.needsProfile && !forceProfileStep && step !== 'profile') {
      onClose();
    }
  }, [user, forceProfileStep, onClose, step]);

  useEffect(() => {
    if ((forceProfileStep || user?.needsProfile) && user) {
      setProfileName(user.name || '');
      setSessionToken(user.token || null);
      setStep('profile');
    }
  }, [forceProfileStep, user]);

  const finishAuth = useCallback(
    (data: { user: any; cart?: any[]; wishlist?: any[]; addresses?: any[] }) => {
      loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
      onClose();
      if (data.user?.role === 'admin' || data.user?.role === 'super_admin') {
        router.push('/admin');
      }
    },
    [loginUser, onClose, router]
  );

  const handleGoogleCredential = useCallback(
    async (credential: string) => {
      setIsSubmitting(true);
      setAuthError(null);
      try {
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.error) {
          setAuthError(data.error || 'Google sign-in failed. Please try again.');
          return;
        }

        if (data.user?.needsProfile) {
          loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
          setProfileName(data.user.name || '');
          setProfilePhone('');
          setSessionToken(data.user.token || null);
          setStep('profile');
          return;
        }

        finishAuth(data);
      } catch {
        setAuthError('Connection error. Please try again.');
      } finally {
        setIsSubmitting(false);
      }
    },
    [finishAuth, loginUser]
  );

  useEffect(() => {
    if (!clientId || step !== 'auth') return;

    const initGoogle = () => {
      if (!window.google?.accounts?.id || !googleBtnRef.current) return;
      try {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response: { credential?: string }) => {
            if (response.credential) void handleGoogleCredential(response.credential);
          },
          auto_select: false,
        });
        googleBtnRef.current.innerHTML = '';
        const width = Math.min(320, Math.max(240, googleBtnRef.current.clientWidth || 320));
        window.google.accounts.id.renderButton(googleBtnRef.current, {
          type: 'standard',
          theme: 'filled_blue',
          size: 'large',
          shape: 'pill',
          text: 'continue_with',
          width,
        });
      } catch {
        /* ignore GSI render errors */
      }
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
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        },
        body: JSON.stringify({
          name: profileName.trim(),
          phone: normalizeMobileDigits(profilePhone),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        setAuthError(data.error || 'Could not save details.');
        return;
      }
      finishAuth(data);
    } catch {
      setAuthError('Network error. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!name || name.trim().length < 2) {
      setAuthError('Please enter your full name.');
      return;
    }
    if (!isValidMobileNumber(phone)) {
      setAuthError('Please enter a valid 10-digit mobile number.');
      return;
    }
    if (!password || password.length < 4) {
      setAuthError('Password must be at least 4 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setAuthError('Passwords do not match. Please verify your entry.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: normalizeMobileDigits(phone),
          password,
          confirmPassword,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(data.error || 'Registration failed.');
        return;
      }
      finishAuth(data);
    } catch {
      setAuthError('Network error during registration. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!phone) {
      setAuthError('Please enter your email or phone number.');
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
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
        return;
      }

      if (data.user?.needsProfile) {
        loginUser(data.user, data.cart || [], data.wishlist || [], data.addresses || []);
        setProfileName(data.user.name || '');
        setProfilePhone('');
        setSessionToken(data.user.token || null);
        setStep('profile');
        return;
      }

      finishAuth(data);
    } catch {
      setAuthError('Network error during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRequestClose = () => {
    if (step === 'profile' && profileIncomplete) {
      showToast('Add your mobile number to place orders.');
    }
    onClose();
  };

  return (
    <div
      onClick={handleRequestClose}
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
            onClick={handleRequestClose}
            className="absolute top-3 right-3 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center touch-target"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-2">
            <BrandLogo size={32} className="w-8 h-8 shadow-md" />
            <span className="font-heading font-black text-xs text-amber-300 tracking-wider uppercase">
              Blessing Power Guide
            </span>
          </div>
          <h3 className="font-heading font-black text-xl text-white">
            {step === 'auth' ? 'Continue with Google' : 'Complete your profile'}
          </h3>
          <p className="text-xs text-slate-300 mt-1">
            {step === 'auth'
              ? 'Fast sign-in for students & parents — then add your mobile for delivery'
              : 'Name and mobile number are required for shipping and order updates'}
          </p>
        </div>

        <div className="p-6 space-y-4">
          {authError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-600 font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          {step === 'auth' ? (
            <>
              {!clientId ? (
                <div className="text-center text-sm text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  Google Sign-In is not configured yet. Add{' '}
                  <code className="text-xs bg-white px-1 rounded">NEXT_PUBLIC_GOOGLE_CLIENT_ID</code> in
                  your server env.
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-1 w-full">
                  <div ref={googleBtnRef} className="min-h-[44px] w-full flex items-center justify-center" />
                  {isSubmitting && (
                    <p className="text-xs text-slate-500 font-medium">Signing in with Google…</p>
                  )}
                </div>
              )}

              <ul className="text-[11px] text-slate-500 space-y-1.5 bg-slate-50 rounded-xl p-3 border border-slate-100">
                <li>• One-tap Google sign-in — no password to remember</li>
                <li>• New accounts: add name + 10-digit mobile next</li>
                <li>• Used for delivery contact on Razorpay orders</li>
              </ul>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    or use email
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowEmailForm((v) => !v);
                  setAuthError(null);
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0044AA] py-2"
              >
                <Mail className="w-3.5 h-3.5" />
                <span>{showEmailForm ? 'Hide email & password' : 'Sign in / register with email'}</span>
                <ChevronDown
                  className={`w-3.5 h-3.5 transition-transform ${showEmailForm ? 'rotate-180' : ''}`}
                />
              </button>

              {showEmailForm && (
                <div className="space-y-3 border border-slate-200 rounded-2xl p-3.5 bg-slate-50/80">
                  <div className="flex rounded-xl bg-white border border-slate-200 p-0.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('login');
                        setAuthError(null);
                      }}
                      className={`flex-1 py-2 rounded-lg transition-colors ${
                        emailMode === 'login' ? 'bg-[#0044AA] text-white' : 'text-slate-600'
                      }`}
                    >
                      Sign in
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEmailMode('register');
                        setAuthError(null);
                      }}
                      className={`flex-1 py-2 rounded-lg transition-colors ${
                        emailMode === 'register' ? 'bg-[#0044AA] text-white' : 'text-slate-600'
                      }`}
                    >
                      Register
                    </button>
                  </div>

                  {emailMode === 'register' ? (
                    <form onSubmit={handleRegister} className="space-y-2.5">
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder="Full name"
                          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] bg-white"
                        />
                      </div>
                      <div className="relative">
                        <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="email"
                          required
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="Email address"
                          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] bg-white"
                        />
                      </div>
                      <div className="relative">
                        <Phone className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                          placeholder="10-digit mobile"
                          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] bg-white"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            type={showPassword ? 'text' : 'password'}
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Create Password (min 6 chars)"
                            className="w-full pl-9 pr-9 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] bg-white font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                        <div className="relative">
                          <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                          <input
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Confirm Password"
                            className="w-full pl-9 pr-9 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] bg-white font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => setShowConfirmPassword((v) => !v)}
                            className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          >
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>

                      {password.length > 0 && (
                        <div className="bg-slate-100/90 border border-slate-200/80 rounded-xl p-2.5 space-y-1 text-[10px]">
                          <p className="font-bold text-slate-600 mb-1">Password Requirements:</p>
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                                password.length >= 6 ? 'bg-emerald-500 text-white' : 'bg-slate-300 text-slate-600'
                              }`}
                            >
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                            <span className={password.length >= 6 ? 'text-emerald-700 font-semibold' : 'text-slate-500'}>
                              At least 6 characters
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <div
                              className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                                /[A-Za-z]/.test(password) && /[0-9]/.test(password)
                                  ? 'bg-emerald-500 text-white'
                                  : 'bg-slate-300 text-slate-600'
                              }`}
                            >
                              <Check className="w-2.5 h-2.5 stroke-[3]" />
                            </div>
                            <span
                              className={
                                /[A-Za-z]/.test(password) && /[0-9]/.test(password)
                                  ? 'text-emerald-700 font-semibold'
                                  : 'text-slate-500'
                              }
                            >
                              Contains letter &amp; number
                            </span>
                          </div>
                          {confirmPassword.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <div
                                className={`w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors ${
                                  password === confirmPassword ? 'bg-emerald-500 text-white' : 'bg-amber-400 text-white'
                                }`}
                              >
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                              <span
                                className={
                                  password === confirmPassword
                                    ? 'text-emerald-700 font-semibold'
                                    : 'text-amber-700 font-semibold'
                                }
                              >
                                {password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-[#0044AA] hover:bg-[#003388] text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors shadow-md shadow-blue-900/10 cursor-pointer"
                      >
                        <span>{isSubmitting ? 'Registering…' : 'Create account'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  ) : (
                    <form onSubmit={handleLogin} className="space-y-2.5">
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type="text"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="Email or mobile number"
                          className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] bg-white font-medium"
                        />
                      </div>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          placeholder="Password"
                          className="w-full pl-9 pr-9 py-2 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] bg-white font-medium"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 focus:outline-none cursor-pointer"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full bg-[#0044AA] hover:bg-[#003388] text-white font-bold text-xs py-2.5 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 transition-colors shadow-md shadow-blue-900/10 cursor-pointer"
                      >
                        <span>{isSubmitting ? 'Signing in…' : 'Sign in'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  )}
                </div>
              )}
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
                  Mobile number *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">+91</span>
                  <input
                    id="profile-phone"
                    type="tel"
                    required
                    inputMode="numeric"
                    placeholder="9840418228"
                    value={profilePhone}
                    onChange={(e) => setProfilePhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    className="w-full pl-12 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-blue-600 font-medium"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  10-digit Indian mobile — used for shipping contact. No OTP.
                </p>
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-500 hover:to-amber-600 text-[#001B3A] font-extrabold text-xs py-3.5 rounded-xl shadow-md uppercase tracking-wider disabled:opacity-50"
              >
                {isSubmitting ? 'Saving…' : 'Save & continue'}
              </button>
            </form>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[10px] text-slate-400 font-semibold">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>Secured sign-in · SSL encrypted</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

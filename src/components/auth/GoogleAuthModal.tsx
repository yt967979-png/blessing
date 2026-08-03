'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, User, Phone, ShieldCheck, AlertCircle, KeyRound, MessageSquare, ArrowRight, Check, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/StoreContext';
import { BrandLogo } from '@/components/ui/BrandLogo';

type AuthMode = 'otp_register' | 'phone_login';

export function GoogleAuthModal({
  onClose,
}: {
  onClose: () => void;
  forceProfileStep?: boolean;
}) {
  const router = useRouter();
  const { loginUser, showToast } = useStore();

  const [mode, setMode] = useState<AuthMode>('otp_register');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);

  // Resend Timer State
  const [resendTimer, setResendTimer] = useState(30);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (otpSent && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [otpSent, resendTimer]);

  // Request WhatsApp OTP
  const handleSendOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setAuthError(null);

    const clean = phone.replace(/\D/g, '');
    if (clean.length < 10) {
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
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: clean }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Failed to dispatch verification code.');
        return;
      }
      setOtpSent(true);
      setResendTimer(30);
      showToast('📩 Verification code dispatched to your WhatsApp number.');
    } catch {
      setAuthError('Network error while requesting verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify OTP & Register
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    if (!otpCode || otpCode.length !== 6) {
      setAuthError('Please enter the valid 6-digit verification code.');
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
        setAuthError(data.error || 'Verification code failed.');
        return;
      }

      loginUser(data.user, [], [], []);
      showToast('🎉 Account registered successfully!');
      onClose();
      if (data.user?.role === 'admin' || data.user?.role === 'super_admin') router.push('/admin');
    } catch {
      setAuthError('Network error during verification.');
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
      setAuthError('Please enter your account password.');
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
        setAuthError(data.error || 'Authentication failed.');
        return;
      }

      loginUser(data.user, [], [], []);
      showToast('🔑 Authenticated successfully.');
      onClose();
      if (data.user?.role === 'admin' || data.user?.role === 'super_admin') router.push('/admin');
    } catch {
      setAuthError('Network error during authentication.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditDetails = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOtpSent(false);
    setAuthError(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md overflow-hidden bg-white shadow-2xl rounded-3xl border border-slate-200"
      >
        {/* Header Banner */}
        <div className="relative bg-gradient-to-br from-[#001B3A] via-[#002B66] to-[#0044AA] p-6 text-white text-center">
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
          <p className="text-xs text-blue-200 mt-1 font-medium">
            {mode === 'otp_register' ? 'Official Student & Parent Portal' : 'Account Authentication'}
          </p>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-600">
          <button
            type="button"
            onClick={() => { setMode('otp_register'); setAuthError(null); setOtpSent(false); }}
            className={`flex-1 py-3.5 text-center border-b-2 transition-all ${
              mode === 'otp_register' ? 'border-[#0044AA] text-[#0044AA] bg-white font-extrabold shadow-xs' : 'border-transparent hover:text-slate-900'
            }`}
          >
            WhatsApp Verification
          </button>
          <button
            type="button"
            onClick={() => { setMode('phone_login'); setAuthError(null); }}
            className={`flex-1 py-3.5 text-center border-b-2 transition-all ${
              mode === 'phone_login' ? 'border-[#0044AA] text-[#0044AA] bg-white font-extrabold shadow-xs' : 'border-transparent hover:text-slate-900'
            }`}
          >
            Account Sign In
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          {authError && (
            <div className="flex items-start gap-2.5 p-3 text-xs text-red-700 bg-red-50 border border-red-200 rounded-xl font-medium">
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
                        placeholder="Enter your full name"
                        className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Mobile Number (WhatsApp Enabled)</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter 10-digit mobile number"
                        className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
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
                          className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Confirm Password</label>
                      <div className="relative">
                        <KeyRound className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                        <input
                          type="password"
                          required
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter password"
                          className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full mt-2 bg-[#0044AA] hover:bg-[#003388] active:bg-[#002266] text-white font-black text-xs py-3.5 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 disabled:opacity-50 transition-all hover:scale-[1.01]"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>{isSubmitting ? 'Dispatching Code…' : 'Send Verification Code'}</span>
                  </button>
                </form>
              ) : (
                <form onSubmit={handleVerifyOtp} className="space-y-3.5">
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs flex items-center gap-2 font-medium">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Verification code sent to <strong>+91 {phone}</strong> via WhatsApp.</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">6-Digit Verification Code</label>
                    <div className="relative">
                      <ShieldCheck className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                      <input
                        type="text"
                        required
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value)}
                        placeholder="Enter 6-digit code"
                        className="w-full pl-9 pr-3 py-2.5 text-xs font-mono text-center tracking-widest text-lg border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] focus:ring-2 focus:ring-blue-100"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-black text-xs py-3.5 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-emerald-700/20 disabled:opacity-50 transition-all hover:scale-[1.01]"
                  >
                    <span>{isSubmitting ? 'Verifying…' : 'Verify & Complete Registration'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>

                  <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-100">
                    <button
                      type="button"
                      disabled={resendTimer > 0 || isSubmitting}
                      onClick={() => void handleSendOtp()}
                      className="inline-flex items-center gap-1 font-semibold text-[#0044AA] hover:text-[#002266] disabled:text-slate-400 disabled:cursor-not-allowed"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                      <span>{resendTimer > 0 ? `Resend Code (${resendTimer}s)` : 'Resend Code'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleEditDetails}
                      className="font-medium text-slate-500 hover:text-slate-800 underline underline-offset-2"
                    >
                      Edit details
                    </button>
                  </div>
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
                    placeholder="Enter 10-digit mobile number"
                    className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] focus:ring-2 focus:ring-blue-100"
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
                    placeholder="Enter your account password"
                    className="w-full pl-9 pr-3 py-2.5 text-xs border border-slate-300 rounded-xl outline-none focus:border-[#0044AA] focus:ring-2 focus:ring-blue-100"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-[#0044AA] hover:bg-[#003388] active:bg-[#002266] text-white font-black text-xs py-3.5 rounded-xl uppercase tracking-wider flex items-center justify-center gap-2 shadow-md shadow-blue-900/20 disabled:opacity-50 transition-all hover:scale-[1.01]"
              >
                <span>{isSubmitting ? 'Authenticating…' : 'Sign In to Account'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 text-center">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span>🔒 256-Bit SSL Encrypted & Secured Authentication</span>
          </p>
        </div>
      </motion.div>
    </div>
  );
}

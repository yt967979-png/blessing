'use client';

import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2, AlertCircle, Smartphone } from 'lucide-react';

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

function MobileAuthContent() {
  const searchParams = useSearchParams();
  const state = searchParams.get('state') || '';
  const btnRef = useRef<HTMLDivElement>(null);

  const [clientId, setClientId] = useState(
    process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || ''
  );
  const [status, setStatus] = useState<'ready' | 'verifying' | 'success' | 'error'>('ready');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState<string>('');

  useEffect(() => {
    fetch('/api/admin/mobile-auth')
      .then((r) => r.json())
      .then((d) => {
        if (d?.clientId) setClientId(d.clientId.trim());
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!clientId) return;

    const handleCredential = async (response: { credential?: string }) => {
      if (!response?.credential) return;
      setStatus('verifying');
      setErrorMsg(null);
      try {
        const res = await fetch('/api/admin/mobile-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ credential: response.credential, state }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          setStatus('error');
          setErrorMsg(
            data.error || 'Access Restricted: Only Administrator accounts are allowed.'
          );
          return;
        }
        setAdminEmail(data.user?.email || 'Admin');
        setStatus('success');

        // Trigger Android intent to bring Blessing Admin APK back to foreground
        setTimeout(() => {
          window.location.href =
            'intent://auth#Intent;scheme=blessingadmin;package=in.blessingpowerguide.blessing_admin;end';
        }, 600);
      } catch {
        setStatus('error');
        setErrorMsg('Network error verifying Google account. Please try again.');
      }
    };

    const initGsi = () => {
      if (!window.google?.accounts?.id || !btnRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: handleCredential,
        auto_select: false,
      });
      window.google.accounts.id.renderButton(btnRef.current, {
        theme: 'outline',
        size: 'large',
        width: 300,
        text: 'continue_with',
        shape: 'pill',
      });
      window.google.accounts.id.prompt();
    };

    if (window.google?.accounts?.id) {
      initGsi();
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = initGsi;
    document.head.appendChild(script);
  }, [clientId, state]);

  return (
    <div className="min-h-screen bg-[#001B3A] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-[#0A192F] border border-white/10 rounded-3xl p-8 shadow-2xl text-center">
        <div className="w-24 h-24 rounded-full bg-black border-2 border-[#FFB703]/40 flex items-center justify-center mx-auto mb-5 shadow-[0_8px_32px_rgba(255,183,3,0.3)] overflow-hidden">
          <img
            src="/logo.png?v=4"
            alt="Blessing Power Guide"
            className="w-full h-full object-contain"
          />
        </div>

        <h1 className="text-2xl font-black tracking-tight text-white">
          Blessing Admin Sign-In
        </h1>
        <p className="text-xs font-bold uppercase tracking-wider text-[#FFB703] mt-1">
          Android Operations Hub Authentication
        </p>

        {status === 'success' ? (
          <div className="mt-8 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-6">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <h2 className="text-lg font-extrabold text-white">
              Admin Verified!
            </h2>
            <p className="text-sm text-slate-300 mt-1">{adminEmail}</p>
            <p className="text-xs text-emerald-300 mt-4 font-semibold">
              You are now signed in! Switch back to the Blessing Admin app on your phone.
            </p>
            <a
              href="intent://auth#Intent;scheme=blessingadmin;package=in.blessingpowerguide.blessing_admin;end"
              className="mt-5 inline-flex items-center justify-center gap-2 w-full py-3.5 px-5 rounded-xl bg-[#FFB703] text-[#001B3A] font-black text-sm"
            >
              <Smartphone className="w-4 h-4" />
              Return to Blessing Admin App
            </a>
          </div>
        ) : (
          <div className="mt-8">
            <p className="text-sm text-slate-300 mb-6">
              Select your authorized Google Administrator account below to sign in to the Android app:
            </p>

            {errorMsg && (
              <div className="mb-5 p-3.5 rounded-xl bg-red-500/15 border border-red-500/40 flex items-start gap-2.5 text-left">
                <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                <span className="text-xs font-semibold text-red-300">
                  {errorMsg}
                </span>
              </div>
            )}

            <div className="flex justify-center min-h-[50px]">
              <div ref={btnRef} />
            </div>

            {status === 'verifying' && (
              <p className="text-xs text-[#FFB703] font-bold mt-4 animate-pulse">
                Verifying Administrator permissions...
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function MobileAuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#001B3A] text-white flex items-center justify-center">
          Loading...
        </div>
      }
    >
      <MobileAuthContent />
    </Suspense>
  );
}


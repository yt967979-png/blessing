'use client';

import React, { useEffect, useState } from 'react';
import { StorefrontContextPayload } from '@/lib/cofounder/themeEngine';

export const FestiveThemeOverlay: React.FC = () => {
  const [themeId, setThemeId] = useState<string>('default');
  const [ambientEffect, setAmbientEffect] = useState<string>('none');

  useEffect(() => {
    let isMounted = true;

    const fetchTheme = async () => {
      try {
        const res = await fetch('/api/cofounder/storefront-context', {
          headers: { 'Cache-Control': 'no-cache' },
        });
        if (res.ok && isMounted) {
          const data: StorefrontContextPayload = await res.json();
          if (data?.theme) {
            setThemeId(data.theme.id);
            setAmbientEffect(data.theme.ambientEffect);

            if (data.theme.id !== 'default') {
              document.documentElement.style.setProperty('--festive-accent', data.theme.accentColor || '#f59e0b');
              document.documentElement.style.setProperty('--festive-secondary', data.theme.secondaryColor || '#d97706');
            } else {
              document.documentElement.style.removeProperty('--festive-accent');
              document.documentElement.style.removeProperty('--festive-secondary');
            }
          }
        }
      } catch (_) {}
    };

    fetchTheme();

    const interval = setInterval(fetchTheme, 60000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (themeId === 'default' || ambientEffect === 'none') {
    return null;
  }

  const isDeepavali = themeId === 'deepavali';
  const isPongal = themeId === 'pongal';
  const isLaunch = themeId === 'grand_launch';

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-30 overflow-hidden select-none"
    >
      {/* ── SUBTLE FESTIVE AMBIENT GLOW CORNERS ── */}
      <div
        className="absolute -top-12 left-0 w-80 h-80 sm:w-96 sm:h-96 rounded-full blur-[110px] opacity-20 transition-opacity duration-1000"
        style={{
          background: isDeepavali || isLaunch
            ? 'radial-gradient(circle, #f59e0b 0%, rgba(217,119,6,0) 70%)'
            : isPongal
            ? 'radial-gradient(circle, #eab308 0%, rgba(202,138,4,0) 70%)'
            : 'radial-gradient(circle, #10b981 0%, rgba(16,185,129,0) 70%)',
        }}
      />
      <div
        className="absolute -top-12 right-0 w-80 h-80 sm:w-96 sm:h-96 rounded-full blur-[110px] opacity-20 transition-opacity duration-1000"
        style={{
          background: isLaunch
            ? 'radial-gradient(circle, #10b981 0%, rgba(16,185,129,0) 70%)'
            : isDeepavali
            ? 'radial-gradient(circle, #d97706 0%, rgba(245,158,11,0) 70%)'
            : isPongal
            ? 'radial-gradient(circle, #ca8a04 0%, rgba(234,179,8,0) 70%)'
            : 'radial-gradient(circle, #f59e0b 0%, rgba(245,158,11,0) 70%)',
        }}
      />

      {/* ── RESTRAINED FESTIVE / LAUNCH PARTICLES (POINTER-EVENTS-NONE) ── */}
      {isLaunch && (
        <>
          <span
            className="absolute top-16 left-6 text-amber-400/60 text-sm animate-bounce"
            style={{ animationDuration: '4s' }}
          >
            🚀
          </span>
          <span
            className="absolute top-28 right-8 text-emerald-400/50 text-sm animate-pulse"
            style={{ animationDuration: '3s' }}
          >
            ✨
          </span>
          <span
            className="hidden lg:block absolute top-48 left-12 text-yellow-300/40 text-xs animate-pulse"
            style={{ animationDuration: '5s' }}
          >
            ✦
          </span>
          <span
            className="hidden lg:block absolute top-64 right-14 text-emerald-300/40 text-sm animate-bounce"
            style={{ animationDuration: '6s' }}
          >
            ⭐
          </span>
        </>
      )}

      {isDeepavali && (
        <>
          <span
            className="absolute top-16 left-6 text-amber-400/50 text-sm animate-bounce"
            style={{ animationDuration: '4s' }}
          >
            🪔
          </span>
          <span
            className="absolute top-28 right-8 text-amber-300/40 text-sm animate-pulse"
            style={{ animationDuration: '3s' }}
          >
            ✨
          </span>
          <span
            className="hidden lg:block absolute top-48 left-12 text-yellow-300/30 text-xs animate-pulse"
            style={{ animationDuration: '5s' }}
          >
            ✦
          </span>
          <span
            className="hidden lg:block absolute top-64 right-14 text-amber-400/30 text-sm animate-bounce"
            style={{ animationDuration: '6s' }}
          >
            🪔
          </span>
        </>
      )}

      {isPongal && (
        <>
          <span
            className="absolute top-16 left-6 text-yellow-500/50 text-sm animate-pulse"
            style={{ animationDuration: '4s' }}
          >
            🌾
          </span>
          <span
            className="absolute top-28 right-8 text-amber-400/40 text-sm animate-bounce"
            style={{ animationDuration: '5s' }}
          >
            ☀️
          </span>
        </>
      )}
    </div>
  );
};

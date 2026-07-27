'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '@/context/StoreContext';

const ModalsBundle = dynamic(
  () => import('./ModalsBundle').then((m) => ({ default: m.ModalsBundle })),
  { ssr: false }
);

/** Thin shell — downloads modal bundle only when a modal is open */
export const Modals = () => {
  const {
    quickViewProduct,
    isCheckoutOpen,
    isTrackOpen,
    isAuthOpen,
    isProfileOpen,
    orderSuccessData,
  } = useStore();

  const anyOpen =
    !!quickViewProduct ||
    isCheckoutOpen ||
    isTrackOpen ||
    isAuthOpen ||
    isProfileOpen ||
    !!orderSuccessData;

  if (!anyOpen) return null;
  return <ModalsBundle />;
};

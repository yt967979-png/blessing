'use client';

import React from 'react';
import { useStore } from '@/context/StoreContext';
import { ModalsBundle } from './ModalsBundle';

/** Storefront modals shell */
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

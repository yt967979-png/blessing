'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const Toast = () => {
  const { toast } = useStore();

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 16 }}
          className="fixed z-[80] left-4 right-4 sm:left-auto sm:right-5 sm:max-w-sm top-auto bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:top-5 sm:bottom-auto bg-[#001B3A] text-white px-4 py-3.5 rounded-2xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border border-amber-400/30 sm:border-l-4 sm:border-l-amber-400"
          role="status"
          aria-live="polite"
        >
          <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
          <span className="leading-snug">{toast}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

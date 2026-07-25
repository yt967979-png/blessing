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
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          className="fixed top-5 right-5 z-50 bg-[#001B3A] text-white px-5 py-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-semibold border-l-4 border-amber-400"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span>{toast}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

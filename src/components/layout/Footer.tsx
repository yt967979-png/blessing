'use client';

import React from 'react';
import { BrandLogo } from '@/components/ui/BrandLogo';
import {
  OFFICE_ADDRESS_LINES,
  OFFICE_COMPANY_NAME,
  OFFICE_MAPS_SEARCH_URL,
} from '@/lib/officeLocation';

export const Footer = () => {
  return (
    <footer id="footer" className="bg-gradient-to-b from-[#001226] via-[#000d1c] to-[#000812] text-slate-400 text-xs pt-14 border-t border-slate-800">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-8 pb-12">
        {/* Col 1: Brand & Social (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={36} className="w-9 h-9" />
            <div>
              <h3 className="font-heading font-black text-base text-white tracking-wide">
                BLESSING POWER GUIDE
              </h3>
              <span className="text-[10px] text-amber-400 font-extrabold uppercase tracking-wider block">
                Your Success, Our Mission
              </span>
            </div>
          </div>
          
          <p className="text-slate-400 text-xs leading-relaxed font-medium">
            Tamil Nadu State Board &amp; CBSE guides tailored for 6th to 12th standard students. Exam-oriented chapter notes, model question papers, and instant ST Courier delivery.
          </p>

          <div className="pt-1">
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-2.5">
              CONNECT WITH US ON SOCIAL
            </p>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://www.facebook.com/share/1KRUWogPcN/?mibextid=wwXIfr"
                target="_blank"
                rel="noreferrer"
                className="bg-blue-600/15 hover:bg-blue-600 border border-blue-500/30 text-blue-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>📘 Facebook</span>
              </a>
              <a
                href="https://www.instagram.com/blessingtuition_centre?igsh=N2czeThwbDE2ZHBm&utm_source=qr"
                target="_blank"
                rel="noreferrer"
                className="bg-pink-600/15 hover:bg-pink-600 border border-pink-500/30 text-pink-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>📸 Instagram</span>
              </a>
              <a
                href="https://youtube.com/@blessingtuitioncentre?si=QlOx5IxcCoabTAMl"
                target="_blank"
                rel="noreferrer"
                className="bg-red-600/15 hover:bg-red-600 border border-red-500/30 text-red-300 hover:text-white px-3 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <span>▶️ YouTube</span>
              </a>
            </div>
          </div>
        </div>

        {/* Col 2: Quick Links (2 cols) */}
        <div className="lg:col-span-2">
          <h4 className="font-heading font-black text-xs text-white uppercase tracking-widest mb-4 border-b border-white/10 pb-2">
            QUICK LINKS
          </h4>
          <ul className="space-y-2.5 font-semibold text-slate-300 text-xs">
            <li>
              <a href="/" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <span>•</span> Home Store
              </a>
            </li>
            <li>
              <a href="/search" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <span>•</span> Book Catalog
              </a>
            </li>
            <li>
              <a href="/orders" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <span>•</span> My Orders &amp; Track
              </a>
            </li>
            <li>
              <a href="/cart" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <span>•</span> Shopping Cart
              </a>
            </li>
          </ul>
        </div>

        {/* Col 3: Policies & Support (3 cols) */}
        <div className="lg:col-span-3">
          <h4 className="font-heading font-black text-xs text-white uppercase tracking-widest mb-4 border-b border-white/10 pb-2">
            POLICIES &amp; LEGAL
          </h4>
          <ul className="space-y-2.5 font-semibold text-slate-300 text-xs">
            <li>
              <a href="/shipping-policy" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <span>•</span> Shipping &amp; ST Courier Policy
              </a>
            </li>
            <li>
              <a href="/privacy-policy" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <span>•</span> Privacy Policy
              </a>
            </li>
            <li>
              <a href="/terms-of-service" className="hover:text-amber-400 transition-colors flex items-center gap-1.5">
                <span>•</span> Terms &amp; Conditions
              </a>
            </li>
          </ul>
        </div>

        {/* Col 4: Contact & Office (3 cols) */}
        <div className="lg:col-span-3 space-y-2.5">
          <h4 className="font-heading font-black text-xs text-white uppercase tracking-widest mb-4 border-b border-white/10 pb-2">
            CONTACT &amp; STORE LOCATION
          </h4>
          <div className="space-y-2 font-medium text-slate-300 text-xs">
            <p className="font-bold text-white text-xs">
              {OFFICE_COMPANY_NAME}
            </p>
            <p className="text-slate-400 text-[11px]">
              {OFFICE_ADDRESS_LINES[1]}
            </p>
            <a
              href={OFFICE_MAPS_SEARCH_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-extrabold transition-colors pt-1"
            >
              <span>📍 View on Google Maps</span>
            </a>
            <div className="pt-2 space-y-1">
              <p className="text-amber-300 font-black text-xs flex items-center gap-1.5">
                <span>📞</span> +91 98404 18228
              </p>
              <p className="text-slate-300 font-medium text-[11px] flex items-center gap-1.5">
                <span>✉️</span> blessingpowerguide@gmail.com
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Legal & Payment Badges Bar */}
      <div className="border-t border-white/10 bg-[#000812] py-5">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-3 text-slate-400 text-xs font-semibold text-center md:text-left">
          <div>
            <span>© 2026 Blessing Power Guide. All Rights Reserved.</span>
            <span className="text-slate-500 block sm:inline sm:ml-2">Official State Board &amp; CBSE Guides.</span>
          </div>

          <div className="flex items-center gap-3 text-[11px] text-slate-300">
            <span className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
              🔒 100% Safe Razorpay UPI
            </span>
            <span className="bg-white/5 border border-white/10 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
              🚚 ST Courier Express
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

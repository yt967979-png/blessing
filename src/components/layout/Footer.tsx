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
            <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-3">
              CONNECT WITH US ON SOCIAL MEDIA
            </p>
            <div className="flex flex-wrap items-center gap-2.5">
              <a
                href="https://www.facebook.com/share/1KRUWogPcN/?mibextid=wwXIfr"
                target="_blank"
                rel="noreferrer"
                className="bg-[#1877F2]/10 hover:bg-[#1877F2] border border-[#1877F2]/30 text-[#1877F2] hover:text-white px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center gap-2 cursor-pointer shadow-sm hover:scale-105 active:scale-95 group"
                aria-label="Facebook Page"
              >
                <svg className="w-4 h-4 fill-current group-hover:animate-bounce" viewBox="0 0 24 24">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                <span>Facebook</span>
              </a>

              <a
                href="https://www.instagram.com/blessingtuition_centre?igsh=N2czeThwbDE2ZHBm&utm_source=qr"
                target="_blank"
                rel="noreferrer"
                className="bg-gradient-to-r from-pink-500/10 via-purple-500/10 to-amber-500/10 hover:from-pink-600 hover:via-purple-600 hover:to-amber-500 border border-pink-500/30 text-pink-400 hover:text-white px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center gap-2 cursor-pointer shadow-sm hover:scale-105 active:scale-95 group"
                aria-label="Instagram Profile"
              >
                <svg className="w-4 h-4 fill-current group-hover:rotate-12 transition-transform" viewBox="0 0 24 24">
                  <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
                </svg>
                <span>Instagram</span>
              </a>

              <a
                href="https://youtube.com/@blessingtuitioncentre?si=QlOx5IxcCoabTAMl"
                target="_blank"
                rel="noreferrer"
                className="bg-[#FF0000]/10 hover:bg-[#FF0000] border border-[#FF0000]/30 text-[#FF4D4D] hover:text-white px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center gap-2 cursor-pointer shadow-sm hover:scale-105 active:scale-95 group"
                aria-label="YouTube Channel"
              >
                <svg className="w-4 h-4 fill-current group-hover:scale-125 transition-transform" viewBox="0 0 24 24">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
                <span>YouTube</span>
              </a>

              <a
                href="https://wa.me/919840418228"
                target="_blank"
                rel="noreferrer"
                className="bg-[#25D366]/10 hover:bg-[#25D366] border border-[#25D366]/30 text-[#25D366] hover:text-slate-950 px-3.5 py-2 rounded-xl text-xs font-extrabold transition-all duration-300 flex items-center gap-2 cursor-pointer shadow-sm hover:scale-105 active:scale-95 group"
                aria-label="WhatsApp Support"
              >
                <svg className="w-4 h-4 fill-current group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.285-.143-1.689-.834-1.95-.929-.261-.095-.451-.143-.641.143-.19.285-.737.929-.903 1.119-.166.19-.333.214-.618.071-.285-.143-1.205-.444-2.296-1.417-.848-.757-1.421-1.692-1.587-1.977-.166-.285-.018-.439.125-.581.128-.128.285-.333.428-.499.143-.166.19-.285.285-.475.095-.19.048-.356-.024-.499-.071-.143-.641-1.545-.879-2.116-.231-.555-.466-.48-.641-.489-.166-.008-.356-.008-.546-.008s-.5.071-.76.356c-.261.285-1.001.978-1.001 2.384 0 1.406 1.024 2.766 1.166 2.956.143.19 2.016 3.078 4.885 4.316.682.295 1.214.471 1.629.603.684.217 1.307.186 1.8.113.551-.082 1.689-.69 1.926-1.356.237-.666.237-1.236.166-1.356-.07-.12-.26-.192-.545-.335z"/>
                </svg>
                <span>WhatsApp</span>
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

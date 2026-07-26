'use client';

import React from 'react';

export const Footer = () => {
  return (
    <footer id="footer" className="bg-[#001226] text-slate-400 text-xs pt-12">
      <div className="max-w-7xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-8 pb-10">
        {/* Col 1 */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-[#001B3A] to-[#003B73] border border-[#D4A843] rounded-lg flex items-center justify-center font-bold text-lg text-[#F0C14B]">
              B
            </div>
            <div>
              <h4 className="font-heading font-extrabold text-sm text-white">
                BLESSING POWER GUIDE
              </h4>
              <span className="text-[9px] text-amber-400 font-semibold uppercase">
                Your Success, Our Mission
              </span>
            </div>
          </div>
          <p className="text-slate-400 leading-relaxed mb-4">
            Quality Guides for Better Preparation and Brighter Results for 6th to 12th Standard Students.
          </p>
          <div className="flex gap-2">
            <a
              href="https://facebook.com"
              target="_blank"
              rel="noreferrer"
              className="bg-white/5 border border-white/10 px-2.5 py-1 rounded text-[10px] text-slate-300 font-medium cursor-pointer hover:bg-blue-600 hover:text-white transition-colors"
            >
              📘 Facebook
            </a>
            <a
              href="https://instagram.com"
              target="_blank"
              rel="noreferrer"
              className="bg-white/5 border border-white/10 px-2.5 py-1 rounded text-[10px] text-slate-300 font-medium cursor-pointer hover:bg-pink-600 hover:text-white transition-colors"
            >
              📸 Instagram
            </a>
            <a
              href="https://youtube.com"
              target="_blank"
              rel="noreferrer"
              className="bg-white/5 border border-white/10 px-2.5 py-1 rounded text-[10px] text-slate-300 font-medium cursor-pointer hover:bg-red-600 hover:text-white transition-colors"
            >
              ▶️ YouTube
            </a>
          </div>
        </div>

        {/* Col 2 */}
        <div>
          <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider mb-4">
            QUICK LINKS
          </h4>
          <ul className="space-y-2 font-medium">
            <li>
              <a href="/" className="hover:text-amber-400 transition-colors">Home</a>
            </li>
            <li>
              <a href="/search" className="hover:text-amber-400 transition-colors">Search Catalog</a>
            </li>
            <li>
              <a href="/search?category=combo" className="hover:text-amber-400 transition-colors">Combo Offers</a>
            </li>
            <li>
              <a href="/orders" className="hover:text-amber-400 transition-colors">My Orders & Tracking</a>
            </li>
          </ul>
        </div>

        {/* Col 3 */}
        <div>
          <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider mb-4">
            HELP & POLICIES
          </h4>
          <ul className="space-y-2 font-medium">
            <li>
              <a href="/shipping-policy" className="hover:text-amber-400 transition-colors">Shipping & Delivery Policy</a>
            </li>
            <li>
              <a href="/shipping-policy" className="hover:text-amber-400 transition-colors">Return & Refund Policy</a>
            </li>
            <li>
              <a href="/privacy-policy" className="hover:text-amber-400 transition-colors">Privacy Policy</a>
            </li>
            <li>
              <a href="/terms-of-service" className="hover:text-amber-400 transition-colors">Terms & Conditions</a>
            </li>
          </ul>
        </div>

        {/* Col 4 */}
        <div>
          <h4 className="font-heading font-bold text-sm text-white uppercase tracking-wider mb-4">
            CONTACT & LOCATION
          </h4>
          <div className="space-y-2 font-medium text-slate-300">
            <p className="font-bold text-white">
              BLESSING PATHWAY EDUCATION (OPC) PRIVATE LIMITED
            </p>
            <p className="text-slate-400">BLESSING TUITION & TUTORIAL CENTRE</p>
            <p className="text-slate-400 leading-relaxed">
              No.12, Ganesh Apartment, Trust Square Street, Medavakkam, Agaramthen, Chennai — 600012
            </p>
            <a
              href="https://maps.google.com/?q=Medavakkam+Agaramthen+Chennai+600012"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-amber-400 font-bold underline transition-colors pt-1"
            >
              📍 Open Google Maps Location
            </a>
            <p className="text-amber-400 font-bold pt-1">📞 +91 98404 18228</p>
            <p className="text-slate-400">✉️ blessingpowerguide@gmail.com</p>
          </div>
        </div>
      </div>

      <div className="border-t border-white/5 py-4 text-center text-slate-500 text-[11px]">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row justify-between items-center gap-2">
          <span>© 2026 Blessing Power Guide. All Rights Reserved.</span>
          <span>Designed for Student Success ❤️</span>
        </div>
      </div>
    </footer>
  );
};

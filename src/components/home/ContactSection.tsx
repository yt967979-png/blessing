'use client';

import React, { useState } from 'react';
import { Send, Phone, Mail, MapPin, CheckCircle, Clock } from 'lucide-react';
import { useStore } from '@/context/StoreContext';

export const ContactSection = () => {
  const { showToast, user } = useStore();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [subject, setSubject] = useState('Guide Book Inquiry');
  const [message, setMessage] = useState('');

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone || !message) {
      showToast('⚠️ Please fill in Name, Mobile Number, and Message.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, subject, message }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setSubmitted(true);
        showToast('✅ Message sent successfully!');
        setMessage('');
      } else {
        showToast(`❌ ${data.error || 'Failed to send message'}`);
      }
    } catch (_) {
      showToast('❌ Network error sending message');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section id="contact" className="py-16 bg-slate-900 text-white relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 relative z-10">
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-amber-400 bg-amber-400/10 border border-amber-400/20 px-3.5 py-1.5 rounded-full inline-block mb-3">
            NEED HELP OR HAVE QUESTIONS?
          </span>
          <h2 className="font-heading font-black text-2xl sm:text-4xl text-white tracking-tight">
            Get in Touch with Our Team
          </h2>
          <p className="text-slate-400 text-xs sm:text-sm mt-2">
            Have questions about 6th-12th standard guide books, combo offers, bulk school orders, or ST Courier shipment status? Send us a message!
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Info Column */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-950/80 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
              <h3 className="font-heading font-bold text-lg text-amber-400 mb-6 flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" /> Office & Contact Info
              </h3>

              <div className="space-y-6 text-xs sm:text-sm">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400 flex-shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-1">Publication & Dispatch Address</h4>
                    <p className="text-slate-400 leading-relaxed text-xs">
                      BLESSING PATHWAY EDUCATION (OPC) PRIVATE LIMITED<br />
                      No.12, Ganesh Apartment, Trust Square Street, Medavakkam, Agaramthen, Chennai — 600012
                    </p>
                    <a
                      href="https://maps.google.com/?q=Medavakkam+Agaramthen+Chennai+600012"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-block mt-2 text-[11px] font-bold text-blue-400 hover:text-amber-400 underline transition-colors"
                    >
                      📍 Open Google Maps Location
                    </a>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-1">Phone & WhatsApp Support</h4>
                    <p className="text-amber-400 font-bold text-sm">+91 98404 18228</p>
                    <p className="text-slate-400 text-xs mt-0.5">Mon – Sat: 9:00 AM – 8:00 PM</p>
                  </div>
                </div>

                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-2xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 flex-shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white mb-1">Email Inquiry</h4>
                    <p className="text-slate-300 font-medium text-xs">blessingpowerguide@gmail.com</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">We reply within 2 hours during business hours</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Contact Form Column */}
          <div className="lg:col-span-7">
            <div className="bg-slate-950/90 border border-slate-800 rounded-3xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl">
              {submitted ? (
                <div className="py-12 text-center">
                  <div className="w-16 h-16 bg-emerald-500/20 border-2 border-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-400">
                    <CheckCircle className="w-8 h-8" />
                  </div>
                  <h3 className="font-heading font-black text-xl text-white mb-2">Message Sent Successfully!</h3>
                  <p className="text-slate-300 text-xs sm:text-sm max-w-md mx-auto mb-6">
                    Thank you for reaching out to Blessing Power Guide. Our team has received your message and will contact you via WhatsApp/Phone shortly!
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-extrabold text-xs px-6 py-2.5 rounded-xl transition-all shadow-md"
                  >
                    SEND ANOTHER MESSAGE
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Your Full Name *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Anand Kumar"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Mobile / WhatsApp Number *</label>
                      <input
                        type="tel"
                        required
                        placeholder="e.g. 9840418228"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Email Address (Optional)</label>
                      <input
                        type="email"
                        placeholder="e.g. student@gmail.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-amber-400 transition-colors"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 font-bold mb-1.5">Subject</label>
                      <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-amber-400 cursor-pointer"
                      >
                        <option value="Guide Book Inquiry">Guide Book Inquiry</option>
                        <option value="Combo Offer Inquiry">5-Subject Combo Offer Inquiry</option>
                        <option value="ST Courier Delivery Status">ST Courier Delivery Status</option>
                        <option value="Bulk School / Institution Order">Bulk School / Institution Order</option>
                        <option value="Other Assistance">Other Assistance</option>
                      </select>
                    </div>
                  </div>

                  <div className="text-xs">
                    <label className="block text-slate-300 font-bold mb-1.5">Your Message / Query *</label>
                    <textarea
                      rows={4}
                      required
                      placeholder="Type your message, book requirements, or tracking query here..."
                      value={message}
                      onChange={(e) => setMessage(e.target.value)}
                      className="w-full p-3 bg-slate-900 border border-slate-700 rounded-xl text-white outline-none focus:border-amber-400 transition-colors resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[#001B3A] font-black text-xs sm:text-sm py-3.5 rounded-xl transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer uppercase tracking-wider disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <span className="w-4 h-4 border-2 border-[#001B3A] border-t-transparent rounded-full animate-spin" />
                        <span>SENDING MESSAGE...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>SUBMIT MESSAGE TO HELPDESK</span>
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

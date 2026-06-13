/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { OpenAreaType } from '../types';
import { createLocation, isOnline } from '../dbService';

interface AddLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  clickedCoords: { lat: number; lng: number } | null;
  onSuccess: () => void;
}

export default function AddLocationModal({
  isOpen,
  onClose,
  clickedCoords,
  onSuccess
}: AddLocationModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openAreaType, setOpenAreaType] = useState<OpenAreaType>('Playground');
  const [address, setAddress] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim()) {
      setErrorMsg('লোকেশন বা স্পটের একটি আকর্ষণীয় নাম দিন।');
      return;
    }
    if (title.length < 3) {
      setErrorMsg('নামটি অত্যন্ত ছোট। কমপক্ষে ৩ অক্ষরের নাম লিখুন।');
      return;
    }
    if (!description.trim()) {
      setErrorMsg('স্পটের বিবরণ এবং খেলার ম্যাচ সম্পর্কে বিস্তারিত ইনফো দিন।');
      return;
    }
    if (!address.trim()) {
      setErrorMsg('যোগফল বা ল্যান্ডমার্কসহ পূর্ণ ঠিকানা পিন করুন।');
      return;
    }
    if (!clickedCoords) {
      setErrorMsg('ম্যাপে ক্লিক করে লোকেশন কোঅর্ডিনেট সেট করুন।');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createLocation({
        title: title.trim(),
        description: description.trim(),
        openAreaType,
        lat: clickedCoords.lat,
        lng: clickedCoords.lng,
        address: address.trim()
      });

      // Clear fields
      setTitle('');
      setDescription('');
      setOpenAreaType('Playground');
      setAddress('');

      onSuccess();
      onClose();

      // Show alert depending on connectivity
      if (result && typeof result === 'object' && result.offline) {
        alert("খবর: আপনি বর্তমানে অফলাইনে আছেন! কিন্তু চিন্তা করবেন না, আমরা এটি আপনার ফোনে সুরক্ষিত রাখছি। ইন্টারনেট কানেকশন ফিরে আসলেই এটি সাবমিট ও সিঙ্ক হয়ে যাবে এবং এডমিন অ্যাপ্রুভালের জন্য জমা হবে।");
      } else {
        alert("ধন্যবাদ! আপনার লিস্টিংটি সফলভাবে জমা হয়েছে। এডমিন ভেরিফাই করে দ্রুত অ্যাপ্রুভ করে দিলেই এটি সবার ম্যাপে প্রদর্শিত হবে।");
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'লোকেশন সাবমিট করতে কোনো সমস্যা হয়েছে। আবার চেষ্টা করুন।');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs transition-opacity overflow-y-auto">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100 transform transition-all my-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-indigo-700 text-white border-b-4 border-indigo-900 flex items-center justify-between">
          <h3 className="text-sm sm:text-base font-black tracking-tight uppercase flex items-center gap-2">
            <span>🏟️</span> নতুন খেলা দেখার স্পট যুক্ত করুন
          </h3>
          <button 
            onClick={onClose}
            className="text-white hover:text-indigo-200 transition-colors w-8 h-8 rounded-full flex items-center justify-center hover:bg-indigo-805 text-sm font-extrabold"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 font-sans">
          
          {/* Instructions Alert Banner */}
          <div className="bg-indigo-50 rounded-xl p-3 border-l-4 border-indigo-700 text-xs text-indigo-950 leading-relaxed font-sans shadow-sm">
            📌 <strong>জরুরি সতর্কবার্তা:</strong> আমাদের প্ল্যাটফর্মে শুধুমাত্র <strong>ওপেন এরিয়া বা খোলা মাঠে</strong> (যেমন পার্ক, খেলার মাঠ, মোড়ের ফাঁকা জায়গা বা লেকের পাড়) প্রজেক্টর খেলা দেখানোর স্পটগুলো লিস্টিং করা যাবে। ইনডোর বা চার দেয়ালের ভেতরের ঘরোয়া স্পট যোগ করবেন না। প্রতিটি স্পট এডমিন স্বয়ংক্রিয়ভাবে খতিয়ে দেখে এপ্রুভ করবেন।
          </div>

          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 text-rose-700 rounded-xl p-3 text-xs flex gap-1.5 items-start">
              <span>⚠️</span>
              <p className="font-extrabold text-slate-800">{errorMsg}</p>
            </div>
          )}

          {/* Connected Coordinates info */}
          <div className="bg-slate-50 border-b-2 border-indigo-200 rounded-xl p-3 text-xs text-slate-600 flex items-center justify-between shadow-xs">
            <div>
              <span className="font-extrabold text-indigo-900 text-[10px] uppercase tracking-wider block">📍 ম্যাপ কোঅর্ডিনেট পিন:</span>
              <p className="font-mono text-[10px] mt-0.5 text-slate-500">
                Lat: {clickedCoords?.lat.toFixed(6)}, Lng: {clickedCoords?.lng.toFixed(6)}
              </p>
            </div>
            <span className="bg-emerald-500 text-white px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wide shadow-sm">স্থানাঙ্ক সেট সম্পন্ন</span>
          </div>

          {/* Title */}
          <div>
            <label className="block text-indigo-900 text-xs font-black uppercase tracking-wider mb-1.5">১. স্পটের চমৎকার নাম বা টাইটেল দিন *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="উদা: ধানমন্ডি রবীন্দ্র সরোবর প্রজেক্টর স্ক্রিন"
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-700 bg-slate-50/50"
            />
          </div>

          {/* Open Area Type Selection */}
          <div>
            <label className="block text-indigo-900 text-xs font-black uppercase tracking-wider mb-1.5">২. এটি কোন ধরনের ওপেন এরিয়া স্পট? *</label>
            <select
              value={openAreaType}
              onChange={(e) => setOpenAreaType(e.target.value as OpenAreaType)}
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-700 bg-slate-50"
            >
              <option value="Playground">🏟️ খেলার মাঠ (Playground)</option>
              <option value="Park">🌳 পার্ক (Park)</option>
              <option value="Square">📍 মোড় বা চত্বর (Square)</option>
              <option value="Lakeside">🌊 লেকের পাড় (Lakeside)</option>
              <option value="Market">🛍️ ফাঁকা বাজার এলাকা (Market Area)</option>
              <option value="Other">🍃 অন্যান্য খোলা জায়গা (Other Open Area)</option>
            </select>
          </div>

          {/* Accurate Address description */}
          <div>
            <label className="block text-indigo-900 text-xs font-black uppercase tracking-wider mb-1.5">৩. স্পটের পূর্ণাঙ্গ ঠিকানা ও ল্যান্ডমার্ক *</label>
            <input
              type="text"
              required
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="উদা: ৭/এ রোডের লেকের লেকভিউ রেস্টুরেন্টের পাশে"
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-700 bg-slate-50/50"
            />
          </div>

          {/* Description details */}
          <div>
            <label className="block text-indigo-900 text-xs font-black uppercase tracking-wider mb-1.5">৪. স্পট ও খেলা সম্পর্কে বিস্তারিত বিবরণ *</label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="উদা: এখানে চ্যাম্পিয়ন্স লিগ ফাইনাল খেলাটি ফুল এইচডি বড় পর্দায় দেখানো হবে। স্থানীয় ক্লাবের পৃষ্ঠপোষকতায় পর্যাপ্ত চেয়ার এবং সুরক্ষার ব্যবস্থা রয়েছে। সবার জন্য উন্মুক্ত!"
              className="w-full px-3 py-2 border rounded-xl text-sm border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-700 bg-slate-50/50 resize-none"
            />
          </div>

          {/* Submit Actions */}
          <div className="flex gap-3 justify-end pt-3.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-550 hover:text-slate-800 transition-colors border hover:bg-slate-50 border-slate-200 rounded-xl"
            >
              বাতিল করুন
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-5 py-2 text-xs font-black text-white rounded-xl shadow-md transition-all flex items-center gap-1 bg-indigo-700 hover:bg-indigo-850 border-b-4 border-indigo-900 active:scale-95 ${isSubmitting ? 'opacity-70 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? (
                <>
                  <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>প্রসেসিং হচ্ছে...</span>
                </>
              ) : (
                <span>স্পট সাবমিট করুন 🚀</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth, loginWithGoogle } from '../firebase';
import { Mail, Lock, LogIn, ChevronRight, X, AlertCircle } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function LoginModal({ isOpen, onClose }: LoginModalProps) {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResetMode, setIsResetMode] = useState(false);

  if (!isOpen) return null;

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        "গুগল পপ-আপ লগইন করা সম্ভব হয়নি। আপনার ব্রাউজারের পপ-আপ ব্লকার অন থাকতে পারে। নিচের ইমেইল/পাসওয়ার্ড ফর্মটি ব্যবহার করে সহজে লগইন করুন।"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setErrorMsg("অনুগ্রহ করে ইমেইল এবং পাসওয়ার্ড দুটিই পূরণ করুন।");
      return;
    }
    if (password.length < 6) {
      setErrorMsg("নিরাপত্তার স্বার্থে পাসওয়ার্ড কমপক্ষে ৬ অক্ষরের হতে হবে।");
      return;
    }

    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
        setSuccessMsg("আপনার অ্যাকাউন্ট সফলভাবে তৈরি হয়েছে! আপনি অটো লগইন হয়ে গেছেন।");
        setTimeout(() => onClose(), 1500);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
        setSuccessMsg("সফলভাবে লগইন হয়েছে!");
        setTimeout(() => onClose(), 1000);
      }
    } catch (err: any) {
      console.error("Auth error code:", err.code, err.message);
      let bnError = "লগইন করতে সমস্যা হয়েছে। পাসওয়ার্ড বা ইমেইল সঠিক কিনা পুনরায় যাচাই করুন।";
      
      if (err.code === 'auth/user-not-found') {
        bnError = "এই ইমেইল দিয়ে কোনো অ্যাকাউন্ট খুঁজে পাওয়া যায়নি। একাউন্ট তৈরি করতে নিচে 'নতুন অ্যাকাউন্ট রেজিস্টার করুন' অপশনে ক্লিক করুন।";
      } else if (err.code === 'auth/wrong-password') {
        bnError = "ভুল পাসওয়ার্ড দিয়েছেন! সঠিক পাসওয়ার্ডটি লিখে পুনরায় চেষ্টা করুন।";
      } else if (err.code === 'auth/email-already-in-use') {
        bnError = "এই ইমেইল এড্রেস দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট তৈরি করা আছে। লগইন করার চেষ্টা করুন।";
      } else if (err.code === 'auth/invalid-email') {
        bnError = "অচল বা অমান্য ইমেইল ফরম্যাট দিয়েছেন। সঠিক ইমেইল এড্রেস ব্যবহার করুন।";
      } else if (err.message && err.message.includes("configuration")) {
        bnError = "ফায়ারবেস কনফিগারেশনে সমস্যা হয়েছে অথবা প্রোভাইডার ইনেবল করা নেই। দয়া করে ফায়ারবেস কনসোলে Email/Password সাইন-ইন মেথড অন করুন।";
      }
      setErrorMsg(bnError);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email) {
      setErrorMsg("অনুগ্রহ করে রিসিভ করার জন্য ইমেইল ফিল্ডে আপনার ইমেইলটি লিখুন।");
      return;
    }
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMsg("আপনার ইমেইলে পাসওয়ার্ড রিসেট করার একটি লিংক পাঠানো হয়েছে। চেক করুন।");
    } catch (err: any) {
      setErrorMsg("রিসেট লিংক পাঠানো ব্যর্থ হয়েছে। ইমেইল সঠিকভাবে লিখেছেন কি না নিশ্চিত হোন।");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-sans">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl border-b-4 border-indigo-700 border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header decoration */}
        <div className="bg-indigo-700 p-6 text-white relative">
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-white/80 hover:text-white bg-indigo-800/50 hover:bg-indigo-900/50 w-7 h-7 rounded-full flex items-center justify-center transition-all"
          >
            <X className="w-4 h-4" />
          </button>
          
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-2xl">🏟️</span>
            <h2 className="text-lg font-black tracking-tight uppercase">খেলাপর্দা পোর্টাল লগইন</h2>
          </div>
          <p className="text-xs text-indigo-150 leading-relaxed">
            ম্যাপে খেলার স্পট যুক্ত করতে এবং অ্যাডমিন প্যানেল এক্সেস করতে লগইন সম্পন্ন করুন।
          </p>
        </div>

        {/* Modal Main Content Container */}
        <div className="p-6 space-y-5">
          
          {/* Quick status report messaging */}
          {errorMsg && (
            <div className="bg-rose-50 border-l-4 border-rose-500 rounded-lg p-3 flex gap-2 text-rose-800 text-xs leading-normal font-medium">
              <AlertCircle className="w-4 h-4 text-rose-650 shrink-0 mt-0.5" />
              <p>{errorMsg}</p>
            </div>
          )}

          {successMsg && (
            <div className="bg-emerald-50 border-l-4 border-emerald-500 rounded-lg p-3 text-emerald-800 text-xs font-bold leading-normal">
              👍 {successMsg}
            </div>
          )}

          {/* Option 1: Fast One-Click Google Login Popup */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isLoading}
            className="w-full py-2.5 px-4 bg-slate-50 hover:bg-indigo-50 text-slate-700 hover:text-indigo-900 font-extrabold text-xs rounded-xl border border-slate-250 hover:border-indigo-300 transition-all active:scale-98 flex items-center justify-center gap-2.5 shadow-xs"
          >
            <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            <span>গুগল অ্যাকাউন্ট দিয়ে এক-ক্লিক লগইন</span>
          </button>

          {/* Geometric Divider line */}
          <div className="relative flex py-1.5 items-center">
            <div className="flex-grow border-t border-slate-150"></div>
            <span className="flex-shrink mx-3 text-[10px] text-slate-400 font-extrabold uppercase tracking-widest leading-none">অথবা ইমেইল ফর্ম</span>
            <div className="flex-grow border-t border-slate-150"></div>
          </div>

          {/* Option 2: Inline Form Auth for Iframe Bypass */}
          {isResetMode ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-black tracking-wider text-indigo-900">আপনার ইমেইল এড্রেস লিখুন</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="email@example.com"
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-250 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-sans"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handlePasswordReset}
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 active:scale-95"
              >
                {isLoading ? "পাঠানো হচ্ছে..." : "রিসেট পাসওয়ার্ড লিংক পাঠান ✉️"}
              </button>

              <button
                type="button"
                onClick={() => setIsResetMode(false)}
                className="w-full text-center text-[11px] text-indigo-700 font-bold hover:underline"
              >
                ইমেইল লগইন স্ক্রিনে ফিরে যান
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailAuth} className="space-y-3.5">
              
              {/* Email */}
              <div className="space-y-1.5">
                <label className="block text-[10px] uppercase font-black tracking-wider text-indigo-900">ইমেইল এড্রেস *</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="op.jobayer@gmail.com"
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-250 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-sans"
                    required
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-[10px] uppercase font-black tracking-wider text-indigo-900">
                  <label>পাসওয়ার্ড *</label>
                  <button
                    type="button"
                    onClick={() => setIsResetMode(true)}
                    className="text-[9px] text-slate-400 hover:text-indigo-700 font-extrabold hover:underline normal-case"
                  >
                    পাসওয়ার্ড ভুলে গেছেন?
                  </button>
                </div>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-250 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-600 font-sans"
                    required
                  />
                </div>
              </div>

              {/* Action Submit */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-2.5 px-4 bg-indigo-700 hover:bg-indigo-850 text-white font-extrabold text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-1.5 active:scale-95 duration-100"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>
                  {isLoading 
                    ? "অনুরোধ প্রসেস হচ্ছে..." 
                    : isSignUp 
                    ? "নতুন অ্যাকাউন্ট তৈরি করুন" 
                    : "ইমেইল দিয়ে সরাসরি লগইন"}
                </span>
                <ChevronRight className="w-4 h-4 ml-auto" />
              </button>

              {/* Dynamic Toggle Options between Signup and Signin */}
              <div className="pt-2 text-center text-[11px] text-slate-500 font-medium">
                {isSignUp ? (
                  <p>
                    ইতিমধ্যে একাউন্ট তৈরি করা আছে?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(false);
                        setErrorMsg('');
                      }}
                      className="text-indigo-700 hover:underline font-extrabold"
                    >
                      লগইন করুন রাজকীয়ভাবে →
                    </button>
                  </p>
                ) : (
                  <p>
                    ইমেইল দিয়ে একাউন্ট নেই?{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(true);
                        setErrorMsg('');
                      }}
                      className="text-emerald-600 hover:underline font-extrabold"
                    >
                      নতুন অ্যাকাউন্ট রেজিস্টার করুন →
                    </button>
                  </p>
                )}
              </div>

            </form>
          )}

          {/* Bangladesh Admin setup alert hint for the user */}
          <div className="bg-amber-50/50 rounded-xl p-3 border border-amber-100 text-[10px] text-slate-550 leading-normal font-medium font-sans">
            📌 <strong>অ্যাডমিন লগইন গাইড:</strong> আপনি যদি অ্যাডমিন হতে চান, ফায়ারবেস অথেনটিকেশনে <strong>{`op.jobayer@gmail.com`}</strong> ইমেইলটি রেজিস্টার করে লগইন করুন (পাসওয়ার্ড কমপক্ষে ৬ নম্বরের দিয়ে)। রেজিস্টার না থাকলে 'নতুন অ্যাকাউন্ট রেজিস্টার করুন' এ ক্লিক করে অ্যাকাউন্ট খুলে নিন।
          </div>

        </div>

      </div>
    </div>
  );
}

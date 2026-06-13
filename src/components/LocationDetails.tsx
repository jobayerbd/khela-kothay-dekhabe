/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { LocationItem, ListingStatus, LiveStatus } from '../types';
import { auth } from '../firebase';
import { voteLocation, checkHasUserVoted, updateLocationStatus, updateLiveStatus, isOnline } from '../dbService';

interface LocationDetailsProps {
  location: LocationItem | null;
  onClose: () => void;
  onRefresh: () => void;
  adminEmail: string;
}

export default function LocationDetails({
  location,
  onClose,
  onRefresh,
  adminEmail
}: LocationDetailsProps) {
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [votedType, setVotedType] = useState<'real' | 'fake' | null>(null);
  const [checkingVote, setCheckingVote] = useState(false);
  const [votingLoader, setVotingLoader] = useState(false);
  const [statusLoader, setStatusLoader] = useState(false);

  // Sync auth state
  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      setCurrentUser(user);
    });
    return unsub;
  }, []);

  // Check if current user has already voted on selected location
  useEffect(() => {
    if (location && currentUser) {
      setCheckingVote(true);
      checkHasUserVoted(location.id)
        .then((type) => {
          setVotedType(type);
        })
        .finally(() => {
          setCheckingVote(false);
        });
    } else {
      setVotedType(null);
    }
  }, [location, currentUser]);

  if (!location) return null;

  const isCreator = currentUser && location.creatorId === currentUser.uid;
  const isAdmin = currentUser && currentUser.email === adminEmail;
  const canManageLive = isCreator || isAdmin;

  // Calculate percentages of Real and Fake ratings
  const totalVotes = location.realCount + location.fakeCount;
  const realPercent = totalVotes > 0 ? Math.round((location.realCount / totalVotes) * 100) : 0;
  const fakePercent = totalVotes > 0 ? Math.round((location.fakeCount / totalVotes) * 100) : 0;

  // Handle Feedback Submission
  const handleVote = async (type: 'real' | 'fake') => {
    if (!currentUser) {
      alert("দুঃখিত, ভোট দিতে বা মতামত জানাতে আপনাকে প্রথমে লগইন করতে হবে। ওপরে থাকা লগইন বাটনে প্রেস করুন।");
      return;
    }
    if (votedType !== null) {
      alert("আপনি ইতিপূর্বেই এই স্পটে আপনার গুরুত্বপূর্ণ মতামত দিয়েছেন। প্রত্যেক ইউজার একবারই ভোট দিতে পারবেন।");
      return;
    }

    setVotingLoader(true);
    try {
      const res = await voteLocation(location.id, type);
      setVotedType(type);
      onRefresh();

      if (res.offline) {
        alert("অফলাইন সিঙ্ক অ্যাকশন: আপনার ভোটটি অফলাইনে সংরক্ষিত হয়েছে। ইন্টারনেট ফিরে এলে এটি স্বয়ংক্রিয়ভাবে ক্লাউডে যুক্ত হয়ে যাবে।");
      } else {
        alert(`মতামত প্রদানের জন্য ধন্যবাদ! আপনি সফলভাবে এই স্পটকে "${type === 'real' ? 'সত্য' : 'ফেক/ভুল'}" হিসেবে ঘোষণা করেছেন।`);
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'ভোট সম্পন্ন করতে কোনো সমস্যা দেখা দিয়েছে। পুনরায় চেষ্টা করুন।');
    } finally {
      setVotingLoader(false);
    }
  };

  // Modify approved/rejected listing status
  const handleListingStatusChange = async (newStatus: ListingStatus) => {
    if (!isAdmin) return;
    setStatusLoader(true);
    try {
      await updateLocationStatus(location.id, newStatus);
      alert(`স্পটের স্ট্যাটাস"${newStatus === 'approved' ? 'অ্যাপ্রুভড' : 'রিজেক্টেড'}" হিসেবে সফলভাবে আপডেট করা হয়েছে।`);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে।');
    } finally {
      setStatusLoader(false);
    }
  };

  // Modify active screen live performance streaming status
  const handleLiveStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLive = e.target.value as LiveStatus;
    setStatusLoader(true);
    try {
      await updateLiveStatus(location.id, newLive);
      alert('লোকেশনটির লাইভ সম্প্রচার স্ট্যাটাস সফলভাবে আপডেট করা হয়েছে।');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'লাইভ স্ট্যাটাস আপডেট করতে সমস্যা হয়েছে।');
    } finally {
      setStatusLoader(false);
    }
  };

  // Generate Google Map Direction URL
  const getDirectionUrl = () => {
    return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
  };

  // Generate Device-specific Native Maps Direction URL
  const getDeviceMapsUrl = () => {
    const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera;
    const isApple = /iPad|iPhone|iPod|Macintosh/.test(userAgent) && !(window as any).MSStream;
    
    if (isApple) {
      // Force Apple Maps default application with directions on iOS / macOS
      return `maps://maps.apple.com/?daddr=${location.lat},${location.lng}&dirflg=d`;
    }
    
    // On Android / Windows/ Linux, this universal maps direction link auto-intercepts
    // to open in the native Google Maps app directly with the route prepared.
    return `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
  };

  // Format Open Area Bengali badges
  const getAreaBadgeBengali = (type: string) => {
    switch (type) {
      case 'Playground': return '🏟️ খেলার মাঠ';
      case 'Park': return '🌳 পার্ক';
      case 'Square': return '📍 চৌরাস্তা / চত্বর';
      case 'Lakeside': return '🌊 লেকের পাড়';
      case 'Market': return '🛍️ ফাঁকা বা খোলা বাজার';
      case 'Other':
      default:
        return '🍃 অন্যান্য উন্মুক্ত অঞ্চল';
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-md border-b-4 border-indigo-900/30 border border-slate-200 p-6 flex flex-col h-full justify-between animate-in slide-in-from-right-10 duration-200">
      <div className="space-y-5">
        
        {/* Header Close info */}
        <div className="flex items-start justify-between border-b border-slate-100 pb-3">
          <div>
            <span className="bg-indigo-50 text-indigo-750 border border-indigo-100 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wide">
              {getAreaBadgeBengali(location.openAreaType)}
            </span>
            <h4 className="text-sm sm:text-base font-black text-slate-800 mt-2.5 leading-tight uppercase">
              {location.title}
            </h4>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors text-xs font-bold"
          >
            ✕
          </button>
        </div>

        {/* Live Status indicator */}
        <div className="bg-slate-50 border-b-2 border-indigo-200 rounded-xl p-4 flex items-center gap-3.5 shadow-sm">
          <div className="relative flex h-4 w-4 shrink-0">
            {location.liveStatus === 'streaming' ? (
              <>
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500"></span>
              </>
            ) : location.liveStatus === 'upcoming' ? (
              <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500"></span>
            ) : (
              <span className="relative inline-flex rounded-full h-4 w-4 bg-slate-400"></span>
            )}
          </div>
          <div className="font-sans flex-1">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 block">বর্তমান লাইভ স্ট্যাটাস</span>
            <span className="text-xs font-extrabold text-slate-800 block mt-0.5">
              {location.liveStatus === 'streaming' && '🟢 খেলা চলছে (Now Streaming Live!)'}
              {location.liveStatus === 'upcoming' && '🟡 শীঘ্রই খেলা স্টার্ট হবে (Match Upcoming)'}
              {location.liveStatus === 'inactive' && '🔴 এখন কোনো ম্যাচ নেই (Closed)'}
            </span>
          </div>
        </div>

        {/* Spot Details */}
        <div className="space-y-4 text-xs">
          <div>
            <span className="block text-[10px] font-black text-indigo-900 uppercase tracking-wider mb-0.5">📍 স্পটের পূর্ণ ঠিকানা ও ল্যান্ডমার্ক:</span>
            <p className="text-slate-700 font-sans font-extrabold leading-tight">{location.address}</p>
          </div>
          <div>
            <span className="block text-[10px] font-black text-indigo-900 uppercase tracking-wider mb-0.5">📝 বিবরণ এবং ম্যাচ ইনফো:</span>
            <p className="text-slate-600 leading-relaxed font-sans bg-slate-50 p-3 rounded-lg border border-slate-150 text-[11px]">
              {location.description}
            </p>
          </div>
          <div className="flex justify-between text-[10.5px] text-slate-500 pt-1 border-t border-slate-100 font-sans">
            <span>👤 হোস্ট: <strong className="text-slate-700">{location.creatorEmail.split('@')[0]}</strong></span>
            <span>ক্রিয়েশন: {location.createdAt ? new Date(location.createdAt).toLocaleDateString('bn-BD') : 'অজানা'}</span>
          </div>
        </div>

        {/* Community Polling & Feedback */}
        <div className="bg-indigo-50/40 border border-indigo-150/60 rounded-xl p-4 space-y-4">
          <div className="flex items-center justify-between font-sans">
            <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest block">👥 কমিউনিটি ট্রাস্ট রিভিউ</span>
            <span className="text-[9px] text-indigo-805 font-black bg-white border border-indigo-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">ভোট সংখ্যা: {totalVotes} টি</span>
          </div>

          {/* Verification Percentage details */}
          {totalVotes > 0 ? (
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-extrabold font-sans text-slate-700">
                <span className="text-emerald-700">👍 {realPercent}% স্পটটি সত্য</span>
                <span className="text-rose-700">👎 {fakePercent}% ভুয়া/ফেক</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden flex">
                <div style={{ width: `${realPercent}%` }} className="h-full bg-emerald-500 transition-all duration-500"></div>
                <div style={{ width: `${fakePercent}%` }} className="h-full bg-rose-500 transition-all duration-500"></div>
              </div>
            </div>
          ) : (
            <p className="text-[11px] text-slate-505 text-center italic py-1 leading-normal font-sans">
              এই লিস্টিং সম্পর্কে আপনার মাঠের অভিজ্ঞতা শেয়ার করতে নিচে ভোট প্রদান করুন।
            </p>
          )}

          {/* Voting Button interface */}
          <div className="grid grid-cols-2 gap-3.5 pt-1">
            <button
              onClick={() => handleVote('real')}
              disabled={votingLoader || checkingVote || votedType !== null}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border font-bold text-xs transition-all shadow-sm ${votedType === 'real'
                ? 'bg-emerald-550 border-emerald-600 text-white'
                : 'bg-white hover:bg-emerald-50/50 text-slate-700 border-slate-250 hover:border-emerald-400 active:scale-95'}`}
            >
              <span>👍 সত্য (Real)</span>
              {votedType === 'real' && (
                <span className="bg-white text-emerald-700 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black">✓</span>
              )}
            </button>
            <button
              onClick={() => handleVote('fake')}
              disabled={votingLoader || checkingVote || votedType !== null}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl border font-bold text-xs transition-all shadow-sm ${votedType === 'fake'
                ? 'bg-rose-550 border-rose-600 text-white'
                : 'bg-white hover:bg-rose-50/50 text-slate-700 border-slate-250 hover:border-rose-400 active:scale-95'}`}
            >
              <span>👎 ফেক (Fake)</span>
              {votedType === 'fake' && (
                <span className="bg-white text-rose-700 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-black">✕</span>
              )}
            </button>
          </div>

          {votedType && (
            <div className="text-center text-[10px] text-indigo-705 font-sans font-black uppercase tracking-wide">
              🎉 ভোট সাবমিট হয়েছে! ফিডব্যাকের জন্য ধন্যবাদ।
            </div>
          )}
        </div>

        {/* Dynamic Managerial Panel (Visible to Creator / Admins) */}
        {canManageLive && (
          <div className="bg-amber-50/80 border border-amber-200/90 rounded-xl p-4 gap-3.5 space-y-3 font-sans shadow-sm">
            <span className="text-[10px] font-black text-amber-900 uppercase tracking-wider block flex items-center gap-1">
              ⚙️ স্পট কন্ট্রোল ও লাইভ স্ট্যাটাস আপডেট
            </span>

            <div className="grid grid-cols-1 gap-2">
              {/* Creator changes Stream condition */}
              <div>
                <label className="block text-[10.5px] text-amber-800 font-extrabold mb-1">সম্প্রচার পরিবর্তন করুন:</label>
                <select
                  value={location.liveStatus}
                  onChange={handleLiveStatusChange}
                  disabled={statusLoader}
                  className="w-full text-xs font-sans font-extrabold p-2 bg-white border border-amber-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="inactive">🔴 খেলা বন্ধ (Closed)</option>
                  <option value="upcoming">🟡 শীঘ্রই শুরু হবে (Upcoming)</option>
                  <option value="streaming">🟢 খেলা চলছে (Now Streaming)</option>
                </select>
              </div>

              {/* Admin approves custom listing */}
              {isAdmin && (
                <div className="pt-2.5 border-t border-amber-200/80 mt-1">
                  <span className="block text-[10.5px] text-amber-800 font-extrabold mb-1">অ্যাডমিন মডারেশন প্যানেল:</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleListingStatusChange('approved')}
                      disabled={statusLoader || location.status === 'approved'}
                      className={`flex-1 py-1.5 px-3 border rounded-lg text-xs font-black text-center transition-all ${location.status === 'approved'
                        ? 'bg-emerald-100 border-emerald-250 text-emerald-800 cursor-not-allowed opacity-80'
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm hover:scale-102 active:scale-98'}`}
                    >
                      অ্যাপ্রুভ (Approve)
                    </button>
                    <button
                      onClick={() => handleListingStatusChange('rejected')}
                      disabled={statusLoader || location.status === 'rejected'}
                      className={`flex-1 py-1.5 px-3 border rounded-lg text-xs font-black text-center transition-all ${location.status === 'rejected'
                        ? 'bg-rose-100 border-rose-250 text-rose-800 cursor-not-allowed opacity-80'
                        : 'bg-rose-600 hover:bg-rose-700 text-white shadow-sm hover:scale-102 active:scale-98'}`}
                    >
                      বাতিল (Reject)
                    </button>
                  </div>
                  <div className="text-[10px] mt-1.5 text-amber-800 leading-tight">
                    * বর্তমান মডারেশন স্ট্যাটাস: <strong>{location.status === 'pending' ? 'পেন্ডিং 🟡' : location.status === 'approved' ? 'অ্যাপ্রুভড 🟢' : 'রিজেক্টেড 🔴'}</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Navigation action buttons */}
      <div className="pt-5 border-t border-slate-100 flex flex-col gap-2.5 mt-5">
        <a
          href={getDeviceMapsUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full text-center py-2.5 px-4 bg-emerald-600 hover:bg-emerald-750 border-b-4 border-emerald-800 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] duration-150"
        >
          <span>🏎️ ডিভাইসের ডিফল্ট ম্যাপে রুট দেখুন (Open in Device Maps)</span>
        </a>
        <a
          href={getDirectionUrl()}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full text-center py-2.5 px-4 bg-indigo-700 hover:bg-indigo-850 border-b-4 border-indigo-900 text-white rounded-xl text-xs font-black shadow-md transition-all flex items-center justify-center gap-2 active:scale-[0.98] duration-150"
        >
          <span>🌐 গুগল ম্যাপ ডিরেকশন (Google Maps Web)</span>
        </a>
      </div>
    </div>
  );
}

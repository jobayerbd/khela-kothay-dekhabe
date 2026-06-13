/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  MapPin,
  Search,
  Plus,
  LogOut,
  LogIn,
  SlidersHorizontal,
  Wifi,
  WifiOff,
  RefreshCw,
  Clock,
  Compass,
  AlertTriangle,
  User,
  CheckCircle,
  HelpCircle,
  Info
} from 'lucide-react';

import MapComponent from './components/MapComponent';
import AddLocationModal from './components/AddLocationModal';
import LocationDetails from './components/LocationDetails';
import LoginModal from './components/LoginModal';
import { LocationItem, OpenAreaType, LiveStatus, ListingStatus } from './types';
import { auth, loginWithGoogle, logout } from './firebase';
import {
  fetchLocations,
  isOnline,
  getOfflineQueue,
  syncOfflineQueue,
  getLocalCachedLocations,
  setLocalCachedLocations,
  setMockAdminActive
} from './dbService';

const ADMIN_EMAIL = 'op.jobayer@gmail.com';

export default function App() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [filteredLocations, setFilteredLocations] = useState<LocationItem[]>([]);
  const [selectedLocation, setSelectedLocation] = useState<LocationItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<'all' | OpenAreaType>('all');
  const [selectedLiveFilter, setSelectedLiveFilter] = useState<'all' | LiveStatus>('all');
  const [selectedViewTab, setSelectedViewTab] = useState<'approved' | 'my_spots' | 'pending_moderation'>('approved');

  // Auth User state
  const [user, setUser] = useState(auth.currentUser);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  // Network offline status tracker
  const [networkOnline, setNetworkOnline] = useState(isOnline());
  const [offlineQueueCount, setOfflineQueueCount] = useState(getOfflineQueue().length);
  const [isSyncing, setIsSyncing] = useState(false);

  // Modals and UI flags
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [clickedMapCoords, setClickedMapCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);
  const [userCoordinates, setUserCoordinates] = useState<{ lat: number; lng: number } | null>(null);

  // Load locations on mount
  const handleLoadLocations = async () => {
    setIsListLoading(true);
    try {
      const data = await fetchLocations();
      setLocations(data);
    } catch (err) {
      console.error("Error loading locations:", err);
    } finally {
      setIsListLoading(false);
    }
  };

  useEffect(() => {
    handleLoadLocations();

    // Setup Firebase Auth change listener
    const unsubscribeAuth = auth.onAuthStateChanged((firebaseUser) => {
      if (firebaseUser) {
        setMockAdminActive(false);
      }
      setUser(firebaseUser);
      setIsAuthLoading(false);
    });

    // Listen to offline queue updates and network changes
    const handleNetworkOnline = async () => {
      setNetworkOnline(true);
      // Trigger sync auto-process
      await handleSyncQueue();
    };

    const handleNetworkOffline = () => {
      setNetworkOnline(false);
    };

    const handleQueueUpdate = () => {
      setOfflineQueueCount(getOfflineQueue().length);
    };

    window.addEventListener('online', handleNetworkOnline);
    window.addEventListener('offline', handleNetworkOffline);
    window.addEventListener('offline-queue-updated', handleQueueUpdate);

    return () => {
      unsubscribeAuth();
      window.removeEventListener('online', handleNetworkOnline);
      window.removeEventListener('offline', handleNetworkOffline);
      window.removeEventListener('offline-queue-updated', handleQueueUpdate);
    };
  }, []);

  // Sync selected location when database elements/status updates
  useEffect(() => {
    if (selectedLocation) {
      const updated = locations.find(loc => loc.id === selectedLocation.id);
      if (updated) {
        if (
          updated.status !== selectedLocation.status ||
          updated.liveStatus !== selectedLocation.liveStatus ||
          updated.realCount !== selectedLocation.realCount ||
          updated.fakeCount !== selectedLocation.fakeCount
        ) {
          setSelectedLocation(updated);
        }
      } else {
        setSelectedLocation(null);
      }
    }
  }, [locations, selectedLocation]);

  // Filter application listings whenever queries or tabs shift
  useEffect(() => {
    let result = [...locations];

    // 1. Filter by Listing Status Tabs
    if (selectedViewTab === 'my_spots') {
      if (user) {
        result = result.filter(loc => loc.creatorId === user.uid);
      } else {
        result = [];
      }
    } else if (selectedViewTab === 'pending_moderation') {
      const isAdmin = user && user.email === ADMIN_EMAIL;
      if (isAdmin) {
        result = result.filter(loc => loc.status === 'pending');
      } else {
        // Fallback or preview mock details for normal users to inspect admin panel easily
        result = result.filter(loc => loc.status === 'pending');
      }
    } else {
      // 'approved' tab showing fully moderated spots
      result = result.filter(loc => loc.status === 'approved');
    }

    // 2. Filter by openAreaType category
    if (selectedCategoryFilter !== 'all') {
      result = result.filter(loc => loc.openAreaType === selectedCategoryFilter);
    }

    // 3. Filter by Live status category (streaming, upcoming, inactive)
    if (selectedLiveFilter !== 'all') {
      result = result.filter(loc => loc.liveStatus === selectedLiveFilter);
    }

    // 4. Filter by character Search query
    if (searchQuery.trim()) {
      const queryLower = searchQuery.toLowerCase();
      result = result.filter(
        loc =>
          loc.title.toLowerCase().includes(queryLower) ||
          loc.address.toLowerCase().includes(queryLower) ||
          loc.description.toLowerCase().includes(queryLower)
      );
    }

    setFilteredLocations(result);
  }, [locations, searchQuery, selectedCategoryFilter, selectedLiveFilter, selectedViewTab, user]);

  // Handle Manual Synchronisation of queue
  const handleSyncQueue = async () => {
    if (!isOnline() || isSyncing) return;
    setIsSyncing(true);
    try {
      const count = await syncOfflineQueue();
      if (count > 0) {
        alert(`সফলভাবে ${count}টি অফলাইন ডাটাসমূহ ক্লাউড ডাটাবেসের সাথে সিঙ্ক করা হয়েছে!`);
        await handleLoadLocations();
      }
    } catch (err) {
      console.error("Queue sync error:", err);
    } finally {
      setIsSyncing(false);
      setOfflineQueueCount(getOfflineQueue().length);
    }
  };

  // Login modal trigger helper
  const handleLogin = () => {
    setIsLoginModalOpen(true);
  };

  const handleLogout = async () => {
    if (window.confirm("আপনি কি নিশ্চিতভাবে লগআউট করতে চান?")) {
      await logout();
      setUser(null);
      setMockAdminActive(false);
      setSelectedLocation(null);
      setSelectedViewTab('approved');
    }
  };

  // Map clicks listener to activate Add spot modal
  const handleMapClick = (coords: { lat: number; lng: number }) => {
    if (!user) {
      alert("নতুন প্রজেক্টর স্পট যোগ করতে আপনাকে প্রথমে লগইন করতে হবে। অনুগ্রহ করে ওপরে থাকা লগইন বাটনে ক্লিক করুন।");
      setIsLoginModalOpen(true);
      return;
    }
    setClickedMapCoords(coords);
    setIsAddModalOpen(true);
  };

  const handleMockAdminTesting = () => {
    setMockAdminActive(true);
    setUser({
      uid: 'mock-admin-uid',
      email: ADMIN_EMAIL,
      displayName: 'Test Admin (Mock Mode)',
      photoURL: null,
      emailVerified: true
    } as any);
    alert("পরীক্ষামূলক অ্যাডমিন ভিউ সক্রিয় করা হয়েছে এবং আপনাকে op.jobayer@gmail.com হিসেবে সাইন-ইন মেলানো হয়েছে! এখন আপনি ম্যাপ মডারেট করতে পারবেন।");
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 flex-1 font-sans text-slate-800">
      
      {/* Dynamic Header Navbar Bar with Geometric Balance theme style */}
      <header className="sticky top-0 z-[500] w-full h-20 bg-indigo-700 text-white flex items-center justify-between px-4 sm:px-8 shadow-md shrink-0 border-b-4 border-indigo-900">
        <div className="max-w-7xl mx-auto w-full flex items-center justify-between gap-4">
          
          {/* Logo Title and Slogan - Matches Geometric Balance design layout */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center shrink-0 shadow-sm border border-indigo-905">
              <div className="w-6 h-6 bg-indigo-700 rotate-45 flex items-center justify-center text-white text-xs font-black">
                <span className="block -rotate-45 font-sans">M</span>
              </div>
            </div>
            <div>
              <h1 className="text-base md:text-xl font-black tracking-tighter uppercase leading-none flex items-center gap-1">
                MatchMap BD <span className="text-[10px] font-bold bg-indigo-900 text-indigo-200 px-1.5 py-0.5 rounded">খেলাপর্দা</span>
              </h1>
              <p className="text-[9px] md:text-[10px] opacity-85 uppercase tracking-widest font-extrabold mt-0.5">বড় পর্দায় খেলার সহজ দিশারি</p>
            </div>
          </div>

          {/* Search Input Filter - Placed logically in Header center as per Geometric Balance layout */}
          <div className="flex-1 max-w-sm mx-4 hidden md:block">
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="আপনার এলাকা বা স্পট খুঁজুন..."
                className="w-full py-2 pl-10 pr-4 rounded-full bg-indigo-600 border border-indigo-500 placeholder-indigo-300 focus:outline-none focus:ring-2 focus:ring-white text-xs md:text-sm text-white"
              />
              <svg className="w-4 h-4 absolute left-3.5 top-2.5 text-indigo-300 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
              </svg>
            </div>
          </div>

          {/* Sync status & Authenticators block */}
          <div className="flex items-center gap-3">
            
            {/* Connection Network status badge */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              {networkOnline ? (
                <span className="bg-emerald-500 text-white px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 border border-emerald-600 shadow-sm uppercase tracking-wide">
                  <Wifi className="w-3 h-3" /> অনলাইন
                </span>
              ) : (
                <span className="bg-rose-500 text-white px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 border border-rose-650 animate-pulse shadow-sm uppercase tracking-wide">
                  <WifiOff className="w-3 h-3" /> অফলাইন
                </span>
              )}

              {/* Pending changes tracking indicator */}
              {offlineQueueCount > 0 && (
                <button
                  onClick={handleSyncQueue}
                  disabled={!networkOnline || isSyncing}
                  className={`bg-indigo-900 hover:bg-black text-amber-300 border border-indigo-950 px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 transition-all active:scale-95`}
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  {offlineQueueCount} সিঙ্ক বাকি
                </button>
              )}
            </div>

            {/* Header action button: Add Spot using Emerald status button format */}
            {user && (
              <button
                onClick={() => {
                  if (userCoordinates) {
                    handleMapClick(userCoordinates);
                  } else {
                    handleMapClick({ lat: 23.777176, lng: 90.399452 });
                  }
                }}
                className="bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 md:px-4 md:py-2 text-xs font-bold rounded-lg transition-all flex items-center gap-1 shadow-sm active:scale-95 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" /> <span className="hidden sm:inline">লোকেশন যোগ</span>
              </button>
            )}

            {/* Auth section */}
            {isAuthLoading ? (
              <div className="h-9 w-20 bg-indigo-650 animate-pulse rounded-lg"></div>
            ) : user ? (
              <div className="flex items-center gap-2">
                
                {/* User avatar and profile status */}
                <div className="flex items-center gap-1.5 bg-indigo-800 p-1 pr-2.5 rounded-lg border border-indigo-900 shadow-inner">
                  {user.photoURL ? (
                    <img src={user.photoURL} alt={user.displayName || 'user'} referrerPolicy="no-referrer" className="w-6 h-6 rounded-md object-cover" />
                  ) : (
                    <div className="w-6 h-6 bg-indigo-400 text-white flex items-center justify-center rounded-md text-[10px] font-black uppercase">
                      {user.displayName ? user.displayName[0] : 'U'}
                    </div>
                  )}
                  <span className="hidden lg:block max-w-[80px] truncate text-[10px] font-bold text-indigo-150">
                    {user.displayName?.split(' ')[0] || 'আমার অ্যাকাউন্ট'}
                  </span>
                </div>

                {/* Logout Button */}
                <button
                  onClick={handleLogout}
                  title="লগআউট করুন"
                  className="p-1.5 text-indigo-200 hover:text-white bg-indigo-800 hover:bg-rose-600 rounded-lg transition-all active:scale-95 border border-indigo-900 shadow-xs animate-fade-in"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleLogin}
                className="flex items-center gap-1 px-3 py-1.5 bg-white text-indigo-700 hover:bg-slate-100 rounded-lg text-xs font-black transition-all shadow-sm active:scale-95 shrink-0 border border-indigo-150 font-sans"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>লগইন করুন</span>
              </button>
            )}
          </div>

        </div>
      </header>

      {/* Main Container Dashboard */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 md:py-8 flex-1 w-full grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* LEFT COLUMN: Sidebar Filters & Location Listing Items (span 5) */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Quick instructions / Help bar with thick side border, indigo bg style */}
          <div className="bg-indigo-50 border-l-4 border-indigo-700 rounded-xl p-4 shadow-sm flex gap-3 z-10 leading-relaxed font-sans">
            <span className="text-2xl mt-0.5">🏟️</span>
            <div>
              <p className="text-xs text-slate-705">
                আপনার এলাকায় থাকা কোনো খোলা মাঠে বা পার্কে বড় পর্দায় প্রজেক্টরের খেলা চলছে? ম্যাপের ফাঁকা জায়গায় ক্লিক করে নতুন প্রজেক্টরের স্পট লিস্টিং করুন! এডমিন এটি যাচাই করে অ্যাপ্রুভ দিলেই সবাই লাইভ দেখতে পাবে।
              </p>
              {!user && (
                <button onClick={handleLogin} className="text-[11px] text-indigo-705 font-extrabold hover:underline mt-1.5 bg-white border border-indigo-250 px-2 py-0.5 rounded shadow-xs transition-all hover:bg-indigo-50">
                  স্পট যোগ করতে এখানে প্রেস করে লগইন করুন →
                </button>
              )}
            </div>
          </div>

          {/* Filtering Widgets Wrapper styled with thick geometric base border */}
          <div className="bg-white rounded-xl shadow-md border-b-4 border-indigo-900/30 border border-slate-200 p-5 space-y-4">
            
            {/* Search Input Filter for small screens */}
            <div className="relative md:hidden">
              <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="এলাকা বা স্পটের নাম দিয়ে খুঁজুন..."
                className="w-full pl-9 pr-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-650 bg-slate-50/50 placeholder-slate-400 font-sans"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600"
                >
                  ক্লিয়ার
                </button>
              )}
            </div>

            {/* Dashboard View Tabs Categories */}
            <div className="flex border-b border-slate-200 font-sans">
              <button
                onClick={() => setSelectedViewTab('approved')}
                className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-[3px] transition-all ${selectedViewTab === 'approved'
                  ? 'border-indigo-700 text-indigo-800'
                  : 'border-transparent text-slate-400 hover:text-slate-700'}`}
              >
                ✅ এপ্রুভড স্পট ({locations.filter(x => x.status === 'approved').length})
              </button>
              
              <button
                onClick={() => setSelectedViewTab('my_spots')}
                className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-[3px] transition-all ${selectedViewTab === 'my_spots'
                  ? 'border-indigo-700 text-indigo-800'
                  : 'border-transparent text-slate-400 hover:text-slate-700'}`}
              >
                👤 আমার তালিকা ({user ? locations.filter(x => x.creatorId === user.uid).length : 0})
              </button>

              <button
                onClick={() => setSelectedViewTab('pending_moderation')}
                className={`flex-1 pb-2.5 text-xs font-bold text-center border-b-[3px] transition-all ${selectedViewTab === 'pending_moderation'
                  ? 'border-indigo-700 text-indigo-800'
                  : 'border-transparent text-slate-400 hover:text-slate-700'}`}
              >
                ⚙️ পেন্ডিং ({locations.filter(x => x.status === 'pending').length})
              </button>
            </div>

            {/* Sub Filter Category Segments */}
            <div className="grid grid-cols-2 gap-3 text-xs font-sans">
              <div>
                <label className="block text-[10px] uppercase font-bold text-indigo-800 tracking-wider mb-1">এরিয়ার ক্যাটাগরি:</label>
                <select
                  value={selectedCategoryFilter}
                  onChange={(e) => setSelectedCategoryFilter(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-250 rounded-lg focus:ring-2 focus:ring-indigo-650 focus:outline-none font-sans"
                >
                  <option value="all">সব ক্যাটাগরি (All Areas)</option>
                  <option value="Playground">🏟️ খেলার মাঠ</option>
                  <option value="Park">🌳 পার্ক/উদ্যান</option>
                  <option value="Square">📍 মোড়/চত্বর</option>
                  <option value="Lakeside">🌊 লেকের পাড়</option>
                  <option value="Market">🛍️ খোলা বাজার স্পট</option>
                  <option value="Other">🍃 অন্যান্য উন্মুক্ত অঞ্চল</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] uppercase font-bold text-indigo-800 tracking-wider mb-1">লাইভ খেলা স্ট্যাটাস:</label>
                <select
                  value={selectedLiveFilter}
                  onChange={(e) => setSelectedLiveFilter(e.target.value as any)}
                  className="w-full p-2 bg-slate-50 border border-slate-250 rounded-lg focus:ring-2 focus:ring-indigo-650 focus:outline-none font-sans"
                >
                  <option value="all">সব খেলা স্ট্যাটাস</option>
                  <option value="streaming">🟢 খেলা চলছে (Active)</option>
                  <option value="upcoming">🟡 শীঘ্রই শুরু (Upcoming)</option>
                  <option value="inactive">🔴 খেলা এখন বন্ধ (Offline)</option>
                </select>
              </div>
            </div>

            {/* Admin evaluation disclaimer */}
            {selectedViewTab === 'pending_moderation' && (
              <div className="bg-amber-50 rounded-lg p-3 border border-amber-200 text-[11px] text-amber-900 leading-normal flex gap-1.5 font-sans">
                <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-amber-700" />
                <p>
                  পেন্ডিং লিস্টিংগুলো ডিফল্ট ম্যাপ স্ক্রিনে হাইড থাকে। শুধুমাত্র অ্যাডমিন (যেমন: <strong>{ADMIN_EMAIL}</strong>) এটি রিভিউ করে <strong>'Approve'</strong> করার পরেই তা সর্বজনীন ম্যাপে পিন হিসেবে যুক্ত হবে। পরীক্ষার সুবিধার্থে নিচে যেকোনো ইউজার থেকে এডমিন মডারেশন অ্যাকশন টেস্ট করতে পারেন!
                </p>
              </div>
            )}
          </div>

          {/* List display container */}
          <div className="flex-1 space-y-3 max-h-[380px] lg:max-h-[calc(100vh-385px)] overflow-y-auto pr-1">
            
            {/* Sync trigger floating indicator on mobile */}
            {!networkOnline && (
              <div className="sm:hidden bg-rose-500 text-white p-2.5 rounded-lg text-center text-xs font-bold flex items-center gap-1.5 justify-center">
                <WifiOff className="w-4 h-4 animate-pulse" /> অফলাইনে আছেন। ডাটা ফোনে ব্রাউজ হচ্ছে।
              </div>
            )}

            {isListLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((n) => (
                  <div key={n} className="bg-white rounded-xl h-24 w-full animate-pulse border border-slate-150"></div>
                ))}
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 font-sans space-y-2">
                <Compass className="w-10 h-10 text-slate-350 mx-auto" />
                <p className="font-extrabold text-slate-800 text-sm">কোনো লিস্টিং বা স্পট পাওয়া যায়নি!</p>
                <p className="text-xs text-slate-500 select-none">সার্চ কিউরি মেলাতে অথবা ক্যাটাগরি ফিল্টার পরিবর্তন করে পুনরায় ট্রাই করুন।</p>
                {selectedViewTab === 'my_spots' && !user && (
                  <p className="text-xs text-indigo-700 font-bold pt-1">আপনার তৈরি স্পট দেখতে ওপরে 'লগইন করুন' বাটনে ক্লিক করুন।</p>
                )}
              </div>
            ) : (
              filteredLocations.map((loc) => {
                const totalVotes = loc.realCount + loc.fakeCount;
                const realPercent = totalVotes > 0 ? Math.round((loc.realCount / totalVotes) * 100) : 0;
                const isSelected = selectedLocation?.id === loc.id;
                
                return (
                  <div
                    key={loc.id}
                    onClick={() => setSelectedLocation(loc)}
                    className={`p-4 rounded-xl border transition-all duration-300 ease-out cursor-pointer shadow-sm hover:shadow-xl hover:scale-[1.015] hover:-translate-y-0.5 active:scale-[0.995] flex flex-col gap-2 relative overflow-hidden group ${isSelected
                      ? 'bg-indigo-50/70 border-2 border-indigo-700 ring-2 ring-indigo-500/10'
                      : 'bg-white border-slate-200 hover:border-indigo-300'}`}
                  >
                    {/* Badge line representing geometric layout */}
                    <div className="flex justify-between items-start">
                      {/* Live status badge */}
                      <span className={`text-[9px] font-black tracking-wider px-2 py-0.5 rounded uppercase text-white ${loc.liveStatus === 'streaming'
                        ? 'bg-indigo-600'
                        : loc.liveStatus === 'upcoming'
                        ? 'bg-amber-500'
                        : 'bg-slate-400'}`}>
                        {loc.liveStatus === 'streaming' ? 'LIVE NOW' : loc.liveStatus === 'upcoming' ? 'UPCOMING' : 'CLOSED'}
                      </span>

                      {/* Approval status indicator styled according to design draft */}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded font-extrabold border uppercase ${
                        loc.status === 'approved'
                          ? 'text-emerald-700 border-emerald-250 bg-emerald-50/80'
                          : loc.status === 'pending'
                          ? 'text-amber-700 border-amber-250 bg-amber-50/80'
                          : 'text-rose-700 border-rose-200 bg-rose-50/80'}`}>
                        {loc.status === 'approved' ? 'এডমিন অনুমোদিত' : loc.status === 'pending' ? 'পেন্ডিং' : 'বাতিল'}
                      </span>
                    </div>

                    {/* Spot Title design matches custom style */}
                    <h3 className="font-bold text-slate-800 leading-tight text-sm md:text-base group-hover:text-indigo-700 transition-colors">
                      {loc.title}
                    </h3>

                    {/* Address landmark info detail */}
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <span className="shrink-0 text-slate-400">📍</span>
                      <span className="truncate">{loc.address}</span>
                    </p>

                    {/* Vote summary metrics styled with solid geometric accents */}
                    <div className="flex items-center justify-between text-[11px] font-sans pt-2 border-t border-slate-100 mt-1">
                      <div className="flex gap-1.5">
                        <span className="bg-slate-55 hover:bg-emerald-50 text-emerald-700 border border-slate-200 px-2 py-0.5 rounded font-bold text-[10px] transition-colors">
                          👍 রিয়েল ({loc.realCount})
                        </span>
                        <span className="bg-slate-55 hover:bg-rose-50 text-rose-700 border border-slate-200 px-2 py-0.5 rounded font-bold text-[10px] transition-colors">
                          ❌ ফেক ({loc.fakeCount})
                        </span>
                      </div>
                      {totalVotes > 0 ? (
                        <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest bg-slate-100 px-1.5 py-0.5 rounded">
                          {realPercent}% স্পটটি সত্য
                        </span>
                      ) : (
                        <span className="text-[9px] text-slate-400 italic">কোনো ভোট নেই</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Simulated Admin Trigger for Quick Evaluating */}
            <div className="border border-indigo-200 rounded-xl bg-indigo-50/25 p-4 text-center font-sans space-y-2 select-none shrink-0 border-dashed">
              <span className="text-xs text-indigo-900 font-extrabold block">📊 পরীক্ষা সহজীকরণ জোন (Admin Bypass)</span>
              <p className="text-[10px] text-slate-600 leading-normal">
                এডমিন ফিচার ও পেন্ডিং লিস্টিং মডারেশনগুলো দ্রুত পরীক্ষা করতে চান? নিচে বাটনে ক্লিক করুন:
              </p>
              <button
                onClick={handleMockAdminTesting}
                className="mx-auto block text-[10px] py-1.5 px-3 bg-indigo-700 hover:bg-indigo-800 text-white font-extrabold rounded-lg transition-all active:scale-95 shadow-sm uppercase tracking-wider"
              >
                টেস্ট অ্যাডমিন ভিউ চালু করুন ⚙️
              </button>
            </div>

          </div>

        </div>

        {/* RIGHT COLUMN: Map & Selected Location details (span 7) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          
          {/* Active selected Details side panel overlays Map on desktop */}
          {selectedLocation ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
              <div className="h-[280px] md:h-full">
                <MapComponent
                  locations={locations.filter(x => x.status === 'approved' || x.id === selectedLocation.id)}
                  selectedLocation={selectedLocation}
                  onSelectLocation={(loc) => setSelectedLocation(loc)}
                  onMapClickToAdd={handleMapClick}
                  userCoords={userCoordinates}
                  setUserCoords={setUserCoordinates}
                />
              </div>
              <div className="flex-1 md:h-[calc(100vh-140px)] overflow-y-auto">
                <LocationDetails
                  location={selectedLocation}
                  onClose={() => setSelectedLocation(null)}
                  onRefresh={handleLoadLocations}
                  adminEmail={ADMIN_EMAIL}
                  userCoords={userCoordinates}
                  currentUser={user}
                />
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col gap-4">
              <MapComponent
                locations={locations.filter(x => x.status === 'approved')}
                selectedLocation={selectedLocation}
                onSelectLocation={(loc) => setSelectedLocation(loc)}
                onMapClickToAdd={handleMapClick}
                userCoords={userCoordinates}
                setUserCoords={setUserCoordinates}
              />
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs flex items-center justify-between gap-4 font-sans leading-relaxed text-slate-650">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📍</span>
                  <p className="text-xs">
                    ম্যাপের যেকোনো স্পট চিহ্নে ক্লিক করে খেলা চলার চমৎকার লাইভ স্ট্যাটাস, সত্য/ফেক কমিউনিটি ভোট পর্যালোচনা করুন এবং যাওয়ার সংক্ষিপ্ত ট্রাভেল ডিরেকশন বের করুন।
                  </p>
                </div>
                {user && (
                  <button
                    onClick={() => {
                      if (userCoordinates) {
                        handleMapClick(userCoordinates);
                      } else {
                        handleMapClick({ lat: 23.777176, lng: 90.399452 });
                      }
                    }}
                    className="flex-shrink-0 text-xs py-2 px-3 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg shadow-md font-bold transition-all active:scale-95 flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> স্পট যোগ
                  </button>
                )}
              </div>
            </div>
          )}

        </div>

      </main>

      {/* FOOTER credit and offline synced count */}
      <footer className="bg-white border-t border-slate-200 py-3.5 mt-auto select-none">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 font-sans flex flex-col sm:flex-row items-center justify-between gap-2 leading-none font-medium">
          <p className="font-extrabold text-slate-600">© ২০২৬ খেলাপর্দা প্রজেক্টর ম্যাপ (MatchMap BD)। সর্বস্বত্ব সংরক্ষিত।</p>
          <div className="flex items-center gap-2">
            <span className="bg-indigo-50 text-indigo-750 px-2 py-0.5 rounded border border-indigo-100 text-[10px] font-bold">Offline Local Cache v1.2</span>
            {offlineQueueCount > 0 && (
              <span className="bg-amber-50 text-amber-800 px-2 py-0.5 rounded border border-amber-100 text-[10px] font-bold">{offlineQueueCount} টি ডাটাসিট অফলাইনে সিঙ্ক বাকি</span>
            )}
          </div>
        </div>
      </footer>

      {/* New listing Creation Form modal */}
      <AddLocationModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setClickedMapCoords(null);
        }}
        clickedCoords={clickedMapCoords}
        onCoordsChange={setClickedMapCoords}
        onSuccess={handleLoadLocations}
      />

      <LoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
      />
      
    </div>
  );
}

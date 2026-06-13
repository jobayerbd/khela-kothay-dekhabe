/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  collection,
  doc,
  setDoc,
  getDocs,
  updateDoc,
  writeBatch,
  query,
  where,
  orderBy,
  serverTimestamp,
  getDocsFromCache,
  getDocsFromServer
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { LocationItem, FeedbackVote, OpenAreaType, LiveStatus, ListingStatus } from './types';

const LOCATIONS_COLLECTION = 'locations';
const CACHE_KEY = 'khelaporda_locations_cache';
const QUEUE_KEY = 'khelaporda_offline_queue';

interface QueueItem {
  type: 'create_location' | 'vote';
  timestamp: number;
  payload: any;
}

// Helper to check network connectivity
export function isOnline(): boolean {
  return navigator.onLine;
}

let isMockAdminActive = false;

export function setMockAdminActive(active: boolean) {
  isMockAdminActive = active;
}

export function getMockAdminActive(): boolean {
  return isMockAdminActive;
}

// Get cached locations from LocalStorage
export function getLocalCachedLocations(): LocationItem[] {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    console.error("Failed to read local cache:", err);
    return [];
  }
}

// Save locations to LocalStorage cache
export function setLocalCachedLocations(locations: LocationItem[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(locations));
  } catch (err) {
    console.error("Failed to write local cache:", err);
  }
}

// Get offline queue
export function getOfflineQueue(): QueueItem[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (err) {
    return [];
  }
}

// Save offline queue
export function saveOfflineQueue(queue: QueueItem[]) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch (err) {
    console.error("Failed to save offline queue:", err);
  }
}

// Add an item to the offline queue
export function addToOfflineQueue(type: 'create_location' | 'vote', payload: any) {
  const queue = getOfflineQueue();
  queue.push({
    type,
    timestamp: Date.now(),
    payload
  });
  saveOfflineQueue(queue);
  
  // Dispatch custom event to notify listeners
  window.dispatchEvent(new Event('offline-queue-updated'));
}

/**
 * Fetch all locations.
 * If online, fetch from server and update local cache.
 * If offline or server fetch fails, fallback to local cache.
 */
export async function fetchLocations(): Promise<LocationItem[]> {
  if (!isOnline()) {
    console.log("Device is offline, loading locations from local cache");
    return getLocalCachedLocations();
  }

  try {
    const colRef = collection(db, LOCATIONS_COLLECTION);
    // Order by createdAt descending
    const q = query(colRef, orderBy('createdAt', 'desc'));
    
    let snapshot;
    try {
      snapshot = await getDocsFromServer(q);
    } catch (e) {
      // Fallback to cache if server fails
      console.warn("Server fetch failed, trying local Firestore cache:", e);
      snapshot = await getDocsFromCache(q);
    }

    const items: LocationItem[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      
      let status = data.status || 'pending';
      let liveStatus = data.liveStatus || 'inactive';
      
      if (isMockAdminActive) {
        const cached = getLocalCachedLocations();
        const localCopy = cached.find((x: any) => x.id === id);
        if (localCopy) {
          status = localCopy.status;
          liveStatus = localCopy.liveStatus;
        }
      }

      items.push({
        id,
        title: data.title || '',
        description: data.description || '',
        openAreaType: data.openAreaType || 'Other',
        lat: Number(data.lat),
        lng: Number(data.lng),
        address: data.address || '',
        status,
        liveStatus,
        realCount: Number(data.realCount || 0),
        fakeCount: Number(data.fakeCount || 0),
        creatorId: data.creatorId || '',
        creatorEmail: data.creatorEmail || '',
        createdAt: data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toISOString() : data.createdAt) : null,
        updatedAt: data.updatedAt ? (data.updatedAt.toDate ? data.updatedAt.toDate().toISOString() : data.updatedAt) : null,
      });
    });

    setLocalCachedLocations(items);
    return items;
  } catch (error) {
    console.error("Error fetching locations, using local fallback:", error);
    return getLocalCachedLocations();
  }
}

/**
 * Add a new open-area location.
 * Requires logged-in verified user. Supports offline queueing.
 */
export async function createLocation(location: {
  title: string;
  description: string;
  openAreaType: OpenAreaType;
  lat: number;
  lng: number;
  address: string;
}): Promise<string | { offline: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error("অনুগ্রহ করে প্রথমে লগইন করুন।");

  const newId = doc(collection(db, LOCATIONS_COLLECTION)).id;
  
  const payload = {
    id: newId,
    title: location.title,
    description: location.description,
    openAreaType: location.openAreaType,
    lat: location.lat,
    lng: location.lng,
    address: location.address,
    status: 'pending' as ListingStatus,
    liveStatus: 'inactive' as LiveStatus,
    realCount: 0,
    fakeCount: 0,
    creatorId: user.uid,
    creatorEmail: user.email || 'unknown',
    createdAt: new Date().toISOString(), // Use local string and transform on upload or use serverTimestamp
    updatedAt: new Date().toISOString(),
  };

  if (!isOnline()) {
    // Save locally to display immediately on user's own draft list
    const cached = getLocalCachedLocations();
    cached.unshift({
      ...payload,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setLocalCachedLocations(cached);
    
    // Add to queue
    addToOfflineQueue('create_location', payload);
    return { offline: true };
  }

  try {
    const docRef = doc(db, LOCATIONS_COLLECTION, newId);
    await setDoc(docRef, {
      ...payload,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${LOCATIONS_COLLECTION}/${newId}`);
    throw error;
  }
}

/**
 * Vote (Real / Fake) on a location.
 * Uses atomic transaction via client-side batch to set feedback and increment counter.
 */
export async function voteLocation(locationId: string, voteType: 'real' | 'fake'): Promise<{ success: boolean; offline?: boolean }> {
  const user = auth.currentUser;
  if (!user) throw new Error("অনুগ্রহ করে ভোট দেয়ার জন্য লগইন করুন।");

  const votePayload = {
    locationId,
    userId: user.uid,
    userEmail: user.email || 'unknown',
    voteType,
    createdAt: new Date().toISOString()
  };

  if (!isOnline()) {
    // Optimistic UI updates in cache
    const cached = getLocalCachedLocations();
    const idx = cached.findIndex(x => x.id === locationId);
    if (idx !== -1) {
      if (voteType === 'real') cached[idx].realCount += 1;
      else cached[idx].fakeCount += 1;
      setLocalCachedLocations(cached);
    }

    addToOfflineQueue('vote', votePayload);
    return { success: true, offline: true };
  }

  const batch = writeBatch(db);
  const locationRef = doc(db, LOCATIONS_COLLECTION, locationId);
  const feedbackRef = doc(db, LOCATIONS_COLLECTION, locationId, 'feedbacks', user.uid);

  // Set the feedback document
  batch.set(feedbackRef, {
    id: user.uid,
    userId: user.uid,
    userEmail: user.email || 'unknown',
    voteType,
    createdAt: serverTimestamp()
  });

  // Calculate increment
  const incrementField = voteType === 'real' ? 'realCount' : 'fakeCount';
  
  // We can fetch or simply update with +1
  // First we need to get existing in client or just increment via serverTimestamp logic
  // Let's load the current location item to see if it exists
  const snapshot = getLocalCachedLocations().find(l => l.id === locationId);
  const currentCount = snapshot ? (voteType === 'real' ? snapshot.realCount : snapshot.fakeCount) : 0;

  batch.update(locationRef, {
    [incrementField]: currentCount + 1,
    updatedAt: serverTimestamp()
  });

  try {
    await batch.commit();
    return { success: true };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${LOCATIONS_COLLECTION}/${locationId}`);
    throw error;
  }
}

/**
 * Check if the user has already voted on this location.
 * Uses cache fallback.
 */
export async function checkHasUserVoted(locationId: string): Promise<'real' | 'fake' | null> {
  const user = auth.currentUser;
  if (!user) return null;

  try {
    if (!isOnline()) {
      // Offline fallback: check local storage votes history database
      const key = `khelaporda_votes_${user.uid}`;
      const votesMap = JSON.parse(localStorage.getItem(key) || '{}');
      return votesMap[locationId] || null;
    }

    const docRef = doc(db, LOCATIONS_COLLECTION, locationId, 'feedbacks', user.uid);
    const snap = await getDocs(query(collection(db, LOCATIONS_COLLECTION, locationId, 'feedbacks'), where('userId', '==', user.uid)));
    if (!snap.empty) {
      const voteData = snap.docs[0].data();
      
      // Save locally
      const key = `khelaporda_votes_${user.uid}`;
      const votesMap = JSON.parse(localStorage.getItem(key) || '{}');
      votesMap[locationId] = voteData.voteType;
      localStorage.setItem(key, JSON.stringify(votesMap));

      return voteData.voteType;
    }
    return null;
  } catch (error) {
    console.error("Error checking user vote:", error);
    // Try offline map
    const key = `khelaporda_votes_${user.uid}`;
    const votesMap = JSON.parse(localStorage.getItem(key) || '{}');
    return votesMap[locationId] || null;
  }
}

/**
 * Process/Sync the offline queue to Firestore.
 */
export async function syncOfflineQueue(): Promise<number> {
  if (!isOnline()) return 0;
  
  const queue = getOfflineQueue();
  if (queue.length === 0) return 0;
  
  console.log(`Starting to sync ${queue.length} offline operations to Firebase.`);
  let successCount = 0;
  const remaining: QueueItem[] = [];

  for (const item of queue) {
    try {
      if (item.type === 'create_location') {
        const { id, title, description, openAreaType, lat, lng, address, creatorId, creatorEmail } = item.payload;
        const docRef = doc(db, LOCATIONS_COLLECTION, id);
        
        await setDoc(docRef, {
          id,
          title,
          description,
          openAreaType,
          lat,
          lng,
          address,
          status: 'pending',
          liveStatus: 'inactive',
          realCount: 0,
          fakeCount: 0,
          creatorId,
          creatorEmail,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        successCount++;
      } else if (item.type === 'vote') {
        const { locationId, userId, userEmail, voteType } = item.payload;
        
        const batch = writeBatch(db);
        const locRef = doc(db, LOCATIONS_COLLECTION, locationId);
        const fbRef = doc(db, LOCATIONS_COLLECTION, locationId, 'feedbacks', userId);

        batch.set(fbRef, {
          id: userId,
          userId,
          userEmail,
          voteType,
          createdAt: serverTimestamp()
        });

        // We use step-based increment
        const incrementField = voteType === 'real' ? 'realCount' : 'fakeCount';
        // Note: we can use a server transaction, but for batch sync, we can update directly
        // Let's load the doc to see the current server count, or just read from local cache which is optimistic
        const cacheLoc = getLocalCachedLocations().find(loc => loc.id === locationId);
        const freshCount = cacheLoc ? (voteType === 'real' ? cacheLoc.realCount : cacheLoc.fakeCount) : 1;

        batch.update(locRef, {
          [incrementField]: freshCount,
          updatedAt: serverTimestamp()
        });

        await batch.commit();

        // Update local status map
        const key = `khelaporda_votes_${userId}`;
        const votesMap = JSON.parse(localStorage.getItem(key) || '{}');
        votesMap[locationId] = voteType;
        localStorage.setItem(key, JSON.stringify(votesMap));

        successCount++;
      }
    } catch (err) {
      console.error("Failed to sync offline item, rescheduling:", err, item);
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  
  // Refresh locations to sync actual cloud counters
  if (successCount > 0) {
    await fetchLocations();
  }

  // Dispatch custom event to notify listeners
  window.dispatchEvent(new Event('offline-queue-updated'));
  return successCount;
}

/**
 * Admin action: Approve or reject custom listing.
 */
export async function updateLocationStatus(locationId: string, status: ListingStatus): Promise<void> {
  const user = auth.currentUser;
  
  // If we are in mock-admin mode, let's bypass Firestore and just update the local cached list so they can easily preview!
  if (isMockAdminActive) {
    const cached = getLocalCachedLocations();
    const idx = cached.findIndex(l => l.id === locationId);
    if (idx !== -1) {
      cached[idx].status = status;
      cached[idx].updatedAt = new Date().toISOString();
      setLocalCachedLocations(cached);
    }
    console.log("Mock Admin Mode: updated location status locally.");
    return;
  }

  if (!isOnline()) throw new Error("অফলাইনে অ্যাডমিন অপারেশন সম্ভব নয়।");

  try {
    const docRef = doc(db, LOCATIONS_COLLECTION, locationId);
    await updateDoc(docRef, {
      status,
      updatedAt: serverTimestamp()
    });
    
    // Update local cache
    const cached = getLocalCachedLocations();
    const idx = cached.findIndex(l => l.id === locationId);
    if (idx !== -1) {
      cached[idx].status = status;
      setLocalCachedLocations(cached);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${LOCATIONS_COLLECTION}/${locationId}`);
  }
}

/**
 * Creator/Admin action: Update active matchmaking streaming state.
 */
export async function updateLiveStatus(locationId: string, liveStatus: LiveStatus): Promise<void> {
  const user = auth.currentUser;

  // Let's also bypass if they are mock admin
  if (isMockAdminActive) {
    const cached = getLocalCachedLocations();
    const idx = cached.findIndex(l => l.id === locationId);
    if (idx !== -1) {
      cached[idx].liveStatus = liveStatus;
      cached[idx].updatedAt = new Date().toISOString();
      setLocalCachedLocations(cached);
    }
    console.log("Mock Admin Mode: updated live status locally.");
    return;
  }

  if (!isOnline()) throw new Error("লাইভ স্ট্যাটাস পরিবর্তন করতে ইন্টারনেট সংযোগ প্রয়োজন।");

  try {
    const docRef = doc(db, LOCATIONS_COLLECTION, locationId);
    await updateDoc(docRef, {
      liveStatus,
      updatedAt: serverTimestamp()
    });

    // Update local cache
    const cached = getLocalCachedLocations();
    const idx = cached.findIndex(l => l.id === locationId);
    if (idx !== -1) {
      cached[idx].liveStatus = liveStatus;
      setLocalCachedLocations(cached);
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${LOCATIONS_COLLECTION}/${locationId}`);
  }
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type OpenAreaType = 'Park' | 'Playground' | 'Square' | 'Lakeside' | 'Market' | 'Other';

export type ListingStatus = 'pending' | 'approved' | 'rejected';

export type LiveStatus = 'upcoming' | 'streaming' | 'inactive';

export interface LocationItem {
  id: string;
  title: string;
  description: string;
  openAreaType: OpenAreaType;
  lat: number;
  lng: number;
  address: string;
  status: ListingStatus;
  liveStatus: LiveStatus;
  realCount: number;
  fakeCount: number;
  creatorId: string;
  creatorEmail: string;
  createdAt: any; // Timestamp
  updatedAt: any; // Timestamp
}

export interface FeedbackVote {
  id: string; // user ID
  userId: string;
  userEmail: string;
  voteType: 'real' | 'fake';
  createdAt: any; // Timestamp
}

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  isAdmin: boolean;
}

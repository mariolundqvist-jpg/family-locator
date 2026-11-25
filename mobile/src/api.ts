/**
 * Thin client for the SafePath API.
 *
 * Differences from the web client:
 *  - the session token is held in the OS keychain, not a cookie
 *  - every request sends `x-safepath-client: mobile`, which is what makes the
 *    server return a bearer token at sign-in
 *  - no code path here can change another member's sharing; the API offers none
 *  - nothing in this file logs a request body: bodies contain coordinates
 */
import * as SecureStore from 'expo-secure-store';

import { API_BASE } from './config';

const TOKEN_KEY = 'safepath.session';

export type FamilySummary = {
  familyId: string;
  familyName: string;
  memberId: string;
  role: 'owner' | 'adult';
  sharingState: 'on' | 'off' | 'paused';
  memberCount: number;
};

export type MeResponse = {
  user: { id: string; email: string | null; displayName: string; createdAt: number };
  families: FamilySummary[];
  policy: { currentMaxMs: number; staleMaxMs: number; retentionMs: number };
};

export type MemberView = {
  memberId: string;
  userId: string;
  displayName: string;
  role: 'owner' | 'adult';
  isSelf: boolean;
  joinedAt: number;
  sharing: { state: 'on' | 'off' | 'paused'; updatedAt: number; mode: 'none' | 'live' | 'checkin' };
  consent: { foreground: boolean; background: boolean; version: number | null };
  location: {
    lat: number;
    lng: number;
    accuracyM: number;
    accuracyBand: 'high' | 'medium' | 'low';
    capturedAt: number;
    receivedAt: number;
    source: 'foreground' | 'background' | 'checkin';
    state: 'current' | 'stale' | 'unavailable';
    reason: string;
    ageMs: number;
  } | null;
  unavailableReason: 'paused' | 'not_sharing' | 'no_fix' | null;
  distanceFromViewerM: number | null;
};

export type FamilyView = {
  family: { id: string; name: string; ownerId: string; createdAt: number; memberCount: number; maxMembers: number };
  viewer: {
    memberId: string;
    role: 'owner' | 'adult';
    sharingState: 'on' | 'off' | 'paused';
    consent: { foreground: boolean; background: boolean; version: number | null; currentVersion: number };
  };
  members: MemberView[];
  policy: { currentMaxMs: number; staleMaxMs: number; retentionMs: number; serverTime: number };
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** 4xx (except 429) will never succeed on retry. */
  get retryable(): boolean {
    if (this.status === 429) return true;
    return !(this.status >= 400 && this.status < 500);
  }
}

let cachedToken: string | null = null;

export async function loadToken(): Promise<string | null> {
  if (cachedToken) return cachedToken;
  try {
    cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    cachedToken = null;
  }
  return cachedToken;
}

export async function saveToken(token: string): Promise<void> {
  cachedToken = token;
  await SecureStore.setItemAsync(TOKEN_KEY, token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

export async function clearToken(): Promise<void> {
  cachedToken = null;
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await loadToken();
  const headers: Record<string, string> = {
    'x-safepath-client': 'mobile',
    accept: 'application/json',
    ...(init.body ? { 'content-type': 'application/json' } : {}),
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };

  let res: Response;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, signal: controller.signal });
  } catch (err) {
    // Network failure: retryable, and carries no coordinate.
    throw new ApiError('Could not reach SafePath. Check your connection.', 0, 'network');
  } finally {
    clearTimeout(timeout);
  }

  const text = await res.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
  }

  if (!res.ok) {
    const error = (json as { error?: { message?: string; code?: string } } | null)?.error;
    throw new ApiError(error?.message ?? `Request failed (${res.status})`, res.status, error?.code);
  }

  return json as T;
}

export async function requestCode(email: string) {
  return request<{
    ok: true;
    expiresInSec: number;
    delivery: 'dev' | 'email';
    message: string;
    /** Present only when the server runs with DEV_DELIVERY=1. */
    devCode?: string;
  }>('/api/auth/request-code', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyCode(email: string, code: string, displayName?: string) {
  const out = await request<{
    ok: true;
    user: { id: string; email: string; displayName: string };
    sessionToken?: string;
  }>('/api/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ email, code, displayName }),
  });

  if (!out.sessionToken) {
    throw new ApiError(
      'This server did not issue a token for a native client. It may be an older build.',
      500,
      'no_token',
    );
  }

  await saveToken(out.sessionToken);
  return out.user;
}

export async function logout() {
  try {
    await request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
  } finally {
    await clearToken();
  }
}

export async function me() {
  return request<MeResponse>('/api/me');
}

export async function familyView(familyId: string) {
  return request<FamilyView>(`/api/families/${familyId}`);
}

export async function createFamily(name: string) {
  return request<{ family: { id: string; name: string }; memberId: string }>('/api/families', {
    method: 'POST',
    body: JSON.stringify({ name }),
  });
}

export type Invite = {
  id: string;
  expiresAt: number;
  expiresInSec: number;
  /** Opaque single-use token. Safe to paste; it grants joining, not sharing. */
  token: string;
  link: string;
};

export async function createInvite(familyId: string) {
  return request<{ invite: Invite }>(`/api/families/${familyId}/invites`, { method: 'POST' });
}

export async function acceptInvite(token: string) {
  return request<{
    ok: true;
    alreadyMember: boolean;
    family: { id: string; name: string };
    memberId: string;
    /** Stated by the server so the client cannot imply otherwise. */
    locationAuthorisedByInvite: false;
    sharingState: 'on' | 'off' | 'paused';
    nextStep: string;
  }>('/api/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function grantConsent(scope: 'foreground' | 'background', accepted: boolean) {
  return request<{ ok: true }>('/api/me/consent', {
    method: 'POST',
    body: JSON.stringify({ scope, accepted }),
  });
}

export async function setSharing(state: 'on' | 'off' | 'paused') {
  return request<{ ok: true; sharingState: string }>('/api/me/sharing', {
    method: 'POST',
    body: JSON.stringify({ state }),
  });
}

export async function postFix(args: {
  memberId: string;
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: number;
  source: 'foreground' | 'background' | 'checkin';
}) {
  const path = args.source === 'checkin' ? '/api/me/checkin' : '/api/me/location';
  return request<{ ok: true; state: string }>(path, {
    method: 'POST',
    body: JSON.stringify(args),
  });
}

export async function requestCheckIn(familyId: string, memberId: string) {
  return request<{ ok: true }>(`/api/families/${familyId}/checkin-request`, {
    method: 'POST',
    body: JSON.stringify({ memberId }),
  });
}

export async function leaveFamily(familyId: string) {
  return request<{ ok: true }>(`/api/families/${familyId}/leave`, { method: 'POST' });
}

export async function removeMember(familyId: string, memberId: string) {
  return request<{ ok: true }>(`/api/families/${familyId}/members/${memberId}`, { method: 'DELETE' });
}

export async function deleteAccount() {
  try {
    return await request<{ ok: true }>('/api/me/data', { method: 'DELETE' });
  } finally {
    await clearToken();
  }
}

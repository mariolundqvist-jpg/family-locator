import crypto from 'node:crypto';
import { config } from './config.js';
import { errors } from './http.js';
import {
  hashToken, normaliseEmail, randomDigits, randomToken, safeEqual,
} from './security.js';
import { accuracyBand, deriveState, distanceM, validateCoordinate } from './geo.js';

export const CONSENT_VERSION = '2026-10-location-v1';

const now = () => Date.now();
const uid = () => crypto.randomUUID();

/* ------------------------------------------------------------------ */
/* Session / identity                                                  */
/* ------------------------------------------------------------------ */

export async function requestSignInCode(store, { email: rawEmail, ip, mailer }) {
  const email = normaliseEmail(rawEmail);
  if (!email) throw errors.badRequest('That does not look like an email address.');

  const code = randomDigits(6);
  const record = {
    email,
    hash: hashToken(code, 'signin-code'),
    createdAt: now(),
    expiresAt: now() + config.codeTtlMs,
    attempts: 0,
  };

  // Store keyed by email so re-requesting replaces the previous code rather
  // than accumulating valid codes.
  await store.mutate((db) => {
    db.codes = db.codes || {};
    db.codes[email] = record;
  });
  await store.audit({ event: 'auth.code_requested', ip, emailDomain: email.split('@')[1] });

  const body = {
    ok: true,
    expiresInSec: Math.floor(config.codeTtlMs / 1000),
    delivery: config.devDelivery ? 'dev' : 'email',
    message: 'If that address can be used, a sign-in code has been sent.',
  };

  if (config.devDelivery) {
    // Demo authentication. Only reachable when DEV_DELIVERY=1, which is refused
    // outright when NODE_ENV=production (see config.js). The code is returned to
    // the caller and shown in the UI so an isolated demo needs no email account.
    body.devCode = code;
    return body;
  }

  const result = await mailer.sendSignInCode({
    to: email,
    code,
    ttlMinutes: Math.round(config.codeTtlMs / 60000),
  });
  // The response is identical whether or not delivery succeeded: sign-in must
  // not become an oracle for which addresses exist.
  body.delivered = result.delivered;
  return body;
}

export async function verifySignInCode(store, { email: rawEmail, code, displayName, ip, userAgent }) {
  const email = normaliseEmail(rawEmail);
  if (!email) throw errors.badRequest('That does not look like an email address.');
  const digits = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(digits)) throw errors.badRequest('Enter the 6-digit code.');

  const snap = await store.snapshot();
  const pending = (snap.codes || {})[email];
  // Compare against a dummy hash when nothing is pending so that the response
  // time does not disclose whether a code was requested for this address.
  const expected = pending ? pending.hash : hashToken('000000', 'signin-code');
  const ok = safeEqual(hashToken(digits, 'signin-code'), expected);

  if (!pending || now() > pending.expiresAt || pending.attempts >= config.codeMaxAttempts) {
    throw errors.badRequest('That code has expired. Request a new one.');
  }
  if (!ok) {
    const lockedOut = await store.mutate((db) => {
      const c = (db.codes || {})[email];
      if (!c) return false;
      c.attempts += 1;
      if (c.attempts >= config.codeMaxAttempts) {
        // Burn the code rather than leaving a live secret behind after a
        // guessing run.
        delete db.codes[email];
        return true;
      }
      return false;
    });
    if (lockedOut) {
      throw errors.badRequest('Too many incorrect attempts. Request a new code.');
    }
    throw errors.badRequest('That code is not correct.');
  }

  const sessionToken = randomToken(32);
  const sessionId = hashToken(sessionToken, 'session');

  const result = await store.mutate((db) => {
    delete db.codes[email];
    let user = Object.values(db.users).find((u) => u.email === email);
    if (!user) {
      if (!config.production && process.env.ALLOW_SIGNUP === '0') {
        throw errors.forbidden('Sign-ups are closed.');
      }
      user = {
        id: uid(),
        email,
        displayName: sanitiseName(displayName) || email.split('@')[0],
        createdAt: now(),
        lastSeenAt: now(),
      };
      db.users[user.id] = user;
    } else if (displayName) {
      user.displayName = sanitiseName(displayName) || user.displayName;
    }

    db.sessions[sessionId] = {
      userId: user.id,
      createdAt: now(),
      lastSeenAt: now(),
      expiresAt: now() + config.sessionTtlMs,
      ip,
      userAgent: String(userAgent || '').slice(0, 200),
    };
    return { user, sessionToken };
  });

  await store.audit({ event: 'auth.signed_in', userId: result.user.id, ip });
  return result;
}

export function sanitiseName(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(/\s+/g, ' ');
  if (!trimmed) return null;
  // Names are display-only. Strip control characters and cap the length.
  return trimmed.replace(/[\u0000-\u001f\u007f<>]/g, '').slice(0, 40);
}

export function resolveSession(db, token) {
  if (!token) return null;
  const sessionId = hashToken(token, 'session');
  const session = db.sessions[sessionId];
  if (!session) return null;
  if (now() > session.expiresAt || now() - session.lastSeenAt > config.sessionIdleMs) return null;
  const user = db.users[session.userId];
  if (!user) return null;
  return { sessionId, session, user };
}

export async function touchSession(store, sessionId) {
  await store.mutate((db) => {
    const s = db.sessions[sessionId];
    if (s) s.lastSeenAt = now();
  });
}

/* ------------------------------------------------------------------ */
/* Families and membership                                             */
/* ------------------------------------------------------------------ */

export function activeMembership(db, userId, familyId) {
  const member = Object.values(db.members)
    .find((m) => m.userId === userId && m.familyId === familyId && m.state === 'active');
  return member || null;
}

export function membershipsForUser(db, userId) {
  return Object.values(db.members)
    .filter((m) => m.userId === userId && m.state === 'active')
    .map((m) => {
      const family = db.families[m.familyId];
      const count = Object.values(db.members)
        .filter((x) => x.familyId === m.familyId && x.state === 'active').length;
      return {
        familyId: m.familyId,
        familyName: family ? family.name : 'Family',
        memberId: m.id,
        role: m.role,
        sharingState: m.sharingState,
        memberCount: count,
      };
    });
}

export async function createFamily(store, { userId, name }) {
  const familyName = sanitiseName(name) || 'My family';
  return store.mutate((db) => {
    const owned = Object.values(db.members).filter((m) => m.userId === userId && m.state === 'active');
    if (owned.length >= config.maxFamiliesPerUser) {
      throw errors.conflict(`You can be in ${config.maxFamiliesPerUser} family groups at a time.`, 'family_limit');
    }
    if (Object.keys(db.families).length >= config.maxFamiliesTotal) {
      throw errors.conflict('This instance has reached its family-group limit.', 'instance_limit');
    }
    const family = { id: uid(), name: familyName, ownerId: userId, createdAt: now() };
    const member = {
      id: uid(),
      familyId: family.id,
      userId,
      role: 'owner',
      state: 'active',
      joinedAt: now(),
      sharingState: 'off',
      sharingUpdatedAt: now(),
      consent: { foreground: null, background: null },
    };
    db.families[family.id] = family;
    db.members[member.id] = member;
    return { family, member };
  });
}

/**
 * An invitation grants the *right to ask to join*. It grants nothing else.
 * Accepting creates a member whose sharing state is 'off' and whose consent
 * record is empty — no location has been authorised by joining a family.
 */
export async function createInvite(store, { userId, familyId, origin }) {
  return store.mutate((db) => {
    const member = activeMembership(db, userId, familyId);
    if (!member) throw errors.notFound('Family not found.');
    if (member.role !== 'owner') throw errors.forbidden('Only the group owner can invite people.');

    const activeCount = Object.values(db.members)
      .filter((m) => m.familyId === familyId && m.state === 'active').length;
    if (activeCount >= config.maxMembersPerFamily) {
      throw errors.conflict(`This group is full (${config.maxMembersPerFamily} people).`, 'group_full');
    }

    const token = randomToken(32);
    const invite = {
      id: uid(),
      familyId,
      createdByUserId: userId,
      tokenHash: hashToken(token, 'invite'),
      createdAt: now(),
      expiresAt: now() + config.inviteTtlMs,
      usedAt: null,
      usedByUserId: null,
      revokedAt: null,
    };
    db.invites[invite.id] = invite;
    return {
      invite: {
        id: invite.id,
        expiresAt: invite.expiresAt,
        expiresInSec: Math.floor(config.inviteTtlMs / 1000),
      },
      token,
      // Token sits in the URL fragment so it is never sent to the server in a
      // request line or stored in access logs.
      link: `${origin}/join#${token}`,
    };
  });
}

export async function peekInvite(store, { token }) {
  if (typeof token !== 'string' || token.length < 20) {
    throw errors.notFound('This invitation link is not valid.');
  }
  const tokenHash = hashToken(token, 'invite');
  const db = await store.snapshot();
  const invite = Object.values(db.invites).find((i) => safeEqual(i.tokenHash, tokenHash));
  if (!invite) throw errors.notFound('This invitation link is not valid.');
  const family = db.families[invite.familyId];
  const inviter = db.users[invite.createdByUserId];
  const state = inviteState(invite, family);
  if (state !== 'valid') throw new HttpErrorForInvite(state);
  return {
    familyName: family.name,
    inviterName: inviter ? inviter.displayName : 'A family member',
    expiresAt: invite.expiresAt,
    secondsRemaining: Math.max(0, Math.floor((invite.expiresAt - now()) / 1000)),
    membersHint: Object.values(db.members)
      .filter((m) => m.familyId === family.id && m.state === 'active').length,
  };
}

function HttpErrorForInvite(state) {
  const map = {
    expired: () => errors.gone('This invitation has expired. Ask for a new one.', 'invite_expired'),
    used: () => errors.gone('This invitation has already been used.', 'invite_used'),
    revoked: () => errors.forbidden('This invitation was withdrawn.', 'invite_revoked'),
    family_missing: () => errors.notFound('That family group no longer exists.', 'family_missing'),
  };
  return (map[state] || map.revoked)();
}

function inviteState(invite, family) {
  if (!family) return 'family_missing';
  if (invite.revokedAt) return 'revoked';
  if (invite.usedAt) return 'used';
  if (now() > invite.expiresAt) return 'expired';
  return 'valid';
}

export async function acceptInvite(store, { userId, token }) {
  if (typeof token !== 'string' || token.length < 20) {
    throw errors.notFound('This invitation link is not valid.');
  }
  const tokenHash = hashToken(token, 'invite');

  return store.mutate((db) => {
    const invite = Object.values(db.invites).find((i) => safeEqual(i.tokenHash, tokenHash));
    if (!invite) throw errors.notFound('This invitation link is not valid.');
    const family = db.families[invite.familyId];
    const state = inviteState(invite, family);
    if (state !== 'valid') throw HttpErrorForInvite(state);

    const existing = activeMembership(db, userId, invite.familyId);
    if (existing) {
      // Idempotent for the same person: consuming the token twice must not
      // create a second membership.
      invite.usedAt = invite.usedAt || now();
      invite.usedByUserId = invite.usedByUserId || userId;
      return { family, member: existing, alreadyMember: true };
    }

    const activeCount = Object.values(db.members)
      .filter((m) => m.familyId === invite.familyId && m.state === 'active').length;
    if (activeCount >= config.maxMembersPerFamily) {
      throw errors.conflict('This group is full.', 'group_full');
    }

    const prior = Object.values(db.members)
      .find((m) => m.userId === userId && m.familyId === invite.familyId);

    let member;
    if (prior) {
      // Re-joining after leaving: fresh record, previous state not restored.
      Object.assign(prior, {
        state: 'active',
        role: 'adult',
        joinedAt: now(),
        sharingState: 'off',
        sharingUpdatedAt: now(),
        consent: { foreground: null, background: null },
      });
      member = prior;
    } else {
      member = {
        id: uid(),
        familyId: invite.familyId,
        userId,
        role: 'adult',
        state: 'active',
        joinedAt: now(),
        sharingState: 'off',
        sharingUpdatedAt: now(),
        consent: { foreground: null, background: null },
      };
      db.members[member.id] = member;
    }

    invite.usedAt = now();
    invite.usedByUserId = userId;
    return { family, member, alreadyMember: false };
  });
}

export async function revokeInvite(store, { userId, inviteId }) {
  return store.mutate((db) => {
    const invite = db.invites[inviteId];
    if (!invite) throw errors.notFound('Invitation not found.');
    const m = activeMembership(db, userId, invite.familyId);
    if (!m || m.role !== 'owner') throw errors.forbidden('Only the group owner can withdraw an invitation.');
    if (!invite.usedAt && !invite.revokedAt) invite.revokedAt = now();
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Consent and sharing                                                 */
/* ------------------------------------------------------------------ */

export function purgeLocation(db, memberId) {
  if (db.locations[memberId]) {
    delete db.locations[memberId];
    return true;
  }
  return false;
}

export async function setConsent(store, { userId, scope, accepted, version }) {
  if (scope !== 'foreground' && scope !== 'background') {
    throw errors.badRequest('Unknown consent scope.');
  }
  if (typeof accepted !== 'boolean') throw errors.badRequest('accepted must be true or false.');

  return store.mutate((db) => {
    const members = Object.values(db.members).filter((m) => m.userId === userId && m.state === 'active');
    if (!members.length) throw errors.conflict('Join a family group before choosing what to share.', 'no_family');

    for (const m of members) {
      if (scope === 'background' && accepted && !m.consent.foreground) {
        throw errors.conflict('Turn on location sharing before enabling background updates.', 'foreground_first');
      }
      m.consent[scope] = accepted
        ? { version: version || CONSENT_VERSION, at: now() }
        : null;

      if (!accepted) {
        // Withdrawing consent stops sharing immediately and destroys the last
        // known position. Consent withdrawal must not leave a dot on a map.
        if (scope === 'foreground') {
          m.sharingState = 'off';
          m.sharingUpdatedAt = now();
          purgeLocation(db, m.id);
        } else if (m.sharingState === 'on') {
          // Background withdrawn while live: stop collecting in the background.
          m.backgroundStoppedAt = now();
        }
      }
    }
    return { ok: true, membersAffected: members.length };
  });
}

export async function setSharing(store, { userId, state }) {
  if (!['on', 'off', 'paused'].includes(state)) throw errors.badRequest('state must be on, off or paused.');

  return store.mutate((db) => {
    const members = Object.values(db.members).filter((m) => m.userId === userId && m.state === 'active');
    if (!members.length) throw errors.conflict('Join a family group first.', 'no_family');

    for (const m of members) {
      if (state === 'on' && !m.consent.foreground) {
        throw errors.conflict(
          'You need to turn on location sharing consent first.',
          'consent_required',
        );
      }
      m.sharingState = state;
      m.sharingUpdatedAt = now();
      if (state !== 'on') {
        // Pausing or stopping destroys the stored position rather than freezing
        // it, so a paused member can never appear as a stale dot.
        purgeLocation(db, m.id);
      }
    }
    return { ok: true, sharingState: state };
  });
}

/**
 * Only the owner of the data may change it. There is deliberately no code path
 * that lets member A change member B's sharing state; the route takes no
 * member id at all, which makes that class of bug unrepresentable.
 */
export async function recordLocation(store, { userId, memberId, payload, source, ip }) {
  const validated = validateCoordinate(payload);
  if (!validated.ok) throw errors.badRequest('Location payload is not valid.', validated.errors);
  if (!['foreground', 'background', 'checkin'].includes(source)) {
    throw errors.badRequest('Unknown location source.');
  }

  return store.mutate((db) => {
    const member = Object.values(db.members).find(
      (m) => m.userId === userId && m.state === 'active' && (!memberId || m.id === memberId),
    );
    if (!member) throw errors.forbidden('You are not an active member of that group.');

    if (source === 'checkin') {
      if (!member.consent.foreground) throw errors.conflict('Turn on sharing consent first.', 'consent_required');
    } else {
      if (!member.consent.foreground) {
        throw errors.conflict('You have not agreed to share your location.', 'consent_required');
      }
      if (member.sharingState !== 'on') {
        throw errors.conflict('Location sharing is not on.', 'sharing_off');
      }
      if (source === 'background' && !member.consent.background) {
        throw errors.conflict('Background sharing has not been agreed.', 'background_consent_required');
      }
    }

    db.locations[member.id] = {
      memberId: member.id,
      familyId: member.familyId,
      userId,
      lat: validated.value.lat,
      lng: validated.value.lng,
      accuracyM: validated.value.accuracyM,
      capturedAt: validated.value.capturedAt,
      receivedAt: now(),
      source,
      // One snapshot per member. There is no history table to write to.
    };
    return { ok: true, state: deriveState(db.locations[member.id], now()).state };
  });
}

/* ------------------------------------------------------------------ */
/* Read model                                                          */
/* ------------------------------------------------------------------ */

export function familyView(db, { familyId, viewerUserId }) {
  const viewer = activeMembership(db, viewerUserId, familyId);
  if (!viewer) throw errors.notFound('Family not found.');

  const family = db.families[familyId];
  if (!family) throw errors.notFound('Family not found.');

  const members = Object.values(db.members)
    .filter((m) => m.familyId === familyId && m.state === 'active')
    .sort((a, b) => {
      if (a.role === 'owner' && b.role !== 'owner') return -1;
      if (b.role === 'owner' && a.role !== 'owner') return 1;
      return a.joinedAt - b.joinedAt;
    })
    .map((m) => {
      const user = db.users[m.userId] || { displayName: 'Former member', email: null };
      const isSelf = m.userId === viewerUserId;
      const loc = db.locations[m.id] || null;
      const derived = deriveState(loc, now());

      // A member only sees another member's position if that member is sharing.
      // Check-ins are visible because the sharer deliberately sent them.
      const visible = Boolean(loc) && (m.sharingState === 'on' || loc.source === 'checkin');
      const canSee = isSelf ? Boolean(loc) : visible;

      let shareMode = 'none';
      if (loc && m.sharingState === 'on') shareMode = 'live';
      else if (loc && loc.source === 'checkin') shareMode = 'checkin';

      return {
        memberId: m.id,
        userId: m.userId,
        displayName: isSelf ? user.displayName : user.displayName,
        role: m.role,
        isSelf,
        joinedAt: m.joinedAt,
        sharing: {
          state: m.sharingState,
          updatedAt: m.sharingUpdatedAt,
          mode: shareMode,
        },
        consent: {
          foreground: Boolean(m.consent.foreground),
          background: Boolean(m.consent.background),
          version: m.consent.foreground ? m.consent.foreground.version : null,
        },
        location: canSee ? {
          lat: loc.lat,
          lng: loc.lng,
          accuracyM: loc.accuracyM,
          accuracyBand: accuracyBand(loc.accuracyM),
          capturedAt: loc.capturedAt,
          receivedAt: loc.receivedAt,
          source: loc.source,
          state: derived.state,
          reason: derived.reason,
          ageMs: derived.ageMs,
        } : null,
        unavailableReason: canSee ? null : (
          m.sharingState === 'paused' ? 'paused'
            : m.sharingState === 'off' ? 'not_sharing'
              : 'no_fix'
        ),
      };
    });

  // Distance is measured from the viewer's own last known position, which is
  // the only distance a family member actually cares about. When the viewer
  // has no position, no distance is offered rather than an invented one.
  const viewerLocation = (db.locations[viewer.id] && deriveState(db.locations[viewer.id], now()).state !== 'unavailable')
    ? db.locations[viewer.id]
    : null;

  const withDistance = members.map((m) => ({
    ...m,
    distanceFromViewerM: (!m.isSelf && m.location && viewerLocation)
      ? distanceM(viewerLocation, m.location)
      : null,
  }));

  return {
    family: {
      id: family.id,
      name: family.name,
      ownerId: family.ownerId,
      createdAt: family.createdAt,
      memberCount: members.length,
      maxMembers: config.maxMembersPerFamily,
    },
    viewer: {
      memberId: viewer.id,
      role: viewer.role,
      sharingState: viewer.sharingState,
      consent: {
        foreground: Boolean(viewer.consent.foreground),
        background: Boolean(viewer.consent.background),
        version: viewer.consent.foreground ? viewer.consent.foreground.version : null,
        currentVersion: CONSENT_VERSION,
      },
    },
    members: withDistance,
    policy: {
      currentMaxMs: config.currentMaxMs,
      staleMaxMs: config.staleMaxMs,
      retentionMs: config.locationRetentionMs,
      serverTime: now(),
    },
  };
}

/* ------------------------------------------------------------------ */
/* Membership exit and deletion                                        */
/* ------------------------------------------------------------------ */

export async function leaveFamily(store, { userId, familyId }) {
  return store.mutate((db) => {
    const member = activeMembership(db, userId, familyId);
    if (!member) throw errors.notFound('Family not found.');
    purgeLocation(db, member.id);
    member.state = 'left';
    member.leftAt = now();
    member.sharingState = 'off';
    member.consent = { foreground: null, background: null };

    if (member.role === 'owner') {
      const others = Object.values(db.members)
        .filter((m) => m.familyId === familyId && m.state === 'active')
        .sort((a, b) => a.joinedAt - b.joinedAt);
      if (others.length) {
        others[0].role = 'owner';
        db.families[familyId].ownerId = others[0].userId;
      } else {
        delete db.families[familyId];
        for (const m of Object.values(db.members)) if (m.familyId === familyId) delete db.members[m.id];
        for (const i of Object.values(db.invites)) if (i.familyId === familyId) delete db.invites[i.id];
      }
    }
    return { ok: true };
  });
}

export async function removeMember(store, { userId, familyId, memberId }) {
  return store.mutate((db) => {
    const actor = activeMembership(db, userId, familyId);
    if (!actor) throw errors.notFound('Family not found.');
    if (actor.role !== 'owner') throw errors.forbidden('Only the group owner can remove someone.');
    const target = db.members[memberId];
    if (!target || target.familyId !== familyId || target.state !== 'active') {
      throw errors.notFound('That person is not in this group.');
    }
    if (target.userId === userId) throw errors.conflict('Use "Leave group" to remove yourself.', 'cannot_remove_self');

    purgeLocation(db, target.id);
    target.state = 'removed';
    target.removedAt = now();
    target.sharingState = 'off';
    target.consent = { foreground: null, background: null };
    return { ok: true, removedMemberId: memberId };
  });
}

export async function deleteFamily(store, { userId, familyId }) {
  return store.mutate((db) => {
    const actor = activeMembership(db, userId, familyId);
    if (!actor) throw errors.notFound('Family not found.');
    if (actor.role !== 'owner') throw errors.forbidden('Only the group owner can delete a group.');
    for (const m of Object.values(db.members)) {
      if (m.familyId === familyId) {
        purgeLocation(db, m.id);
        m.state = 'removed';
        m.sharingState = 'off';
        m.consent = { foreground: null, background: null };
        delete db.members[m.id];
      }
    }
    for (const i of Object.values(db.invites)) if (i.familyId === familyId) delete db.invites[i.id];
    delete db.families[familyId];
    return { ok: true };
  });
}

/**
 * Account deletion. Everything that identifies the person is removed: user
 * record, memberships, stored positions, sessions, consent records, pending
 * sign-in codes, and invitations they created. The append-only audit trail
 * keeps opaque identifiers that can no longer be resolved to a person; that
 * limitation is stated in docs/PRIVACY-RISK-ASSESSMENT.md.
 */
export async function deleteAccount(store, { userId }) {
  const purged = await store.mutate((db) => {
    const counts = { familiesLeft: 0, invitesRevoked: 0, locationsPurged: 0, sessions: 0 };

    for (const m of Object.values(db.members)) {
      if (m.userId !== userId) continue;
      if (purgeLocation(db, m.id)) counts.locationsPurged += 1;
      if (m.state === 'active') counts.familiesLeft += 1;
      m.state = 'left';
      m.sharingState = 'off';
      m.consent = { foreground: null, background: null };
      m.anonymised = true;

      // Owner leaving: hand the group to the longest-standing remaining adult
      // or delete it if nobody else is there.
      const family = db.families[m.familyId];
      if (family && family.ownerId === userId) {
        const others = Object.values(db.members)
          .filter((x) => x.familyId === m.familyId && x.state === 'active' && x.userId !== userId)
          .sort((a, b) => a.joinedAt - b.joinedAt);
        if (others.length) {
          others[0].role = 'owner';
          family.ownerId = others[0].userId;
        } else {
          delete db.families[m.familyId];
          for (const x of Object.values(db.members)) if (x.familyId === m.familyId) delete db.members[x.id];
          for (const i of Object.values(db.invites)) if (i.familyId === m.familyId) delete db.invites[i.id];
        }
      }
    }

    for (const i of Object.values(db.invites)) {
      if (i.createdByUserId === userId && !i.usedAt && !i.revokedAt) {
        i.revokedAt = now();
        counts.invitesRevoked += 1;
      }
    }
    for (const [sid, s] of Object.entries(db.sessions)) {
      if (s.userId === userId) { delete db.sessions[sid]; counts.sessions += 1; }
    }
    for (const m of Object.values(db.members)) {
      if (m.userId === userId) delete db.members[m.id];
    }
    if (db.codes) {
      const email = db.users[userId] ? db.users[userId].email : null;
      if (email && db.codes[email]) delete db.codes[email];
    }
    delete db.users[userId];
    return counts;
  });

  await store.audit({ event: 'account.deleted', userId, ...purged });
  return purged;
}

/**
 * Nudge, not surveillance: asking someone to check in notifies them and can be
 * ignored. It cannot start collection, reveal a position, or change any state.
 */
export async function requestCheckIn(store, { userId, familyId, targetMemberId }) {
  return store.mutate((db) => {
    const actor = activeMembership(db, userId, familyId);
    if (!actor) throw errors.notFound('Family not found.');
    const target = db.members[targetMemberId];
    if (!target || target.familyId !== familyId || target.state !== 'active') {
      throw errors.notFound('That person is not in this group.');
    }
    target.checkInRequests = (target.checkInRequests || 0) + 1;
    target.lastCheckInRequestAt = now();
    target.lastCheckInRequestFrom = actor.id;
    return { ok: true };
  });
}

export { deriveState };

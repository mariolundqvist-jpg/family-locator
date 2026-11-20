import { config } from './config.js';
import { Router, assertFields, errors, readJsonBody, sendJson } from './http.js';
import {
  acceptInvite, createFamily, createInvite, deleteAccount, deleteFamily, familyView,
  leaveFamily, membershipsForUser, peekInvite, recordLocation, removeMember,
  requestCheckIn, requestSignInCode, resolveSession, revokeInvite, setConsent, setSharing,
  touchSession, verifySignInCode, sanitiseName,
} from './service.js';
import {
  clearSessionCookie, hashToken, isSecureRequest, readSessionToken, sessionCookie,
} from './security.js';

function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return fwd || req.socket.remoteAddress || 'unknown';
}

function enforceLimit(ctx, req, bucket) {
  const rule = config.rateLimit[bucket];
  if (!rule) return;
  const key = `${bucket}:${clientIp(req)}`;
  const result = ctx.limiter.hit(key, rule);
  if (!result.allowed) {
    const err = errors.tooMany(result.retryAfterSec);
    err.headers = { 'retry-after': String(result.retryAfterSec) };
    throw err;
  }
}

export function buildRouter(ctx) {
  const router = new Router();
  const { store } = ctx;

  /* ---------------- health ---------------- */
  router.get('/api/health', async (req, res) => {
    sendJson(res, 200, {
      ok: true,
      service: 'safepath',
      version: '0.1.0-prototype',
      time: Date.now(),
      policy: {
        currentMaxMs: config.currentMaxMs,
        staleMaxMs: config.staleMaxMs,
        retentionMs: config.locationRetentionMs,
        inviteTtlMs: config.inviteTtlMs,
        consentVersion: undefined,
      },
    });
  }, { auth: false });

  /* ---------------- auth ---------------- */
  router.post('/api/auth/request-code', async (req, res) => {
    enforceLimit(ctx, req, 'requestCode');
    const body = await readJsonBody(req);
    const result = await requestSignInCode(store, {
      email: body.email, ip: clientIp(req), mailer: ctx.mailer,
    });
    sendJson(res, 200, result);
  }, { auth: false });

  router.post('/api/auth/verify', async (req, res) => {
    enforceLimit(ctx, req, 'verifyCode');
    const body = await readJsonBody(req);
    const { user, sessionToken } = await verifySignInCode(store, {
      email: body.email,
      code: body.code,
      displayName: body.displayName,
      ip: clientIp(req),
      userAgent: req.headers['user-agent'],
    });
    const secure = isSecureRequest(req);
    const wantsToken = String(req.headers['x-safepath-client'] || '') === 'mobile';
    sendJson(res, 200, {
      ok: true,
      user: { id: user.id, email: user.email, displayName: user.displayName },
      // Native clients cannot rely on a cookie jar surviving app restarts, so
      // they receive the session token explicitly and store it in the OS
      // keychain. Browsers never see it — it stays in the HttpOnly cookie.
      ...(wantsToken ? { sessionToken, expiresInSec: Math.floor(config.sessionTtlMs / 1000) } : {}),
    }, { 'set-cookie': sessionCookie(sessionToken, { secure, maxAgeMs: config.sessionTtlMs }) });
  }, { auth: false });

  router.post('/api/auth/logout', async (req, res) => {
    const token = ctx.sessionToken(req);
    if (token) {
      await store.mutate((db) => {
        const sid = ctx.hashSession(token);
        if (sid && db.sessions[sid]) delete db.sessions[sid];
      });
    }
    sendJson(res, 200, { ok: true }, {
      'set-cookie': clearSessionCookie({ secure: isSecureRequest(req) }),
    });
  }, { auth: false });

  router.get('/api/me', async (req, res) => {
    const { user } = await ctx.requireAuth(req);
    const db = await store.snapshot();
    sendJson(res, 200, {
      user: { id: user.id, email: user.email, displayName: user.displayName, createdAt: user.createdAt },
      families: membershipsForUser(db, user.id),
      policy: {
        currentMaxMs: config.currentMaxMs,
        staleMaxMs: config.staleMaxMs,
        retentionMs: config.locationRetentionMs,
      },
    });
  });

  router.post('/api/me/display-name', async (req, res) => {
    const { user } = await ctx.requireAuth(req);
    const body = await readJsonBody(req);
    const name = sanitiseName(body.displayName);
    if (!name) throw errors.badRequest('Enter a name of 1–40 characters.');
    await store.mutate((db) => { db.users[user.id].displayName = name; });
    sendJson(res, 200, { ok: true, displayName: name });
  });

  /* ---------------- families ---------------- */
  router.post('/api/families', async (req, res) => {
    enforceLimit(ctx, req, 'write');
    const { user } = await ctx.requireAuth(req);
    const body = await readJsonBody(req);
    const { family, member } = await createFamily(store, { userId: user.id, name: body.name });
    await store.audit({ event: 'family.created', userId: user.id, familyId: family.id });
    sendJson(res, 201, {
      family: { id: family.id, name: family.name, ownerId: family.ownerId },
      memberId: member.id,
    });
  });

  router.get('/api/families/:familyId', async (req, res, params) => {
    enforceLimit(ctx, req, 'read');
    const { user } = await ctx.requireAuth(req);
    const db = await store.snapshot();
    sendJson(res, 200, familyView(db, { familyId: params.familyId, viewerUserId: user.id }));
  });

  router.del('/api/families/:familyId', async (req, res, params) => {
    const { user } = await ctx.requireAuth(req);
    await deleteFamily(store, { userId: user.id, familyId: params.familyId });
    await store.audit({ event: 'family.deleted', userId: user.id, familyId: params.familyId });
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/families/:familyId/leave', async (req, res, params) => {
    const { user } = await ctx.requireAuth(req);
    await leaveFamily(store, { userId: user.id, familyId: params.familyId });
    await store.audit({ event: 'family.left', userId: user.id, familyId: params.familyId });
    sendJson(res, 200, { ok: true });
  });

  router.del('/api/families/:familyId/members/:memberId', async (req, res, params) => {
    const { user } = await ctx.requireAuth(req);
    await removeMember(store, {
      userId: user.id, familyId: params.familyId, memberId: params.memberId,
    });
    await store.audit({
      event: 'member.removed', userId: user.id, familyId: params.familyId, targetMemberId: params.memberId,
    });
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/families/:familyId/checkin-request', async (req, res, params) => {
    enforceLimit(ctx, req, 'write');
    const { user } = await ctx.requireAuth(req);
    const body = await readJsonBody(req);
    await requestCheckIn(store, {
      userId: user.id, familyId: params.familyId, targetMemberId: String(body.memberId || ''),
    });
    sendJson(res, 200, { ok: true, note: 'The request is a nudge. It cannot start location sharing.' });
  });

  /* ---------------- invitations ---------------- */
  router.post('/api/families/:familyId/invites', async (req, res, params) => {
    enforceLimit(ctx, req, 'write');
    const { user } = await ctx.requireAuth(req);
    const origin = ctx.origin(req);
    const { invite, token, link } = await createInvite(store, {
      userId: user.id, familyId: params.familyId, origin,
    });
    await store.audit({ event: 'invite.created', userId: user.id, familyId: params.familyId, inviteId: invite.id });
    sendJson(res, 201, { invite: { ...invite, link, token } });
  });

  router.get('/api/families/:familyId/invites', async (req, res, params) => {
    const { user } = await ctx.requireAuth(req);
    const db = await store.snapshot();
    const member = Object.values(db.members)
      .find((m) => m.userId === user.id && m.familyId === params.familyId && m.state === 'active');
    if (!member) throw errors.notFound('Family not found.');
    if (member.role !== 'owner') throw errors.forbidden('Only the group owner can see invitations.');
    const invites = Object.values(db.invites)
      .filter((i) => i.familyId === params.familyId)
      .map((i) => ({
        id: i.id,
        createdAt: i.createdAt,
        expiresAt: i.expiresAt,
        status: i.revokedAt ? 'revoked' : i.usedAt ? 'used' : Date.now() > i.expiresAt ? 'expired' : 'active',
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
    sendJson(res, 200, { invites });
  });

  router.del('/api/invites/:inviteId', async (req, res, params) => {
    const { user } = await ctx.requireAuth(req);
    await revokeInvite(store, { userId: user.id, inviteId: params.inviteId });
    await store.audit({ event: 'invite.revoked', userId: user.id, inviteId: params.inviteId });
    sendJson(res, 200, { ok: true });
  });

  router.post('/api/invites/peek', async (req, res) => {
    enforceLimit(ctx, req, 'invitePeek');
    const body = await readJsonBody(req);
    const result = await peekInvite(store, { token: String(body.token || '') });
    sendJson(res, 200, result);
  }, { auth: false });

  router.post('/api/invites/accept', async (req, res) => {
    enforceLimit(ctx, req, 'inviteAccept');
    const { user } = await ctx.requireAuth(req);
    const body = await readJsonBody(req);
    const { family, member, alreadyMember } = await acceptInvite(store, {
      userId: user.id, token: String(body.token || ''),
    });
    await store.audit({
      event: 'invite.accepted', userId: user.id, familyId: family.id, memberId: member.id, alreadyMember,
    });
    sendJson(res, 200, {
      ok: true,
      alreadyMember,
      family: { id: family.id, name: family.name },
      memberId: member.id,
      // Stated explicitly in the API response so the client cannot imply it.
      locationAuthorisedByInvite: false,
      sharingState: member.sharingState,
      nextStep: 'Choose whether to share your location. Joining does not share it.',
    });
  });

  /* ---------------- own data ---------------- */
  router.post('/api/me/consent', async (req, res) => {
    const { user } = await ctx.requireAuth(req);
    const body = assertFields(await readJsonBody(req), ['scope', 'accepted', 'version']);
    const result = await setConsent(store, {
      userId: user.id,
      scope: body.scope,
      accepted: body.accepted,
      version: body.version,
    });
    await store.audit({
      event: body.accepted ? 'consent.granted' : 'consent.withdrawn',
      userId: user.id, scope: body.scope, version: body.version || null,
    });
    sendJson(res, 200, result);
  });

  router.post('/api/me/sharing', async (req, res) => {
    const { user } = await ctx.requireAuth(req);
    const body = assertFields(await readJsonBody(req), ['state']);
    const result = await setSharing(store, { userId: user.id, state: body.state });
    await store.audit({ event: 'sharing.changed', userId: user.id, state: body.state });
    sendJson(res, 200, result);
  });

  router.post('/api/me/location', async (req, res) => {
    enforceLimit(ctx, req, 'locationPost');
    const { user } = await ctx.requireAuth(req);
    const body = assertFields(await readJsonBody(req),
      ['memberId', 'lat', 'lng', 'accuracyM', 'capturedAt', 'source']);
    const result = await recordLocation(store, {
      userId: user.id,
      memberId: body.memberId ? String(body.memberId) : null,
      payload: body,
      source: body.source || 'foreground',
      ip: clientIp(req),
    });
    sendJson(res, 202, result);
  });

  router.post('/api/me/checkin', async (req, res) => {
    enforceLimit(ctx, req, 'write');
    const { user } = await ctx.requireAuth(req);
    const body = assertFields(await readJsonBody(req),
      ['memberId', 'lat', 'lng', 'accuracyM', 'capturedAt', 'source']);
    const result = await recordLocation(store, {
      userId: user.id,
      memberId: body.memberId ? String(body.memberId) : null,
      payload: body,
      source: 'checkin',
      ip: clientIp(req),
    });
    await store.audit({ event: 'location.checkin', userId: user.id });
    sendJson(res, 202, { ...result, note: 'Shared once with your group. Sharing settings were not changed.' });
  });

  router.get('/api/me/activity', async (req, res) => {
    const { user } = await ctx.requireAuth(req);
    const entries = await store.readAudit(400);
    const mine = entries.filter((e) => e.userId === user.id).slice(0, 60);
    sendJson(res, 200, { entries: mine });
  });

  router.del('/api/me/data', async (req, res) => {
    const { user } = await ctx.requireAuth(req);
    const counts = await deleteAccount(store, { userId: user.id });
    sendJson(res, 200, {
      ok: true,
      deleted: counts,
      message: 'Your account, memberships, saved positions and sessions have been deleted.',
    }, { 'set-cookie': clearSessionCookie({ secure: isSecureRequest(req) }) });
  });

  return router;
}

export function makeContext(store, limiter, mailer) {
  return {
    store,
    limiter,
    mailer,
    async requireAuth(req) {
      const db = await store.snapshot();
      const resolved = resolveSession(db, readSessionToken(req));
      if (!resolved) throw errors.unauthorized();
      // Fire-and-forget: correctness never depends on the touch succeeding.
      touchSession(store, resolved.sessionId).catch(() => {});
      return resolved;
    },
    sessionToken(req) {
      return readSessionToken(req);
    },
    hashSession(token) {
      return token ? hashToken(token, 'session') : null;
    },
    origin(req) {
      const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim()
        || (req.socket.encrypted ? 'https' : 'http');
      const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${config.port}`;
      return `${proto}://${host}`;
    },
  };
}

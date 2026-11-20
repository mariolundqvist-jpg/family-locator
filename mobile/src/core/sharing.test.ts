import {
  couldOfferBackground,
  gateDetail,
  mayCollect,
  needsConsent,
  queueDisposition,
  transmissionGate,
} from './sharing';
import type { TransmissionContext } from './types';

const base: TransmissionContext = {
  signedIn: true,
  memberId: 'm1',
  sharingState: 'on',
  memberRemoved: false,
  foregroundConsent: true,
  backgroundConsent: false,
  serverRevoked: false,
};

describe('transmissionGate', () => {
  it('allows a foreground fix when signed in, consented and sharing', () => {
    const gate = transmissionGate(base, 'foreground');
    expect(gate.allowed).toBe(true);
    expect(gate.reason).toBe('ok');
  });

  it('refuses everything when signed out', () => {
    const gate = transmissionGate({ ...base, signedIn: false }, 'foreground');
    expect(gate).toMatchObject({ allowed: false, reason: 'signed_out' });
  });

  it('refuses when the member was removed from the group', () => {
    const gate = transmissionGate({ ...base, memberRemoved: true }, 'foreground');
    expect(gate).toMatchObject({ allowed: false, reason: 'removed' });
  });

  it('refuses once the server has revoked the membership', () => {
    const gate = transmissionGate({ ...base, serverRevoked: true }, 'foreground');
    expect(gate).toMatchObject({ allowed: false, reason: 'server_revoked' });
  });

  it('refuses while paused', () => {
    const gate = transmissionGate({ ...base, sharingState: 'paused' }, 'foreground');
    expect(gate).toMatchObject({ allowed: false, reason: 'paused' });
  });

  it('refuses when sharing is off', () => {
    const gate = transmissionGate({ ...base, sharingState: 'off' }, 'foreground');
    expect(gate).toMatchObject({ allowed: false, reason: 'not_sharing' });
  });

  it('refuses without foreground consent even if sharing says on', () => {
    const gate = transmissionGate({ ...base, foregroundConsent: false }, 'foreground');
    expect(gate).toMatchObject({ allowed: false, reason: 'consent_withdrawn' });
  });

  it('refuses a background fix when background was never consented', () => {
    const gate = transmissionGate(base, 'background');
    expect(gate).toMatchObject({ allowed: false, reason: 'background_not_consented' });
  });

  it('allows a background fix once background consent exists', () => {
    expect(transmissionGate({ ...base, backgroundConsent: true }, 'background').allowed).toBe(true);
  });

  it('allows a one-off check-in while routine sharing is off', () => {
    const gate = transmissionGate({ ...base, sharingState: 'off' }, 'checkin');
    expect(gate.allowed).toBe(true);
  });

  it('refuses a check-in while paused only if consent is missing', () => {
    expect(transmissionGate({ ...base, sharingState: 'paused' }, 'checkin').allowed).toBe(true);
    expect(
      transmissionGate({ ...base, sharingState: 'paused', foregroundConsent: false }, 'checkin'),
    ).toMatchObject({ allowed: false, reason: 'consent_withdrawn' });
  });

  it('refuses a check-in from a removed member', () => {
    expect(transmissionGate({ ...base, memberRemoved: true }, 'checkin').allowed).toBe(false);
  });

  it('never leaks coordinates into the human-readable detail', () => {
    for (const ctx of [
      { ...base, signedIn: false },
      { ...base, sharingState: 'paused' as const },
      { ...base, foregroundConsent: false },
      { ...base, memberRemoved: true },
    ]) {
      const detail = gateDetail(transmissionGate(ctx, 'foreground').reason);
      expect(detail).not.toMatch(/\d{2,3}\.\d{3,}/);
    }
  });
});

describe('mayCollect', () => {
  it('stops collection at the same moment transmission stops', () => {
    expect(mayCollect(base, 'foreground')).toBe(true);
    expect(mayCollect({ ...base, sharingState: 'paused' }, 'foreground')).toBe(false);
    expect(mayCollect({ ...base, foregroundConsent: false }, 'foreground')).toBe(false);
    expect(mayCollect({ ...base, signedIn: false }, 'foreground')).toBe(false);
  });

  it('does not collect in the background without background consent', () => {
    expect(mayCollect(base, 'background')).toBe(false);
    expect(mayCollect({ ...base, backgroundConsent: true }, 'background')).toBe(true);
  });
});

describe('queueDisposition', () => {
  it('discards queued positions whenever the gate is closed', () => {
    expect(queueDisposition(transmissionGate(base, 'foreground'))).toBe('keep');
    expect(queueDisposition(transmissionGate({ ...base, sharingState: 'paused' }, 'foreground'))).toBe(
      'discard',
    );
    expect(queueDisposition(transmissionGate({ ...base, signedIn: false }, 'foreground'))).toBe('discard');
  });
});

describe('UI hints', () => {
  it('offers the background explanation only when it is genuinely possible', () => {
    expect(couldOfferBackground(base)).toBe(true);
    expect(couldOfferBackground({ ...base, sharingState: 'paused' })).toBe(false);
    expect(couldOfferBackground({ ...base, backgroundConsent: true })).toBe(false);
  });

  it('reports when consent is the only blocker', () => {
    expect(needsConsent({ ...base, foregroundConsent: false })).toBe(true);
    expect(needsConsent(base)).toBe(false);
    expect(needsConsent({ ...base, foregroundConsent: false, signedIn: false })).toBe(false);
  });
});

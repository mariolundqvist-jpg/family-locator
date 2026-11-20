import {
  containsSecret,
  createLogger,
  installConsoleRedaction,
  isSensitiveKey,
  looksLikeCoordinate,
  redact,
  safeStringify,
  splitKeyWords,
} from './redact';

describe('key matching', () => {
  it('splits camelCase and separators', () => {
    expect(splitKeyWords('accuracyM')).toEqual(['accuracy', 'm']);
    expect(splitKeyWords('user-token')).toEqual(['user', 'token']);
  });

  it('flags the keys that could carry a position or a credential', () => {
    for (const key of ['lat', 'lng', 'latitude', 'longitude', 'accuracyM', 'sessionToken', 'dev_code', 'authorization']) {
      expect(isSensitiveKey(key)).toBe(true);
    }
    for (const key of ['displayName', 'familyId', 'createdAt', 'sharingState']) {
      expect(isSensitiveKey(key)).toBe(false);
    }
  });
});

describe('redact', () => {
  it('removes coordinates held under a known key', () => {
    const out = redact({ lat: 47.4979, lng: 19.0402 }) as Record<string, unknown>;
    expect(out.lat).toBe('[redacted]');
    expect(out.lng).toBe('[redacted]');
  });

  it('removes coordinates hidden in a plain string', () => {
    expect(redact('user moved to 47.497912, 19.040235 today')).toBe('user moved to [coordinate] today');
  });

  it('removes a bare high-precision coordinate', () => {
    expect(looksLikeCoordinate('47.497912')).toBe(true);
    expect(redact('pos=47.497912')).toBe('pos=[coordinate]');
  });

  it('keeps harmless telemetry', () => {
    const out = redact({ familyId: 'f1', memberCount: 3, state: 'current' });
    expect(out).toEqual({ familyId: 'f1', memberCount: 3, state: 'current' });
  });

  it('strips query strings that could carry a code', () => {
    expect(redact('GET /api/auth/verify?code=123456')).toBe('GET /api/auth/verify?[query-removed]');
  });

  it('redacts nested token fields and long opaque strings', () => {
    const out = redact({ auth: { sessionToken: 'abc' }, note: 'a'.repeat(40) }) as any;
    expect(out.auth.sessionToken).toBe('[redacted]');
    expect(out.note).toBe('[secret]');
    expect(containsSecret('a'.repeat(40))).toBe(true);
  });

  it('survives circular-free deep objects and errors', () => {
    const out = redact(new Error('failed at 47.497912,19.040235')) as any;
    expect(out.message).toContain('[coordinate]');
  });

  it('never throws on odd input', () => {
    expect(() => safeStringify({ big: 10n, fn: () => 1 })).not.toThrow();
  });
});

describe('console redaction', () => {
  it('scrubs what the app logs', () => {
    const lines: unknown[][] = [];
    const fakeConsole = {
      log: (...args: unknown[]) => lines.push(args),
      warn: (...args: unknown[]) => lines.push(args),
      error: (...args: unknown[]) => lines.push(args),
    };
    const restore = installConsoleRedaction(fakeConsole);
    console.info = () => {}; // no-op, keeps lint quiet about global console

    createLogger('test', fakeConsole).info('sample', { lat: 47.4979, accuracyM: 12 });
    restore();

    const rendered = JSON.stringify(lines);
    expect(rendered).not.toContain('47.4979');
    expect(rendered).toContain('[redacted]');
  });
});

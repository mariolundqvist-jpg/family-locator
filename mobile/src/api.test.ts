/**
 * API client tests.
 *
 * The network and the keychain are both faked, so these run on plain Node with
 * no native module and no emulator.
 */
const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: async (k: string) => mockStore.get(k) ?? null,
  setItemAsync: async (k: string, v: string) => {
    mockStore.set(k, v);
  },
  deleteItemAsync: async (k: string) => {
    mockStore.delete(k);
  },
}));

type Call = { url: string; init: RequestInit };

const calls: Call[] = [];
let nextResponse: { status: number; body: unknown } = { status: 200, body: {} };

function fakeFetch(url: string, init: RequestInit = {}) {
  calls.push({ url, init });
  return Promise.resolve({
    ok: nextResponse.status >= 200 && nextResponse.status < 300,
    status: nextResponse.status,
    text: async () => (nextResponse.body === null ? '' : JSON.stringify(nextResponse.body)),
  } as Response);
}

const originalFetch = global.fetch;

beforeEach(() => {
  calls.length = 0;
  mockStore.clear();
  nextResponse = { status: 200, body: {} };
  global.fetch = fakeFetch as unknown as typeof fetch;
  jest.resetModules();
});

afterAll(() => {
  global.fetch = originalFetch;
});

async function loadApi() {
  // resetModules makes the module-level token cache testable.
  return import('./api');
}

describe('sign-in', () => {
  it('asks for a bearer token by identifying itself as a mobile client', async () => {
    const api = await loadApi();
    nextResponse = { status: 200, body: { ok: true, user: { id: 'u1', email: 'a@b.c', displayName: 'A' }, sessionToken: 'tok_1' } };

    await api.verifyCode('e2e-user-a-x@example.test', '123456');

    expect(calls[0].url).toContain('/api/auth/verify');
    expect((calls[0].init.headers as Record<string, string>)['x-safepath-client']).toBe('mobile');
    expect(mockStore.get('safepath.session')).toBe('tok_1');
  });

  it('refuses a response with no token rather than pretending to be signed in', async () => {
    const api = await loadApi();
    nextResponse = { status: 200, body: { ok: true, user: { id: 'u1', email: 'a@b.c', displayName: 'A' } } };
    await expect(api.verifyCode('a@b.c', '123456')).rejects.toMatchObject({ code: 'no_token' });
    expect(mockStore.has('safepath.session')).toBe(false);
  });

  it('sends the stored token on later requests', async () => {
    const api = await loadApi();
    nextResponse = { status: 200, body: { ok: true, user: { id: 'u1', email: 'a@b.c', displayName: 'A' }, sessionToken: 'tok_2' } };
    await api.verifyCode('a@b.c', '123456');

    nextResponse = { status: 200, body: { user: {}, families: [] } };
    await api.me();
    expect((calls[1].init.headers as Record<string, string>).authorization).toBe('Bearer tok_2');
  });

  it('clears the token even when the logout request fails', async () => {
    const api = await loadApi();
    nextResponse = { status: 200, body: { ok: true, user: { id: 'u1', email: 'a@b.c', displayName: 'A' }, sessionToken: 'tok_3' } };
    await api.verifyCode('a@b.c', '123456');

    nextResponse = { status: 500, body: { error: { message: 'boom' } } };
    await expect(api.logout()).rejects.toBeTruthy();
    expect(mockStore.has('safepath.session')).toBe(false);
  });
});

describe('errors', () => {
  it('maps an HTTP failure to a typed error carrying the status', async () => {
    const api = await loadApi();
    nextResponse = { status: 403, body: { error: { message: 'Not a member.', code: 'forbidden' } } };
    await expect(api.familyView('f1')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'forbidden',
      message: 'Not a member.',
    });
  });

  it('knows which failures are worth retrying', async () => {
    const api = await loadApi();
    nextResponse = { status: 429, body: { error: { message: 'slow down' } } };
    const rateLimited = await api.me().catch((e) => e);
    expect(rateLimited.retryable).toBe(true);

    nextResponse = { status: 404, body: { error: { message: 'gone' } } };
    const notFound = await api.me().catch((e) => e);
    expect(notFound.retryable).toBe(false);
  });

  it('treats a dropped connection as retryable and never leaks a fix into the message', async () => {
    const api = await loadApi();
    global.fetch = (() => Promise.reject(new Error('network down'))) as unknown as typeof fetch;

    const err = await api
      .postFix({ memberId: 'm1', lat: 47.4979, lng: 19.0402, accuracyM: 12, capturedAt: 1, source: 'foreground' })
      .catch((e) => e);

    expect(err).toMatchObject({ status: 0, code: 'network', retryable: true });
    expect(err.message).not.toContain('47.4979');
  });
});

describe('positions', () => {
  it('posts a check-in to the check-in endpoint, not the routine one', async () => {
    const api = await loadApi();
    nextResponse = { status: 202, body: { ok: true, state: 'current' } };
    await api.postFix({ memberId: 'm1', lat: 1.5, lng: 2.5, accuracyM: 9, capturedAt: 42, source: 'checkin' });
    expect(calls[0].url).toContain('/api/me/checkin');
    expect(JSON.parse(calls[0].init.body as string)).toMatchObject({ source: 'checkin', memberId: 'm1' });
  });

  it('posts routine fixes to the location endpoint', async () => {
    const api = await loadApi();
    nextResponse = { status: 202, body: { ok: true, state: 'current' } };
    await api.postFix({ memberId: 'm1', lat: 1.5, lng: 2.5, accuracyM: 9, capturedAt: 42, source: 'background' });
    expect(calls[0].url).toContain('/api/me/location');
  });

  it('has no endpoint that changes another member\'s sharing', async () => {
    const api = await loadApi() as unknown as Record<string, unknown>;
    const suspicious = Object.keys(api).filter(
      (k) => /sharing/i.test(k) && /member|other|user/i.test(k),
    );
    expect(suspicious).toEqual([]);
  });
});

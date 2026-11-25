describe('optional Superwall module', () => {
  const originalKey = process.env.EXPO_PUBLIC_SUPERWALL_API_KEY;
  afterEach(() => {
    process.env.EXPO_PUBLIC_SUPERWALL_API_KEY = originalKey;
    jest.resetModules();
  });

  it('does not load the native module when no API key is configured', async () => {
    process.env.EXPO_PUBLIC_SUPERWALL_API_KEY = '';
    jest.doMock('expo-superwall', () => { throw new Error('native module is missing'); }, { virtual: true });
    const service = await import('./superwall');
    await expect(service.initSuperwall()).resolves.toBe(false);
  });

  it('handles a missing native module even with a configured key', async () => {
    process.env.EXPO_PUBLIC_SUPERWALL_API_KEY = 'test-key';
    jest.doMock('expo-superwall', () => { throw new Error('native module is missing'); }, { virtual: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const service = await import('./superwall');
    await expect(service.initSuperwall()).resolves.toBe(false);
    warn.mockRestore();
  });
});

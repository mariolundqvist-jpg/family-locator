/**
 * Sign-in code delivery.
 *
 * Transports:
 *   console  — development only. Prints the code to the operator's terminal so a
 *              developer can sign in without an email account. REFUSED in
 *              production (see server/lib/config.js).
 *   resend   — https://api.resend.com (Bearer key)
 *   postmark — https://api.postmarkapp.com (X-Postmark-Server-Token)
 *
 * Rules enforced here rather than trusted to callers:
 *   · the code is never written to any log, in any transport;
 *   · provider failures are logged by status code, never by response body,
 *     because provider error bodies can echo the message payload;
 *   · delivery failures do not reveal to the caller whether an address exists.
 */

const TIMEOUT_MS = 10_000;

export function createMailer(config, { fetchImpl = fetch, logger = console } = {}) {
  const provider = config.email.provider;

  async function sendWithResend({ to, subject, text, html }) {
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${config.email.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, id: safeIdFrom(res) };
  }

  async function sendWithPostmark({ to, subject, text, html }) {
    const res = await fetchImpl('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'x-postmark-server-token': config.email.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        From: config.email.from, To: to, Subject: subject, TextBody: text, HtmlBody: html,
        MessageStream: 'outbound',
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return { status: res.status, id: safeIdFrom(res) };
  }

  async function safeIdFrom(res) {
    try {
      const body = await res.json();
      // Only a provider message id is ever read back out.
      return typeof body?.id === 'string' ? body.id : (typeof body?.MessageID === 'string' ? body.MessageID : null);
    } catch {
      return null;
    }
  }

  return {
    provider,

    /**
     * @returns {Promise<{delivered: boolean, transport: string, providerId: string|null}>}
     * Never throws for a delivery problem: sign-in must not become an oracle for
     * whether an address is registered.
     */
    async sendSignInCode({ to, code, ttlMinutes }) {
      const subject = 'Your SafePath sign-in code';
      const text = [
        `Your SafePath sign-in code is ${code}.`,
        '',
        `It expires in ${ttlMinutes} minutes and can be used once.`,
        'If you did not try to sign in, you can ignore this email.',
        '',
        'SafePath will never ask you for this code by phone or message.',
      ].join('\n');
      const html = `<p>Your SafePath sign-in code is <strong style="font-size:20px;letter-spacing:4px">${code}</strong></p>
<p>It expires in ${ttlMinutes} minutes and can be used once.</p>
<p>If you did not try to sign in, you can ignore this email.</p>`;

      if (provider === 'console') {
        // Development only: the operator's terminal is the "inbox".
        logger.log(`[dev-email] sign-in code for ${to}: ${code}`);
        return { delivered: true, transport: 'console', providerId: null };
      }

      const send = provider === 'postmark' ? sendWithPostmark : sendWithResend;
      try {
        const { status, id } = await send({ to, subject, text, html });
        if (status >= 200 && status < 300) {
          logger.log(`[email] delivered via ${provider} status=${status}`);
          return { delivered: true, transport: provider, providerId: id };
        }
        logger.warn(`[email] provider rejected the send status=${status}`);
        return { delivered: false, transport: provider, providerId: null };
      } catch (err) {
        // Deliberately no message body, no address, no payload.
        logger.error(`[email] transport error kind=${err?.name || 'unknown'}`);
        return { delivered: false, transport: provider, providerId: null };
      }
    },
  };
}

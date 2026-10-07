// Web Push with no dependencies: VAPID (RFC 8292) + aes128gcm payload encryption (RFC 8291).
// Node's built-in crypto does all the work, so this runs on Termux without compiling anything.
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const unb64u = (s) => Buffer.from(s, 'base64url');

/** Create (or load) the server's VAPID key pair. Stored in the meta table. */
export function loadVapid(db) {
  const row = db.get(`SELECT value FROM meta WHERE key = 'vapid'`);
  if (row) return JSON.parse(row.value);
  const ecdh = crypto.createECDH('prime256v1');
  ecdh.generateKeys();
  const keys = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
  db.run(`INSERT INTO meta (key, value) VALUES ('vapid', ?)`, JSON.stringify(keys));
  return keys;
}

function privateKeyObject(vapid) {
  const pub = unb64u(vapid.publicKey);
  return crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: vapid.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) },
    format: 'jwk'
  });
}

/** The signed JWT that proves to the push service that this server sent the message. */
export function vapidHeader(endpoint, vapid, subject) {
  const aud = new URL(endpoint).origin;
  const header = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign('sha256', Buffer.from(`${header}.${claims}`), { key: privateKeyObject(vapid), dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(sig)}, k=${vapid.publicKey}`;
}

const hmac = (key, data) => crypto.createHmac('sha256', key).update(data).digest();

/** Encrypt a payload for one browser subscription (RFC 8291, single record). */
export function encrypt(payload, p256dh, authSecret, { salt = crypto.randomBytes(16), ecdh } = {}) {
  const uaPublic = unb64u(p256dh);
  const auth = unb64u(authSecret);
  if (!ecdh) { ecdh = crypto.createECDH('prime256v1'); ecdh.generateKeys(); }
  const asPublic = ecdh.getPublicKey();
  const shared = ecdh.computeSecret(uaPublic);

  const prkKey = hmac(auth, shared);
  const keyInfo = Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]);
  const ikm = hmac(prkKey, keyInfo);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);

  const cipher = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]); // 0x02 = last record
  const body = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);

  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/**
 * Send one notification. Resolves to { ok, status, gone } — gone = the browser
 * unsubscribed, so the caller should delete that subscription.
 */
export async function sendPush(sub, data, vapid, { subject = 'mailto:hommate@example.com', ttl = 3600 * 12, urgency = 'normal' } = {}) {
  const body = encrypt(JSON.stringify(data), sub.p256dh, sub.auth);
  try {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        Authorization: vapidHeader(sub.endpoint, vapid, subject),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(ttl),
        Urgency: urgency
      },
      body,
      signal: AbortSignal.timeout(15000)
    });
    return { ok: res.ok, status: res.status, gone: res.status === 404 || res.status === 410 };
  } catch (e) {
    return { ok: false, status: 0, error: e.message };
  }
}

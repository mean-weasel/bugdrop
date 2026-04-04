/**
 * Generate a JWT for GitHub App authentication
 * Uses WebCrypto API (available in Cloudflare Workers)
 */

export async function generateGitHubAppJWT(appId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  // JWT Header
  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  // JWT Payload
  const payload = {
    iat: now - 60, // Issued 60 seconds ago (handles clock drift)
    exp: now + 600, // Expires in 10 minutes (GitHub maximum)
    iss: appId, // GitHub App ID
  };

  // Encode header and payload
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  // Sign with private key
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    new TextEncoder().encode(signingInput)
  );

  // Build JWT
  const encodedSignature = base64UrlEncode(signature);
  return `${signingInput}.${encodedSignature}`;
}

/**
 * Import private key for WebCrypto
 * Supports both PKCS#8 (BEGIN PRIVATE KEY) and PKCS#1 (BEGIN RSA PRIVATE KEY)
 */
async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const isPkcs1 = pem.includes('BEGIN RSA PRIVATE KEY');

  // Remove PEM headers and whitespace
  const pemContents = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  // Decode base64 to binary
  const binaryString = atob(pemContents);
  const keyBytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    keyBytes[i] = binaryString.charCodeAt(i);
  }

  let pkcs8Bytes: Uint8Array;

  if (isPkcs1) {
    // Convert PKCS#1 to PKCS#8 by adding algorithm identifier wrapper
    pkcs8Bytes = convertPkcs1ToPkcs8(keyBytes);
  } else {
    pkcs8Bytes = keyBytes;
  }

  // Import key
  return crypto.subtle.importKey(
    'pkcs8',
    pkcs8Bytes.buffer as ArrayBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/**
 * Convert PKCS#1 RSA private key to PKCS#8 format
 * Wraps the key with the RSA algorithm identifier
 */
function convertPkcs1ToPkcs8(pkcs1Bytes: Uint8Array): Uint8Array {
  // RSA algorithm identifier: OID 1.2.840.113549.1.1.1 + NULL
  const algorithmId = new Uint8Array([
    0x30,
    0x0d, // SEQUENCE, length 13
    0x06,
    0x09, // OID, length 9
    0x2a,
    0x86,
    0x48,
    0x86,
    0xf7,
    0x0d,
    0x01,
    0x01,
    0x01, // 1.2.840.113549.1.1.1 (rsaEncryption)
    0x05,
    0x00, // NULL
  ]);

  // Build PKCS#8 structure
  const version = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0

  // Wrap PKCS#1 key in OCTET STRING
  const octetString = wrapInAsn1(0x04, pkcs1Bytes);

  // Combine: version + algorithmId + octetString
  const inner = new Uint8Array(version.length + algorithmId.length + octetString.length);
  inner.set(version, 0);
  inner.set(algorithmId, version.length);
  inner.set(octetString, version.length + algorithmId.length);

  // Wrap in outer SEQUENCE
  return wrapInAsn1(0x30, inner);
}

/**
 * Wrap data in ASN.1 TLV (Tag-Length-Value) structure
 */
function wrapInAsn1(tag: number, data: Uint8Array): Uint8Array {
  const length = data.length;
  let header: Uint8Array;

  if (length < 128) {
    header = new Uint8Array([tag, length]);
  } else if (length < 256) {
    header = new Uint8Array([tag, 0x81, length]);
  } else if (length < 65536) {
    header = new Uint8Array([tag, 0x82, (length >> 8) & 0xff, length & 0xff]);
  } else {
    header = new Uint8Array([
      tag,
      0x83,
      (length >> 16) & 0xff,
      (length >> 8) & 0xff,
      length & 0xff,
    ]);
  }

  const result = new Uint8Array(header.length + data.length);
  result.set(header, 0);
  result.set(data, header.length);
  return result;
}

/**
 * Base64 URL encode (JWT-safe)
 */
function base64UrlEncode(data: string | ArrayBuffer): string {
  let base64: string;

  if (typeof data === 'string') {
    base64 = btoa(data);
  } else {
    const bytes = new Uint8Array(data);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    base64 = btoa(binary);
  }

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

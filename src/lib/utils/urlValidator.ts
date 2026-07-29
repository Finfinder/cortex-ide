// ─── SSRF URL Validator ────────────────────────────────────────────────────────
// Validates URLs before HTTP fetch operations to prevent SSRF vulnerabilities.
// Hardened against Cloud Metadata (169.254.x.x), DNS Rebinding, and IP Obfuscation (Hex/Octal/Integer).

export interface UrlValidatorOptions {
  /** Whether to allow loopback addresses (127.0.0.1, localhost). Default: true. */
  allowLocalhost?: boolean;
}

/** Blocked cloud metadata hostnames */
const BLOCKED_HOSTNAMES = new Set([
  'instance-data',
  'metadata.google.internal',
  '169.254.169.254',
  'metadata',
]);

/** Known DNS rebinding service domain patterns */
const REBINDING_DOMAINS_REGEX = /\.(nip\.io|sslip\.io|xip\.io|localtest\.me|traefik\.me|vividcortex\.com|burpcollaborator\.net)$/i;

/**
 * Parse and normalize numeric IP addresses (octal, hex, decimal, IPv4-mapped IPv6).
 * Returns canonical dot-decimal string "a.b.c.d" or normalized IPv6 string, or null if not a numeric IP.
 */
export function normalizeIpAddress(inputHost: string): { isIp: boolean; ipv4?: string; isMetadataIp?: boolean; isLoopbackIp?: boolean } {
  let host = inputHost.toLowerCase().trim();

  // Remove IPv6 brackets if present
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:169.254.169.254 or ::ffff:a9fe:a9fe)
  if (host.startsWith('::ffff:')) {
    host = host.slice(7);
    if (host.includes(':')) {
      const hexGroups = host.split(':');
      if (hexGroups.length === 2 && hexGroups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) {
        const g1 = parseInt(hexGroups[0], 16);
        const g2 = parseInt(hexGroups[1], 16);
        const b1 = (g1 >>> 8) & 0xff;
        const b2 = g1 & 0xff;
        const b3 = (g2 >>> 8) & 0xff;
        const b4 = g2 & 0xff;
        const ipv4 = `${b1}.${b2}.${b3}.${b4}`;
        const isMetadataIp = b1 === 169 && b2 === 254;
        const isLoopbackIp = b1 === 127 || (b1 === 0 && b2 === 0 && b3 === 0 && b4 === 0);
        return { isIp: true, ipv4, isMetadataIp, isLoopbackIp };
      }
    }
  }

  // IPv6 loopback / zero
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') {
    return { isIp: true, isLoopbackIp: true };
  }
  if (host === '::' || host === '0:0:0:0:0:0:0:0') {
    return { isIp: true, isLoopbackIp: true };
  }

  // Try parsing IPv4 (handles dot-decimal, octal 0177.0.0.1, hex 0x7f000001, single integer 2130706433)
  const parts = host.split('.');
  if (parts.length >= 1 && parts.length <= 4) {
    const nums: number[] = [];
    let valid = true;

    for (const part of parts) {
      let num = NaN;
      if (/^0x[0-9a-f]+$/i.test(part)) {
        num = parseInt(part, 16);
      } else if (/^0[0-7]+$/.test(part) && part.length > 1) {
        num = parseInt(part, 8);
      } else if (/^\d+$/.test(part)) {
        num = parseInt(part, 10);
      } else {
        valid = false;
        break;
      }
      if (isNaN(num) || num < 0 || num > 0xffffffff) {
        valid = false;
        break;
      }
      nums.push(num);
    }

    if (valid) {
      let ip32: number | undefined;
      if (parts.length === 1) {
        ip32 = nums[0] >>> 0;
      } else if (parts.length === 4) {
        if (nums.every((n) => n <= 255)) {
          ip32 = ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
        }
      }

      if (ip32 !== undefined) {
        const b1 = (ip32 >>> 24) & 0xff;
        const b2 = (ip32 >>> 16) & 0xff;
        const b3 = (ip32 >>> 8) & 0xff;
        const b4 = ip32 & 0xff;
        const ipv4 = `${b1}.${b2}.${b3}.${b4}`;

        const isMetadataIp = b1 === 169 && b2 === 254;
        const isLoopbackIp = b1 === 127 || (b1 === 0 && b2 === 0 && b3 === 0 && b4 === 0);

        return { isIp: true, ipv4, isMetadataIp, isLoopbackIp };
      }
    }
  }

  return { isIp: false };
}

/**
 * Validate a URL against SSRF vulnerabilities and DNS-rebinding attacks.
 * Throws an Error if the URL is invalid or targets a restricted endpoint.
 */
export function validateUrl(rawUrl: string, options: UrlValidatorOptions = {}): string {
  const allowLocalhost = options.allowLocalhost ?? true;

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL format: "${rawUrl}"`);
  }

  // 1. Only allow HTTP and HTTPS protocols
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`Forbidden URL protocol "${parsed.protocol}". Only http: and https: are allowed.`);
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Block DNS-rebinding wildcard service domains (e.g. 169.254.169.254.nip.io, 127.0.0.1.sslip.io)
  if (REBINDING_DOMAINS_REGEX.test(hostname)) {
    throw new Error(`Blocked SSRF attempt via DNS rebinding domain: "${hostname}"`);
  }

  // 3. Block Cloud Metadata hostnames
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.startsWith('169.254.')) {
    throw new Error(`Blocked SSRF attempt to metadata service: "${hostname}"`);
  }

  // 4. Normalize IP address and check for metadata / loopback IPs
  const ipInfo = normalizeIpAddress(hostname);
  if (ipInfo.isIp) {
    if (ipInfo.isMetadataIp) {
      throw new Error(`Blocked SSRF attempt to metadata service IP: "${hostname}"`);
    }
    if (!allowLocalhost && ipInfo.isLoopbackIp) {
      throw new Error(`Blocked request to localhost IP endpoint: "${hostname}"`);
    }
  }

  // 5. Optional loopback check for named hostnames if allowLocalhost is false
  if (!allowLocalhost) {
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '::1' ||
      hostname === '0.0.0.0'
    ) {
      throw new Error(`Blocked request to localhost endpoint: "${hostname}"`);
    }
  }

  return parsed.toString();
}


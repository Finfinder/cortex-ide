import { describe, it, expect } from 'vitest';
import { validateUrl, normalizeIpAddress } from './urlValidator';

describe('urlValidator & DNS Rebinding Protection', () => {
  describe('validateUrl', () => {
    it('should allow valid http and https URLs', () => {
      expect(validateUrl('http://example.com/api')).toBe('http://example.com/api');
      expect(validateUrl('https://api.openai.com/v1/chat')).toBe('https://api.openai.com/v1/chat');
    });

    it('should throw on non-HTTP protocols', () => {
      expect(() => validateUrl('ftp://example.com')).toThrow(/Forbidden URL protocol/);
      expect(() => validateUrl('file:///etc/passwd')).toThrow(/Forbidden URL protocol/);
      expect(() => validateUrl('gopher://example.com')).toThrow(/Forbidden URL protocol/);
      expect(() => validateUrl('ws://example.com')).toThrow(/Forbidden URL protocol/);
    });

    it('should throw on malformed URL strings', () => {
      expect(() => validateUrl('not a url')).toThrow(/Invalid URL format/);
    });

    it('should block cloud metadata IP addresses and hostnames', () => {
      expect(() => validateUrl('http://169.254.169.254/latest/meta-data')).toThrow(/metadata/i);
      expect(() => validateUrl('http://169.254.1.1/info')).toThrow(/metadata/i);
      expect(() => validateUrl('http://metadata.google.internal')).toThrow(/metadata/i);
      expect(() => validateUrl('http://instance-data')).toThrow(/metadata/i);
    });

    it('should block DNS rebinding service domains', () => {
      expect(() => validateUrl('http://127.0.0.1.nip.io')).toThrow(/DNS rebinding/i);
      expect(() => validateUrl('http://169.254.169.254.sslip.io')).toThrow(/DNS rebinding/i);
      expect(() => validateUrl('http://spoofed.xip.io')).toThrow(/DNS rebinding/i);
      expect(() => validateUrl('http://test.localtest.me')).toThrow(/DNS rebinding/i);
      expect(() => validateUrl('http://app.traefik.me')).toThrow(/DNS rebinding/i);
    });

    it('should respect allowLocalhost option', () => {
      expect(validateUrl('http://localhost:4096', { allowLocalhost: true })).toBe('http://localhost:4096/');
      expect(validateUrl('http://127.0.0.1:6333', { allowLocalhost: true })).toBe('http://127.0.0.1:6333/');

      expect(() => validateUrl('http://localhost:4096', { allowLocalhost: false })).toThrow(/localhost/i);
      expect(() => validateUrl('http://127.0.0.1:6333', { allowLocalhost: false })).toThrow(/localhost/i);
      expect(() => validateUrl('http://0.0.0.0:8080', { allowLocalhost: false })).toThrow(/localhost/i);
      expect(() => validateUrl('http://[::1]:8080', { allowLocalhost: false })).toThrow(/localhost/i);
    });

    it('should block obfuscated IP addresses (octal, hex, decimal, IPv4-mapped IPv6)', () => {
      // Octal 0177.0.0.1 = 127.0.0.1
      expect(() => validateUrl('http://0177.0.0.1', { allowLocalhost: false })).toThrow(/localhost/i);
      // Octal 0251.0376.0251.0376 = 169.254.169.254
      expect(() => validateUrl('http://0251.0376.0251.0376')).toThrow(/metadata service/i);
      // Hex 0x7f000001 = 127.0.0.1
      expect(() => validateUrl('http://0x7f000001', { allowLocalhost: false })).toThrow(/localhost/i);
      // Hex 0xA9FEA9FE = 169.254.169.254
      expect(() => validateUrl('http://0xA9FEA9FE')).toThrow(/metadata service/i);
      // Decimal 2130706433 = 127.0.0.1
      expect(() => validateUrl('http://2130706433', { allowLocalhost: false })).toThrow(/localhost/i);
      // Decimal 2852039166 = 169.254.169.254
      expect(() => validateUrl('http://2852039166')).toThrow(/metadata service/i);
      // IPv4-mapped IPv6 ::ffff:169.254.169.254 or ::ffff:a9fe:a9fe
      expect(() => validateUrl('http://[::ffff:169.254.169.254]')).toThrow(/(Invalid URL format|metadata service)/i);
      expect(() => validateUrl('http://[::ffff:a9fe:a9fe]')).toThrow(/(Invalid URL format|metadata service)/i);
    });
  });

  describe('normalizeIpAddress', () => {
    it('should correctly identify and parse standard IPv4 addresses', () => {
      const res = normalizeIpAddress('127.0.0.1');
      expect(res.isIp).toBe(true);
      expect(res.ipv4).toBe('127.0.0.1');
      expect(res.isLoopbackIp).toBe(true);
    });

    it('should identify metadata IPs', () => {
      const res = normalizeIpAddress('169.254.169.254');
      expect(res.isIp).toBe(true);
      expect(res.isMetadataIp).toBe(true);
    });

    it('should return isIp = false for regular domain names', () => {
      const res = normalizeIpAddress('example.com');
      expect(res.isIp).toBe(false);
    });
  });
});

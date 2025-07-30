const PaywallDetectorService = require('../../src/services/paywallDetector');

describe('Whitelist Integration Tests', () => {
  let detector;

  beforeEach(() => {
    detector = new PaywallDetectorService();
  });

  describe('whitelisted domains', () => {
    const whitelistedUrls = [
      'https://x.com/some-tweet',
      'https://twitter.com/user/status/123',
      'https://facebook.com/post/123',
      'https://instagram.com/p/abc123',
      'https://linkedin.com/posts/activity-123',
      'https://reddit.com/r/programming/comments/abc',
      'https://youtube.com/watch?v=abc123',
      'https://github.com/user/repo'
    ];

    test.each(whitelistedUrls)('should not detect paywall for whitelisted domain: %s', async (url) => {
      const isPaywalled = await detector.isPaywalled(url);
      expect(isPaywalled).toBe(false);
    });

    test('should return false for all whitelisted domains', async () => {
      const results = await Promise.all(
        whitelistedUrls.map(url => detector.isPaywalled(url))
      );
      
      expect(results.every(result => result === false)).toBe(true);
    });
  });

  describe('known paywall domains', () => {
    const paywallUrls = [
      'https://nytimes.com/article/123',
      'https://wsj.com/articles/123',
      'https://washingtonpost.com/news/123'
    ];

    test.each(paywallUrls)('should detect paywall for known paywall domain: %s', async (url) => {
      const isPaywalled = await detector.isPaywalled(url);
      expect(isPaywalled).toBe(true);
    });

    test('should return true for all known paywall domains', async () => {
      const results = await Promise.all(
        paywallUrls.map(url => detector.isPaywalled(url))
      );
      
      expect(results.every(result => result === true)).toBe(true);
    });
  });

  describe('whitelist priority', () => {
    test('should prioritize whitelist over known paywall domains', async () => {
      // Add a whitelisted domain to known paywall domains
      detector.addPaywallDomain('github.com');
      
      // Should still return false because whitelist has higher priority
      const isPaywalled = await detector.isPaywalled('https://github.com/user/repo');
      expect(isPaywalled).toBe(false);
    });
  });

  describe('domain extraction', () => {
    test('should handle www prefixes correctly', async () => {
      const withoutWww = await detector.isPaywalled('https://github.com/user/repo');
      const withWww = await detector.isPaywalled('https://www.github.com/user/repo');
      
      expect(withoutWww).toBe(withWww);
    });

    test('should handle different protocols', async () => {
      const https = await detector.isPaywalled('https://github.com/user/repo');
      const http = await detector.isPaywalled('http://github.com/user/repo');
      
      expect(https).toBe(http);
    });

    test('should handle query parameters and fragments', async () => {
      const simple = await detector.isPaywalled('https://github.com/user/repo');
      const withQuery = await detector.isPaywalled('https://github.com/user/repo?tab=readme');
      const withFragment = await detector.isPaywalled('https://github.com/user/repo#installation');
      
      expect(simple).toBe(withQuery);
      expect(simple).toBe(withFragment);
    });
  });

  describe('error handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      const invalidUrls = [
        'not-a-url',
        '',
        'ftp://invalid-protocol.com',
        'javascript:alert("xss")'
      ];

      for (const url of invalidUrls) {
        const isPaywalled = await detector.isPaywalled(url);
        expect(typeof isPaywalled).toBe('boolean');
      }
    });
  });

  describe('performance', () => {
    test('should process whitelisted domains quickly', async () => {
      const start = Date.now();
      
      await Promise.all([
        detector.isPaywalled('https://github.com/user/repo'),
        detector.isPaywalled('https://youtube.com/watch?v=abc'),
        detector.isPaywalled('https://reddit.com/r/test'),
        detector.isPaywalled('https://twitter.com/user/status/123')
      ]);
      
      const duration = Date.now() - start;
      
      // Should be very fast since no HTTP requests are made for whitelisted domains
      expect(duration).toBeLessThan(100);
    });

    test('should process known paywall domains quickly', async () => {
      const start = Date.now();
      
      await Promise.all([
        detector.isPaywalled('https://nytimes.com/article/123'),
        detector.isPaywalled('https://wsj.com/articles/123'),
        detector.isPaywalled('https://washingtonpost.com/news/123')
      ]);
      
      const duration = Date.now() - start;
      
      // Should be fast since no HTTP requests are made for known domains
      expect(duration).toBeLessThan(100);
    });
  });
});
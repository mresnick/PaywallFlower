const PaywallDetectorService = require('../../src/services/paywallDetector');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock config
jest.mock('../../src/config', () => ({
  paywallDomains: [
    'nytimes.com',
    'wsj.com',
    'washingtonpost.com'
  ],
  whitelistedDomains: [
    'x.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'reddit.com',
    'youtube.com',
    'github.com'
  ],
  paywallIndicators: [
    'subscribe',
    'paywall',
    'premium',
    'subscriber',
    'membership',
    'sign up',
    'register to read',
    'continue reading'
  ],
  logging: {
    level: 'DEBUG'
  }
}));

describe('PaywallDetectorService', () => {
  let detector;

  beforeEach(() => {
    detector = new PaywallDetectorService();
    jest.clearAllMocks();
  });

  describe('isWhitelistedDomain', () => {
    test('should return true for whitelisted domains', () => {
      expect(detector.isWhitelistedDomain('https://x.com/some-tweet')).toBe(true);
      expect(detector.isWhitelistedDomain('https://twitter.com/user/status/123')).toBe(true);
      expect(detector.isWhitelistedDomain('https://facebook.com/post/123')).toBe(true);
      expect(detector.isWhitelistedDomain('https://github.com/user/repo')).toBe(true);
    });

    test('should return false for non-whitelisted domains', () => {
      expect(detector.isWhitelistedDomain('https://nytimes.com/article')).toBe(false);
      expect(detector.isWhitelistedDomain('https://example.com/page')).toBe(false);
    });

    test('should handle www prefix correctly', () => {
      expect(detector.isWhitelistedDomain('https://www.github.com/user/repo')).toBe(true);
    });

    test('should return false for invalid URLs', () => {
      expect(detector.isWhitelistedDomain('not-a-url')).toBe(false);
      expect(detector.isWhitelistedDomain('')).toBe(false);
    });
  });

  describe('isKnownPaywallDomain', () => {
    test('should return true for known paywall domains', () => {
      expect(detector.isKnownPaywallDomain('https://nytimes.com/article')).toBe(true);
      expect(detector.isKnownPaywallDomain('https://wsj.com/articles/123')).toBe(true);
      expect(detector.isKnownPaywallDomain('https://washingtonpost.com/news/123')).toBe(true);
    });

    test('should return false for unknown domains', () => {
      expect(detector.isKnownPaywallDomain('https://example.com/article')).toBe(false);
      expect(detector.isKnownPaywallDomain('https://github.com/user/repo')).toBe(false);
    });

    test('should handle www prefix correctly', () => {
      expect(detector.isKnownPaywallDomain('https://www.nytimes.com/article')).toBe(true);
    });

    test('should return false for invalid URLs', () => {
      expect(detector.isKnownPaywallDomain('not-a-url')).toBe(false);
      expect(detector.isKnownPaywallDomain('')).toBe(false);
    });
  });

  describe('detectPaywallHeuristic', () => {
    test('should detect paywall when indicators are present', async () => {
      const mockResponse = {
        data: '<html><body>Please subscribe to continue reading this article</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalledWith('https://example.com/article', {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });
    });

    test('should not detect paywall when no indicators are present', async () => {
      const mockResponse = {
        data: '<html><body>This is a free article</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(false);
    });

    test('should detect multiple paywall indicators', async () => {
      const mockResponse = {
        data: '<html><body>Subscribe now for premium membership to continue reading</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(true);
    });

    test('should be case insensitive', async () => {
      const mockResponse = {
        data: '<html><body>SUBSCRIBE NOW TO CONTINUE READING</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(true);
    });

    test('should return false on HTTP error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(false);
    });

    test('should return false on timeout', async () => {
      mockedAxios.get.mockRejectedValue(new Error('timeout of 5000ms exceeded'));

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(false);
    });

    test('should add domain to known paywall domains when paywall detected', async () => {
      const mockResponse = {
        data: '<html><body>Please subscribe to read more</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const initialDomains = detector.getKnownDomains();
      await detector.detectPaywallHeuristic('https://newsite.com/article');
      const updatedDomains = detector.getKnownDomains();

      expect(updatedDomains).toContain('newsite.com');
      expect(updatedDomains.length).toBe(initialDomains.length + 1);
    });
  });

  describe('isPaywalled', () => {
    test('should return false for whitelisted domains without checking further', async () => {
      const result = await detector.isPaywalled('https://github.com/user/repo');
      
      expect(result).toBe(false);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    test('should return true for known paywall domains without heuristic check', async () => {
      const result = await detector.isPaywalled('https://nytimes.com/article');
      
      expect(result).toBe(true);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });

    test('should perform heuristic check for unknown domains', async () => {
      const mockResponse = {
        data: '<html><body>Please subscribe to continue</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.isPaywalled('https://unknown-site.com/article');
      
      expect(result).toBe(true);
      expect(mockedAxios.get).toHaveBeenCalled();
    });

    test('should prioritize whitelist over known paywall domains', async () => {
      // Add a whitelisted domain to known paywall domains
      detector.addPaywallDomain('github.com');
      
      const result = await detector.isPaywalled('https://github.com/user/repo');
      
      expect(result).toBe(false);
      expect(mockedAxios.get).not.toHaveBeenCalled();
    });
  });

  describe('addPaywallDomain', () => {
    test('should add domain to known paywall domains', () => {
      const initialDomains = detector.getKnownDomains();
      detector.addPaywallDomain('newpaywall.com');
      const updatedDomains = detector.getKnownDomains();

      expect(updatedDomains).toContain('newpaywall.com');
      expect(updatedDomains.length).toBe(initialDomains.length + 1);
    });

    test('should not add duplicate domains', () => {
      detector.addPaywallDomain('testdomain.com');
      const domainsAfterFirst = detector.getKnownDomains();
      
      detector.addPaywallDomain('testdomain.com');
      const domainsAfterSecond = detector.getKnownDomains();

      expect(domainsAfterFirst.length).toBe(domainsAfterSecond.length);
    });
  });

  describe('getKnownDomains', () => {
    test('should return array of known domains', () => {
      const domains = detector.getKnownDomains();
      
      expect(Array.isArray(domains)).toBe(true);
      expect(domains).toContain('nytimes.com');
      expect(domains).toContain('wsj.com');
      expect(domains).toContain('washingtonpost.com');
    });

    test('should return copy of domains array', () => {
      const domains1 = detector.getKnownDomains();
      const domains2 = detector.getKnownDomains();
      
      expect(domains1).not.toBe(domains2); // Different array instances
      expect(domains1).toEqual(domains2); // Same content
    });
  });
});
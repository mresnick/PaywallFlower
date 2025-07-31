const PaywallDetectorService = require('../../src/services/paywallDetector');
const axios = require('axios');

// Mock axios
jest.mock('axios');
const mockedAxios = axios;

// Mock config with new structure
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
  paywallDetection: {
    strongIndicators: [
      { text: 'paywall', weight: 10 },
      { text: 'subscriber-only', weight: 10 },
      { text: 'premium content', weight: 9 },
      { text: 'subscription required', weight: 9 },
      { text: 'register to read', weight: 8 },
      { text: 'continue reading', weight: 8 },
      { text: 'unlock this article', weight: 8 },
      { text: 'become a member', weight: 7 },
      { text: 'subscribe to continue', weight: 8 },
      { text: 'free articles remaining', weight: 9 },
      { text: 'article limit reached', weight: 9 },
      { text: 'premium subscription', weight: 7 }
    ],
    mediumIndicators: [
      { text: 'subscribe', weight: 4 },
      { text: 'membership', weight: 4 },
      { text: 'premium', weight: 3 },
      { text: 'subscriber', weight: 4 },
      { text: 'full access', weight: 3 },
      { text: 'unlimited access', weight: 4 },
      { text: 'digital subscription', weight: 5 }
    ],
    weakIndicators: [
      { text: 'sign up', weight: 1 },
      { text: 'register', weight: 1 },
      { text: 'join', weight: 1 },
      { text: 'account', weight: 1 }
    ],
    negativeIndicators: [
      { text: 'free', weight: -3 },
      { text: 'no subscription', weight: -5 },
      { text: 'always free', weight: -5 },
      { text: 'open access', weight: -4 },
      { text: 'public domain', weight: -4 },
      { text: 'creative commons', weight: -3 },
      { text: 'free to read', weight: -4 },
      { text: 'no paywall', weight: -8 },
      { text: 'free article', weight: -4 },
      { text: 'complimentary access', weight: -3 }
    ],
    contextIndicators: {
      navigation: [
        { text: 'subscribe', weight: 6 },
        { text: 'premium', weight: 5 },
        { text: 'membership', weight: 5 }
      ],
      content: [
        { text: 'continue reading', weight: 8 },
        { text: 'read more', weight: 2 },
        { text: 'full story', weight: 3 }
      ]
    },
    threshold: 8,
    maxWeakIndicatorScore: 3
  },
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

  describe('analyzeContentStructure', () => {
    test('should detect very short content', () => {
      const shortContent = '<html><body>Short article</body></html>';
      const analysis = detector.analyzeContentStructure(shortContent);
      
      expect(analysis.score).toBeGreaterThan(0);
      expect(analysis.details).toContain('Very short content (possible truncation)');
    });

    test('should detect paywall overlay patterns', () => {
      const contentWithOverlay = '<html><body><div class="paywall-overlay">Content</div></body></html>';
      const analysis = detector.analyzeContentStructure(contentWithOverlay);
      
      expect(analysis.score).toBeGreaterThan(0);
      expect(analysis.details.some(detail => detail.includes('paywall overlay pattern'))).toBe(true);
    });

    test('should detect subscription patterns', () => {
      const contentWithSubscription = '<html><body><div class="subscription-required">Content</div></body></html>';
      const analysis = detector.analyzeContentStructure(contentWithSubscription);
      
      expect(analysis.score).toBeGreaterThan(0);
    });

    test('should not flag normal content', () => {
      const normalContent = '<html><body>' + 'A'.repeat(1000) + '</body></html>';
      const analysis = detector.analyzeContentStructure(normalContent);
      
      expect(analysis.score).toBe(0);
    });
  });

  describe('calculatePaywallScore', () => {
    test('should detect strong paywall indicators', () => {
      const content = '<html><body>This article has a paywall. Please subscribe to continue.</body></html>';
      const result = detector.calculatePaywallScore(content);
      
      expect(result.score).toBeGreaterThanOrEqual(8);
      expect(result.hasPaywall).toBe(true);
      expect(result.foundIndicators.some(i => i.type === 'strong')).toBe(true);
    });

    test('should apply negative indicators to reduce false positives', () => {
      const content = '<html><body>Sign up for our free newsletter. This article is always free to read.</body></html>';
      const result = detector.calculatePaywallScore(content);
      
      expect(result.score).toBeLessThan(8);
      expect(result.hasPaywall).toBe(false);
      expect(result.foundIndicators.some(i => i.type === 'negative')).toBe(true);
    });

    test('should cap weak indicator scores', () => {
      const content = '<html><body>Sign up, register, join our account system</body></html>';
      const result = detector.calculatePaywallScore(content);
      
      expect(result.score).toBeLessThanOrEqual(3); // maxWeakIndicatorScore
      expect(result.hasPaywall).toBe(false);
    });

    test('should combine multiple indicator types', () => {
      const content = '<html><body>Subscribe to our premium membership for unlimited access</body></html>';
      const result = detector.calculatePaywallScore(content);
      
      expect(result.foundIndicators.length).toBeGreaterThan(1);
      expect(result.score).toBeGreaterThan(8);
      expect(result.hasPaywall).toBe(true);
    });

    test('should handle mixed positive and negative indicators', () => {
      const content = '<html><body>Subscribe to premium but this article is free to read</body></html>';
      const result = detector.calculatePaywallScore(content);
      
      expect(result.foundIndicators.some(i => i.type === 'medium')).toBe(true);
      expect(result.foundIndicators.some(i => i.type === 'negative')).toBe(true);
      expect(result.score).toBeLessThan(8);
    });
  });

  describe('detectPaywallHeuristic', () => {
    test('should detect paywall with strong indicators', async () => {
      const mockResponse = {
        data: '<html><body>You have reached your free articles remaining limit. Subscribe to continue reading.</body></html>'
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

    test('should not detect paywall with only weak indicators', async () => {
      const mockResponse = {
        data: '<html><body>Sign up for our newsletter and join our community</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(false);
    });

    test('should not detect paywall when negative indicators outweigh positive', async () => {
      const mockResponse = {
        data: '<html><body>Subscribe to our newsletter. This article is always free and has no paywall.</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(false);
    });

    test('should return false on HTTP error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await detector.detectPaywallHeuristic('https://example.com/article');
      
      expect(result).toBe(false);
    });

    test('should add domain to known paywall domains when paywall detected', async () => {
      const mockResponse = {
        data: '<html><body>This content requires a premium subscription to continue reading.</body></html>'
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
        data: '<html><body>You have reached your article limit. Subscribe to continue reading.</body></html>'
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

  describe('getDetailedAnalysis', () => {
    test('should return comprehensive analysis for successful requests', async () => {
      const mockResponse = {
        data: '<html><body>Subscribe to our premium content for unlimited access</body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const analysis = await detector.getDetailedAnalysis('https://example.com/article');
      
      expect(analysis).toHaveProperty('url');
      expect(analysis).toHaveProperty('domain');
      expect(analysis).toHaveProperty('score');
      expect(analysis).toHaveProperty('foundIndicators');
      expect(analysis).toHaveProperty('hasPaywall');
      expect(analysis).toHaveProperty('isWhitelisted');
      expect(analysis).toHaveProperty('isKnownPaywall');
      expect(analysis).toHaveProperty('isMediaFile');
    });

    test('should handle errors gracefully', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const analysis = await detector.getDetailedAnalysis('https://example.com/article');
      
      expect(analysis).toHaveProperty('error');
      expect(analysis).toHaveProperty('url');
      expect(analysis).toHaveProperty('domain');
    });
  });

  describe('Edge Cases and False Positive Prevention', () => {
    test('should not flag social media signup prompts', async () => {
      const mockResponse = {
        data: '<html><body><h1>Great Article</h1><p>This is a free article about technology.</p><footer>Sign up for our free newsletter!</footer></body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://techblog.com/article');
      
      expect(result).toBe(false);
    });

    test('should not flag e-commerce sites with membership programs', async () => {
      const mockResponse = {
        data: '<html><body><h1>Product Page</h1><p>Join our membership program for free shipping!</p></body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://shop.com/product');
      
      expect(result).toBe(false);
    });

    test('should detect legitimate paywalls with multiple strong indicators', async () => {
      const mockResponse = {
        data: '<html><body><div class="paywall-overlay"><h2>Subscription Required</h2><p>You have reached your free articles remaining limit. Subscribe to continue reading premium content.</p></div></body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://news-site.com/article');
      
      expect(result).toBe(true);
    });

    test('should handle content with registration but explicit free access', async () => {
      const mockResponse = {
        data: '<html><body><h1>Free Article</h1><p>This article is always free to read. No subscription required.</p><p>Register for our newsletter to get more free content.</p></body></html>'
      };
      mockedAxios.get.mockResolvedValue(mockResponse);

      const result = await detector.detectPaywallHeuristic('https://freeblog.com/article');
      
      expect(result).toBe(false);
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
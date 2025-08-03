const SmartBypassService = require('../../src/services/smartBypassService');
const BypassMethodRegistry = require('../../src/services/bypassMethodRegistry');
const BypassMetrics = require('../../src/services/bypassMetrics');
const PaywallDetectorService = require('../../src/services/paywallDetector');

// Mock the dependencies
jest.mock('../../src/services/bypassMethodRegistry');
jest.mock('../../src/services/bypassMetrics');
jest.mock('../../src/services/paywallDetector');
jest.mock('../../src/utils/logger');

describe('SmartBypassService', () => {
  let smartBypassService;
  let mockRegistry;
  let mockMetrics;
  let mockPaywallDetector;
  let mockMethod1;
  let mockMethod2;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock methods
    mockMethod1 = {
      name: 'archive_today',
      config: { priority: 9, enabled: true },
      isAvailable: jest.fn(() => true),
      attempt: jest.fn(),
      healthCheck: jest.fn(() => ({ healthy: true })),
      cleanup: jest.fn()
    };

    mockMethod2 = {
      name: '12ft_io',
      config: { priority: 8, enabled: true },
      isAvailable: jest.fn(() => true),
      attempt: jest.fn(),
      healthCheck: jest.fn(() => ({ healthy: true })),
      cleanup: jest.fn()
    };

    // Mock registry
    mockRegistry = {
      autoRegisterMethods: jest.fn(),
      startHealthChecks: jest.fn(),
      getAllMethods: jest.fn(() => [mockMethod1, mockMethod2]),
      getAvailableMethods: jest.fn(() => [mockMethod1, mockMethod2]),
      getMethodsByPriority: jest.fn(() => [mockMethod1, mockMethod2]),
      getMethod: jest.fn((name) => name === 'archive_today' ? mockMethod1 : mockMethod2),
      performHealthChecks: jest.fn(() => ({
        totalMethods: 2,
        healthyMethods: 2,
        results: {
          archive_today: { healthy: true },
          '12ft_io': { healthy: true }
        }
      })),
      getMetrics: jest.fn(() => ({
        summary: { totalMethods: 2, enabledMethods: 2, healthyMethods: 2 }
      })),
      cleanup: jest.fn()
    };

    // Mock metrics
    mockMetrics = {
      recordAttempt: jest.fn(),
      getBestMethodsForDomain: jest.fn(() => []),
      getMethodsToBlacklist: jest.fn(() => []),
      getGlobalMetrics: jest.fn(() => ({
        totalAttempts: 10,
        totalSuccesses: 8,
        overallSuccessRate: 80
      }))
    };

    // Mock paywall detector
    mockPaywallDetector = {
      isPaywalled: jest.fn(() => true)
    };

    // Set up constructor mocks - ensure they are Jest mock functions
    if (jest.isMockFunction(BypassMethodRegistry)) {
      BypassMethodRegistry.mockImplementation(() => mockRegistry);
    }
    if (jest.isMockFunction(BypassMetrics)) {
      BypassMetrics.mockImplementation(() => mockMetrics);
    }
    if (jest.isMockFunction(PaywallDetectorService)) {
      PaywallDetectorService.mockImplementation(() => mockPaywallDetector);
    }

    smartBypassService = new SmartBypassService();
  });

  afterEach(async () => {
    if (smartBypassService && smartBypassService.initialized) {
      await smartBypassService.cleanup();
    }
  });

  describe('initialization', () => {
    test('should initialize successfully', async () => {
      await smartBypassService.initialize();

      expect(smartBypassService.initialized).toBe(true);
      expect(mockRegistry.autoRegisterMethods).toHaveBeenCalled();
      // Health checks are not started in test environment
      if (process.env.NODE_ENV !== 'test') {
        expect(mockRegistry.startHealthChecks).toHaveBeenCalled();
      }
    });

    test('should not initialize twice', async () => {
      await smartBypassService.initialize();
      await smartBypassService.initialize();

      expect(mockRegistry.autoRegisterMethods).toHaveBeenCalledTimes(1);
    });

    test('should handle initialization errors', async () => {
      mockRegistry.autoRegisterMethods.mockRejectedValue(new Error('Init failed'));

      await expect(smartBypassService.initialize()).rejects.toThrow('Init failed');
      expect(smartBypassService.initialized).toBe(false);
    });
  });

  describe('bypassPaywall', () => {
    beforeEach(async () => {
      await smartBypassService.initialize();
    });

    test('should skip bypass for non-paywalled URLs', async () => {
      mockPaywallDetector.isPaywalled.mockResolvedValue(false);

      const result = await smartBypassService.bypassPaywall('https://example.com/article');

      expect(result).toEqual({
        success: false,
        error: 'URL is not paywalled'
      });
      expect(mockMethod1.attempt).not.toHaveBeenCalled();
    });

    test('should successfully bypass with first method', async () => {
      mockMethod1.attempt.mockResolvedValue({
        success: true,
        result: 'https://archive.today/abc123',
        method: 'archive_redirect'
      });

      const result = await smartBypassService.bypassPaywall('https://nytimes.com/article');

      expect(result.success).toBe(true);
      expect(result.result).toBe('https://archive.today/abc123');
      expect(result.method).toBe('archive_today');
      expect(mockMethod1.attempt).toHaveBeenCalledWith('https://nytimes.com/article', {});
      expect(mockMethod2.attempt).not.toHaveBeenCalled();
      expect(mockMetrics.recordAttempt).toHaveBeenCalledWith(
        'https://nytimes.com/article',
        'archive_today',
        true,
        expect.any(Number),
        expect.any(Object)
      );
    });

    test('should try second method if first fails', async () => {
      mockMethod1.attempt.mockResolvedValue({
        success: false,
        error: 'Archive not found'
      });
      mockMethod2.attempt.mockResolvedValue({
        success: true,
        result: 'https://12ft.io/proxy?q=https://nytimes.com/article',
        method: '12ft_redirect'
      });

      const result = await smartBypassService.bypassPaywall('https://nytimes.com/article');

      expect(result.success).toBe(true);
      expect(result.method).toBe('12ft_io');
      expect(mockMethod1.attempt).toHaveBeenCalled();
      expect(mockMethod2.attempt).toHaveBeenCalled();
      expect(mockMetrics.recordAttempt).toHaveBeenCalledTimes(2);
    });

    test('should return failure when all methods fail', async () => {
      mockMethod1.attempt.mockResolvedValue({
        success: false,
        error: 'Archive not found'
      });
      mockMethod2.attempt.mockResolvedValue({
        success: false,
        error: '12ft.io blocked'
      });

      const result = await smartBypassService.bypassPaywall('https://nytimes.com/article');

      expect(result.success).toBe(false);
      expect(result.error).toBe('All bypass methods failed');
      expect(result.attemptedMethods).toEqual(['archive_today', '12ft_io']);
      expect(mockMetrics.recordAttempt).toHaveBeenCalledTimes(2);
    });

    test('should respect rate limiting', async () => {
      const url = 'https://example.com/article';
      
      // Make 3 requests (should work)
      for (let i = 0; i < 3; i++) {
        const result = await smartBypassService.bypassPaywall(url);
        expect(result.error).not.toBe('Rate limit exceeded');
      }

      // 4th request should be rate limited
      const result = await smartBypassService.bypassPaywall(url);
      expect(result).toEqual({
        success: false,
        error: 'Rate limit exceeded'
      });
    });

    test('should handle method exceptions', async () => {
      mockMethod1.attempt.mockRejectedValue(new Error('Network error'));
      mockMethod2.attempt.mockResolvedValue({
        success: true,
        result: 'https://12ft.io/proxy?q=https://nytimes.com/article'
      });

      const result = await smartBypassService.bypassPaywall('https://nytimes.com/article');

      expect(result.success).toBe(true);
      expect(result.method).toBe('12ft_io');
      expect(mockMetrics.recordAttempt).toHaveBeenCalledWith(
        'https://nytimes.com/article',
        'archive_today',
        false,
        0,
        { error: 'Network error' }
      );
    });
  });

  describe('getMethodsForDomain', () => {
    beforeEach(async () => {
      await smartBypassService.initialize();
    });

    test('should return methods in priority order for unknown domain', () => {
      const methods = smartBypassService.getMethodsForDomain('unknown.com');

      expect(methods).toEqual([mockMethod1, mockMethod2]);
      expect(mockRegistry.getMethodsByPriority).toHaveBeenCalledWith(true);
    });

    test('should use domain-specific strategy when available', () => {
      // Set up domain strategy
      smartBypassService.domainStrategies.set('nytimes.com', {
        preferredMethods: ['12ft_io', 'archive_today'],
        blacklistedMethods: ['wayback_machine']
      });

      const methods = smartBypassService.getMethodsForDomain('nytimes.com');

      expect(methods[0].name).toBe('12ft_io');
      expect(methods[1].name).toBe('archive_today');
    });

    test('should prioritize methods with good historical performance', () => {
      mockMetrics.getBestMethodsForDomain.mockReturnValue([
        { method: '12ft_io', recentSuccessRate: 80, successRate: 75 },
        { method: 'archive_today', recentSuccessRate: 60, successRate: 70 }
      ]);

      const methods = smartBypassService.getMethodsForDomain('example.com');

      expect(methods[0].name).toBe('12ft_io');
    });
  });

  describe('updateDomainStrategy', () => {
    beforeEach(async () => {
      await smartBypassService.initialize();
    });

    test('should create new strategy for unknown domain', () => {
      smartBypassService.updateDomainStrategy('newdomain.com', 'archive_today', true, 1000);

      const strategy = smartBypassService.domainStrategies.get('newdomain.com');
      expect(strategy).toBeDefined();
      expect(strategy.domain).toBe('newdomain.com');
      expect(strategy.preferredMethods).toContain('archive_today');
      expect(strategy.totalAttempts).toBe(1);
      expect(strategy.successfulAttempts).toBe(1);
    });

    test('should update existing strategy on success', () => {
      // Create initial strategy
      smartBypassService.domainStrategies.set('example.com', {
        domain: 'example.com',
        preferredMethods: ['12ft_io'],
        blacklistedMethods: [],
        totalAttempts: 5,
        successfulAttempts: 3
      });

      smartBypassService.updateDomainStrategy('example.com', 'archive_today', true, 800);

      const strategy = smartBypassService.domainStrategies.get('example.com');
      expect(strategy.preferredMethods[0]).toBe('archive_today');
      expect(strategy.totalAttempts).toBe(6);
      expect(strategy.successfulAttempts).toBe(4);
    });

    test('should blacklist consistently failing methods', () => {
      mockMetrics.getMethodsToBlacklist.mockReturnValue(['wayback_machine']);

      smartBypassService.updateDomainStrategy('example.com', 'archive_today', true, 1000);

      const strategy = smartBypassService.domainStrategies.get('example.com');
      expect(strategy.blacklistedMethods).toContain('wayback_machine');
    });
  });

  describe('processUrls', () => {
    beforeEach(async () => {
      await smartBypassService.initialize();
    });

    test('should process multiple URLs', async () => {
      mockMethod1.attempt
        .mockResolvedValueOnce({
          success: true,
          result: 'https://archive.today/abc123'
        })
        .mockResolvedValueOnce({
          success: true,
          result: 'https://archive.today/def456'
        });

      const urls = ['https://example.com/article1', 'https://example.com/article2'];
      const results = await smartBypassService.processUrls(urls);

      expect(results).toHaveLength(2);
      expect(results[0].originalUrl).toBe('https://example.com/article1');
      expect(results[1].originalUrl).toBe('https://example.com/article2');
    });

    test('should skip failed URLs', async () => {
      mockMethod1.attempt
        .mockResolvedValueOnce({
          success: true,
          result: 'https://archive.today/abc123'
        })
        .mockResolvedValueOnce({
          success: false,
          error: 'Failed'
        });

      const urls = ['https://example.com/article1', 'https://example.com/article2'];
      const results = await smartBypassService.processUrls(urls);

      expect(results).toHaveLength(1);
      expect(results[0].originalUrl).toBe('https://example.com/article1');
    });
  });

  describe('getMetrics', () => {
    beforeEach(async () => {
      await smartBypassService.initialize();
    });

    test('should return comprehensive metrics', () => {
      const metrics = smartBypassService.getMetrics();

      expect(metrics).toHaveProperty('registry');
      expect(metrics).toHaveProperty('bypass');
      expect(metrics).toHaveProperty('domainStrategies');
      expect(metrics).toHaveProperty('timestamp');
      expect(mockRegistry.getMetrics).toHaveBeenCalled();
      expect(mockMetrics.getGlobalMetrics).toHaveBeenCalled();
    });
  });

  describe('getHealthStatus', () => {
    beforeEach(async () => {
      await smartBypassService.initialize();
    });

    test('should return health status', async () => {
      const health = await smartBypassService.getHealthStatus();

      expect(health).toHaveProperty('service');
      expect(health).toHaveProperty('methods');
      expect(health).toHaveProperty('timestamp');
      expect(health.service.initialized).toBe(true);
      expect(health.service.registeredMethods).toBe(2);
      expect(health.service.availableMethods).toBe(2);
      expect(mockRegistry.performHealthChecks).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    test('should cleanup all resources', async () => {
      await smartBypassService.initialize();
      await smartBypassService.cleanup();

      expect(mockRegistry.cleanup).toHaveBeenCalled();
      expect(smartBypassService.initialized).toBe(false);
      expect(smartBypassService.requestCounts.size).toBe(0);
      expect(smartBypassService.domainStrategies.size).toBe(0);
    });
  });
});
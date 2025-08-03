const BypassMethodRegistry = require('./bypassMethodRegistry');
const BypassMetrics = require('./bypassMetrics');
const PaywallDetectorService = require('./paywallDetector');
const logger = require('../utils/logger');
const { normalizeUrl, extractDomain } = require('../utils/urlExtractor');

/**
 * Smart Bypass Service - Orchestrates intelligent paywall bypassing
 * Uses domain-specific strategies, success tracking, and adaptive learning
 */
class SmartBypassService {
  constructor() {
    this.registry = new BypassMethodRegistry();
    this.metrics = new BypassMetrics();
    this.paywallDetector = new PaywallDetectorService();
    this.requestCounts = new Map(); // For rate limiting
    this.domainStrategies = new Map(); // Domain-specific strategies
    this.initialized = false;
  }

  /**
   * Initializes the service and registers bypass methods
   */
  async initialize() {
    if (this.initialized) return;

    logger.info('Initializing SmartBypassService');

    try {
      // Auto-register bypass methods
      await this.registry.autoRegisterMethods();
      
      // Start health checks only if not in test environment
      if (process.env.NODE_ENV !== 'test') {
        this.registry.startHealthChecks();
      }
      
      // Load domain strategies if they exist
      await this.loadDomainStrategies();
      
      this.initialized = true;
      logger.info('SmartBypassService initialized successfully', {
        registeredMethods: this.registry.getAllMethods().length
      });
      
    } catch (error) {
      logger.error('Failed to initialize SmartBypassService', { error: error.message });
      throw error;
    }
  }

  /**
   * Main method to bypass paywall for a given URL
   * @param {string} url - The URL to bypass
   * @param {Object} options - Additional options
   * @returns {Promise<BypassResult>}
   */
  async bypassPaywall(url, options = {}) {
    const normalizedUrl = normalizeUrl(url);
    const domain = extractDomain(normalizedUrl);
    
    try {
      logger.info(`Starting smart paywall bypass for: ${normalizedUrl}`);

      // Check if URL is paywalled
      const isPaywalled = await this.paywallDetector.isPaywalled(normalizedUrl);
      logger.debug(`Paywall detection result: ${isPaywalled}`);
      
      if (!isPaywalled) {
        logger.info(`URL is not paywalled, skipping bypass`);
        return { success: false, error: 'URL is not paywalled' };
      }

      // Check rate limiting
      if (!this.checkRateLimit(normalizedUrl)) {
        logger.warn(`Rate limit exceeded for ${normalizedUrl}`);
        return { success: false, error: 'Rate limit exceeded' };
      }

      // Get prioritized methods for this domain
      const methods = this.getMethodsForDomain(domain);
      
      if (methods.length === 0) {
        logger.warn(`No available bypass methods for domain: ${domain}`);
        return { success: false, error: 'No available bypass methods' };
      }

      logger.debug(`Attempting bypass with ${methods.length} methods`, {
        methods: methods.map(m => ({ name: m.name, priority: m.config.priority }))
      });

      // Try methods in order of priority
      for (const method of methods) {
        try {
          logger.debug(`Trying method: ${method.name}`);
          const startTime = Date.now();
          
          const result = await method.attempt(normalizedUrl, options);
          const responseTime = Date.now() - startTime;
          
          // Record metrics
          this.metrics.recordAttempt(
            normalizedUrl,
            method.name,
            result.success,
            responseTime,
            { 
              method: result.method,
              error: result.error 
            }
          );

          if (result.success) {
            logger.info(`Bypass successful using ${method.name}`, {
              responseTime,
              method: result.method
            });

            // Update domain strategy based on success
            this.updateDomainStrategy(domain, method.name, true, responseTime);

            return {
              success: true,
              result: result.result,
              method: method.name,
              responseTime,
              extractedContent: result.extractedContent,
              metadata: result.metadata || {}
            };
          } else {
            logger.debug(`Method ${method.name} failed: ${result.error}`);
            
            // Update domain strategy based on failure
            this.updateDomainStrategy(domain, method.name, false, responseTime);
          }
          
        } catch (error) {
          logger.error(`Error with method ${method.name}`, { error: error.message });
          
          // Record failed attempt
          this.metrics.recordAttempt(
            normalizedUrl,
            method.name,
            false,
            0,
            { error: error.message }
          );
        }
      }

      // All methods failed
      logger.warn(`All bypass methods failed for ${normalizedUrl}`);
      return {
        success: false,
        error: 'All bypass methods failed',
        attemptedMethods: methods.map(m => m.name)
      };

    } catch (error) {
      logger.error(`Smart bypass failed`, {
        error: error.message,
        stack: error.stack,
        url: normalizedUrl
      });
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Gets prioritized bypass methods for a specific domain
   * @param {string} domain - Domain name
   * @returns {BypassMethod[]} Ordered array of methods to try
   */
  getMethodsForDomain(domain) {
    // Get domain-specific strategy if it exists
    const domainStrategy = this.domainStrategies.get(domain);
    
    if (domainStrategy && domainStrategy.preferredMethods.length > 0) {
      // Use domain-specific method ordering
      const methods = [];
      
      // Add preferred methods first
      for (const methodName of domainStrategy.preferredMethods) {
        const method = this.registry.getMethod(methodName);
        if (method && method.isAvailable() && !domainStrategy.blacklistedMethods.includes(methodName)) {
          methods.push(method);
        }
      }
      
      // Add remaining available methods
      const remainingMethods = this.registry.getAvailableMethods()
        .filter(method => 
          !domainStrategy.preferredMethods.includes(method.name) &&
          !domainStrategy.blacklistedMethods.includes(method.name)
        )
        .sort((a, b) => b.config.priority - a.config.priority);
      
      methods.push(...remainingMethods);
      return methods;
    }
    
    // Use global method prioritization based on metrics
    const availableMethods = this.registry.getAvailableMethods();
    const bestMethods = this.metrics.getBestMethodsForDomain(domain, 3);
    
    if (bestMethods.length > 0) {
      // Prioritize based on historical success for this domain
      const methodsBySuccess = [];
      const remainingMethods = [];
      
      for (const method of availableMethods) {
        const bestMethod = bestMethods.find(bm => bm.method === method.name);
        if (bestMethod && bestMethod.recentSuccessRate > 50) {
          methodsBySuccess.push({ method, successRate: bestMethod.recentSuccessRate });
        } else {
          remainingMethods.push(method);
        }
      }
      
      // Sort by success rate, then by priority
      methodsBySuccess.sort((a, b) => {
        if (Math.abs(a.successRate - b.successRate) > 10) {
          return b.successRate - a.successRate;
        }
        return b.method.config.priority - a.method.config.priority;
      });
      
      remainingMethods.sort((a, b) => b.config.priority - a.config.priority);
      
      return [
        ...methodsBySuccess.map(item => item.method),
        ...remainingMethods
      ];
    }
    
    // Fallback to priority-based ordering
    return this.registry.getMethodsByPriority(true);
  }

  /**
   * Updates domain strategy based on method performance
   * @param {string} domain - Domain name
   * @param {string} methodName - Method that was tried
   * @param {boolean} success - Whether it succeeded
   * @param {number} responseTime - Response time
   */
  updateDomainStrategy(domain, methodName, success, responseTime) {
    let strategy = this.domainStrategies.get(domain);
    
    if (!strategy) {
      strategy = {
        domain,
        preferredMethods: [],
        blacklistedMethods: [],
        lastUpdated: new Date(),
        totalAttempts: 0,
        successfulAttempts: 0
      };
      this.domainStrategies.set(domain, strategy);
    }
    
    strategy.totalAttempts++;
    if (success) {
      strategy.successfulAttempts++;
      
      // Move successful method to front of preferred list
      const index = strategy.preferredMethods.indexOf(methodName);
      if (index > 0) {
        strategy.preferredMethods.splice(index, 1);
        strategy.preferredMethods.unshift(methodName);
      } else if (index === -1) {
        strategy.preferredMethods.unshift(methodName);
      }
      
      // Remove from blacklist if it was there
      const blacklistIndex = strategy.blacklistedMethods.indexOf(methodName);
      if (blacklistIndex > -1) {
        strategy.blacklistedMethods.splice(blacklistIndex, 1);
      }
    }
    
    strategy.lastUpdated = new Date();
    
    // Check if method should be blacklisted
    const methodsToBlacklist = this.metrics.getMethodsToBlacklist(domain);
    for (const method of methodsToBlacklist) {
      if (!strategy.blacklistedMethods.includes(method)) {
        strategy.blacklistedMethods.push(method);
        logger.info(`Blacklisted method ${method} for domain ${domain}`);
      }
    }
  }

  /**
   * Loads domain strategies from storage
   */
  async loadDomainStrategies() {
    try {
      // In a real implementation, this would load from a database or file
      // For now, we'll start with empty strategies
      logger.debug('Domain strategies loaded (empty for now)');
    } catch (error) {
      logger.error('Failed to load domain strategies', { error: error.message });
    }
  }

  /**
   * Saves domain strategies to storage
   */
  async saveDomainStrategies() {
    try {
      // In a real implementation, this would save to a database or file
      const strategies = Object.fromEntries(this.domainStrategies.entries());
      logger.debug('Domain strategies saved', { count: Object.keys(strategies).length });
    } catch (error) {
      logger.error('Failed to save domain strategies', { error: error.message });
    }
  }

  /**
   * Checks rate limiting for a URL
   * @param {string} url - The URL to check
   * @returns {boolean} True if request is allowed
   */
  checkRateLimit(url) {
    const now = Date.now();
    const minute = Math.floor(now / 60000);
    const key = `${url}-${minute}`;
    
    const count = this.requestCounts.get(key) || 0;
    if (count >= 3) { // Max 3 requests per URL per minute
      return false;
    }
    
    this.requestCounts.set(key, count + 1);
    
    // Clean up old entries
    for (const [k, v] of this.requestCounts.entries()) {
      const keyMinute = parseInt(k.split('-').pop());
      if (minute - keyMinute > 5) { // Keep only last 5 minutes
        this.requestCounts.delete(k);
      }
    }
    
    return true;
  }

  /**
   * Processes multiple URLs from a message
   * @param {string[]} urls - Array of URLs to process
   * @returns {Promise<Array>} Array of bypass results
   */
  async processUrls(urls) {
    const results = [];
    
    for (const url of urls) {
      try {
        const result = await this.bypassPaywall(url);
        if (result.success) {
          results.push({
            originalUrl: url,
            ...result
          });
        }
      } catch (error) {
        logger.error(`Error processing URL ${url}`, { error: error.message });
      }
    }
    
    return results;
  }

  /**
   * Gets comprehensive service metrics
   * @returns {Object} Service metrics
   */
  getMetrics() {
    return {
      registry: this.registry.getMetrics(),
      bypass: this.metrics.getGlobalMetrics(),
      domainStrategies: this.domainStrategies.size,
      timestamp: new Date()
    };
  }

  /**
   * Gets health status of all components
   * @returns {Promise<Object>} Health status
   */
  async getHealthStatus() {
    const healthChecks = await this.registry.performHealthChecks();
    
    return {
      service: {
        initialized: this.initialized,
        registeredMethods: this.registry.getAllMethods().length,
        availableMethods: this.registry.getAvailableMethods().length
      },
      methods: healthChecks,
      timestamp: new Date()
    };
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    logger.info('Cleaning up SmartBypassService');
    
    await this.saveDomainStrategies();
    await this.registry.cleanup();
    
    this.requestCounts.clear();
    this.domainStrategies.clear();
    this.initialized = false;
    
    logger.info('SmartBypassService cleanup completed');
  }
}

module.exports = SmartBypassService;
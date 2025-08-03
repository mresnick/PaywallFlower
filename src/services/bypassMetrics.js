const logger = require('../utils/logger');
const { extractDomain } = require('../utils/urlExtractor');

/**
 * Service for tracking and analyzing bypass method performance
 * Stores metrics in memory with optional persistence to database
 */
class BypassMetrics {
  constructor() {
    this.metrics = new Map(); // domain -> method -> metrics
    this.globalMetrics = new Map(); // method -> global metrics
    this.recentAttempts = []; // Recent attempts for trend analysis
    this.maxRecentAttempts = 1000; // Keep last 1000 attempts
  }

  /**
   * Records a bypass attempt
   * @param {string} url - The URL that was attempted
   * @param {string} method - The bypass method used
   * @param {boolean} success - Whether the attempt was successful
   * @param {number} responseTime - Response time in milliseconds
   * @param {Object} metadata - Additional metadata
   */
  recordAttempt(url, method, success, responseTime, metadata = {}) {
    const domain = extractDomain(url);
    const timestamp = new Date();

    // Record domain-specific metrics
    if (!this.metrics.has(domain)) {
      this.metrics.set(domain, new Map());
    }

    const domainMetrics = this.metrics.get(domain);
    if (!domainMetrics.has(method)) {
      domainMetrics.set(method, this.createEmptyMetrics());
    }

    const methodMetrics = domainMetrics.get(method);
    this.updateMetrics(methodMetrics, success, responseTime, timestamp);

    // Record global metrics
    if (!this.globalMetrics.has(method)) {
      this.globalMetrics.set(method, this.createEmptyMetrics());
    }

    const globalMethodMetrics = this.globalMetrics.get(method);
    this.updateMetrics(globalMethodMetrics, success, responseTime, timestamp);

    // Add to recent attempts
    const attempt = {
      url,
      domain,
      method,
      success,
      responseTime,
      timestamp,
      ...metadata
    };

    this.recentAttempts.push(attempt);
    if (this.recentAttempts.length > this.maxRecentAttempts) {
      this.recentAttempts.shift();
    }

    logger.debug(`Recorded bypass attempt`, {
      domain,
      method,
      success,
      responseTime,
      successRate: this.getSuccessRate(domain, method)
    });
  }

  /**
   * Creates an empty metrics object
   * @returns {Object}
   */
  createEmptyMetrics() {
    return {
      totalAttempts: 0,
      successfulAttempts: 0,
      failedAttempts: 0,
      totalResponseTime: 0,
      averageResponseTime: 0,
      minResponseTime: Infinity,
      maxResponseTime: 0,
      lastAttempt: null,
      lastSuccess: null,
      consecutiveFailures: 0,
      recentSuccessRate: 0, // Success rate for last 20 attempts
      recentAttempts: [] // Keep last 20 attempts for trend analysis
    };
  }

  /**
   * Updates metrics with a new attempt
   * @param {Object} metrics - Metrics object to update
   * @param {boolean} success - Whether the attempt was successful
   * @param {number} responseTime - Response time in milliseconds
   * @param {Date} timestamp - Timestamp of the attempt
   */
  updateMetrics(metrics, success, responseTime, timestamp) {
    metrics.totalAttempts++;
    metrics.lastAttempt = timestamp;

    if (success) {
      metrics.successfulAttempts++;
      metrics.lastSuccess = timestamp;
      metrics.consecutiveFailures = 0;
    } else {
      metrics.failedAttempts++;
      metrics.consecutiveFailures++;
    }

    // Update response time metrics
    metrics.totalResponseTime += responseTime;
    metrics.averageResponseTime = metrics.totalResponseTime / metrics.totalAttempts;
    metrics.minResponseTime = Math.min(metrics.minResponseTime, responseTime);
    metrics.maxResponseTime = Math.max(metrics.maxResponseTime, responseTime);

    // Update recent attempts for trend analysis
    metrics.recentAttempts.push({ success, responseTime, timestamp });
    if (metrics.recentAttempts.length > 20) {
      metrics.recentAttempts.shift();
    }

    // Calculate recent success rate
    const recentSuccesses = metrics.recentAttempts.filter(a => a.success).length;
    metrics.recentSuccessRate = (recentSuccesses / metrics.recentAttempts.length) * 100;
  }

  /**
   * Gets success rate for a specific domain and method
   * @param {string} domain - Domain name
   * @param {string} method - Method name
   * @returns {number} Success rate as percentage (0-100)
   */
  getSuccessRate(domain, method) {
    const domainMetrics = this.metrics.get(domain);
    if (!domainMetrics || !domainMetrics.has(method)) {
      return 0;
    }

    const methodMetrics = domainMetrics.get(method);
    if (methodMetrics.totalAttempts === 0) {
      return 0;
    }

    return (methodMetrics.successfulAttempts / methodMetrics.totalAttempts) * 100;
  }

  /**
   * Gets global success rate for a method across all domains
   * @param {string} method - Method name
   * @returns {number} Success rate as percentage (0-100)
   */
  getGlobalSuccessRate(method) {
    const metrics = this.globalMetrics.get(method);
    if (!metrics || metrics.totalAttempts === 0) {
      return 0;
    }

    return (metrics.successfulAttempts / metrics.totalAttempts) * 100;
  }

  /**
   * Gets the best performing methods for a specific domain
   * @param {string} domain - Domain name
   * @param {number} minAttempts - Minimum attempts required for consideration
   * @returns {Array} Array of methods sorted by success rate
   */
  getBestMethodsForDomain(domain, minAttempts = 5) {
    const domainMetrics = this.metrics.get(domain);
    if (!domainMetrics) {
      return [];
    }

    const methods = [];
    for (const [method, metrics] of domainMetrics.entries()) {
      if (metrics.totalAttempts >= minAttempts) {
        methods.push({
          method,
          successRate: (metrics.successfulAttempts / metrics.totalAttempts) * 100,
          recentSuccessRate: metrics.recentSuccessRate,
          averageResponseTime: metrics.averageResponseTime,
          totalAttempts: metrics.totalAttempts,
          consecutiveFailures: metrics.consecutiveFailures,
          lastSuccess: metrics.lastSuccess
        });
      }
    }

    // Sort by recent success rate first, then overall success rate, then response time
    return methods.sort((a, b) => {
      if (Math.abs(a.recentSuccessRate - b.recentSuccessRate) > 10) {
        return b.recentSuccessRate - a.recentSuccessRate;
      }
      if (Math.abs(a.successRate - b.successRate) > 5) {
        return b.successRate - a.successRate;
      }
      return a.averageResponseTime - b.averageResponseTime;
    });
  }

  /**
   * Gets comprehensive metrics for a domain
   * @param {string} domain - Domain name
   * @returns {Object} Domain metrics
   */
  getDomainMetrics(domain) {
    const domainMetrics = this.metrics.get(domain);
    if (!domainMetrics) {
      return null;
    }

    const methods = {};
    let totalAttempts = 0;
    let totalSuccesses = 0;

    for (const [method, metrics] of domainMetrics.entries()) {
      methods[method] = {
        ...metrics,
        successRate: metrics.totalAttempts > 0 ? 
          (metrics.successfulAttempts / metrics.totalAttempts) * 100 : 0
      };
      totalAttempts += metrics.totalAttempts;
      totalSuccesses += metrics.successfulAttempts;
    }

    return {
      domain,
      totalAttempts,
      totalSuccesses,
      overallSuccessRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0,
      methods,
      bestMethods: this.getBestMethodsForDomain(domain)
    };
  }

  /**
   * Gets global metrics across all domains
   * @returns {Object} Global metrics
   */
  getGlobalMetrics() {
    const methods = {};
    let totalAttempts = 0;
    let totalSuccesses = 0;

    for (const [method, metrics] of this.globalMetrics.entries()) {
      methods[method] = {
        ...metrics,
        successRate: metrics.totalAttempts > 0 ? 
          (metrics.successfulAttempts / metrics.totalAttempts) * 100 : 0
      };
      totalAttempts += metrics.totalAttempts;
      totalSuccesses += metrics.successfulAttempts;
    }

    return {
      totalAttempts,
      totalSuccesses,
      overallSuccessRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0,
      methods,
      totalDomains: this.metrics.size,
      recentAttemptsCount: this.recentAttempts.length
    };
  }

  /**
   * Gets trending data for analysis
   * @param {number} hours - Number of hours to look back
   * @returns {Object} Trending data
   */
  getTrendingData(hours = 24) {
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000);
    const recentAttempts = this.recentAttempts.filter(a => a.timestamp > cutoffTime);

    const methodTrends = {};
    const domainTrends = {};

    recentAttempts.forEach(attempt => {
      // Method trends
      if (!methodTrends[attempt.method]) {
        methodTrends[attempt.method] = { attempts: 0, successes: 0, totalTime: 0 };
      }
      methodTrends[attempt.method].attempts++;
      if (attempt.success) methodTrends[attempt.method].successes++;
      methodTrends[attempt.method].totalTime += attempt.responseTime;

      // Domain trends
      if (!domainTrends[attempt.domain]) {
        domainTrends[attempt.domain] = { attempts: 0, successes: 0 };
      }
      domainTrends[attempt.domain].attempts++;
      if (attempt.success) domainTrends[attempt.domain].successes++;
    });

    // Calculate rates and averages
    Object.keys(methodTrends).forEach(method => {
      const trend = methodTrends[method];
      trend.successRate = (trend.successes / trend.attempts) * 100;
      trend.averageResponseTime = trend.totalTime / trend.attempts;
    });

    Object.keys(domainTrends).forEach(domain => {
      const trend = domainTrends[domain];
      trend.successRate = (trend.successes / trend.attempts) * 100;
    });

    return {
      timeRange: `${hours} hours`,
      totalAttempts: recentAttempts.length,
      methodTrends,
      domainTrends,
      timestamp: new Date()
    };
  }

  /**
   * Identifies methods that should be blacklisted for a domain
   * @param {string} domain - Domain name
   * @param {number} minAttempts - Minimum attempts before considering blacklist
   * @param {number} maxFailureRate - Maximum failure rate before blacklisting
   * @returns {string[]} Array of method names to blacklist
   */
  getMethodsToBlacklist(domain, minAttempts = 10, maxFailureRate = 90) {
    const domainMetrics = this.metrics.get(domain);
    if (!domainMetrics) {
      return [];
    }

    const blacklistCandidates = [];
    
    for (const [method, metrics] of domainMetrics.entries()) {
      if (metrics.totalAttempts >= minAttempts) {
        const failureRate = (metrics.failedAttempts / metrics.totalAttempts) * 100;
        const recentFailureRate = 100 - metrics.recentSuccessRate;
        
        // Blacklist if both overall and recent failure rates are high
        if (failureRate >= maxFailureRate && recentFailureRate >= maxFailureRate) {
          blacklistCandidates.push(method);
        }
      }
    }

    return blacklistCandidates;
  }

  /**
   * Clears metrics for a specific domain
   * @param {string} domain - Domain name
   */
  clearDomainMetrics(domain) {
    this.metrics.delete(domain);
    logger.info(`Cleared metrics for domain: ${domain}`);
  }

  /**
   * Clears all metrics
   */
  clearAllMetrics() {
    this.metrics.clear();
    this.globalMetrics.clear();
    this.recentAttempts = [];
    logger.info('Cleared all metrics');
  }

  /**
   * Exports metrics data for backup or analysis
   * @returns {Object} Serializable metrics data
   */
  exportMetrics() {
    return {
      domainMetrics: Object.fromEntries(
        Array.from(this.metrics.entries()).map(([domain, methods]) => [
          domain,
          Object.fromEntries(methods.entries())
        ])
      ),
      globalMetrics: Object.fromEntries(this.globalMetrics.entries()),
      recentAttempts: this.recentAttempts,
      exportTimestamp: new Date()
    };
  }

  /**
   * Imports metrics data from backup
   * @param {Object} data - Metrics data to import
   */
  importMetrics(data) {
    if (data.domainMetrics) {
      this.metrics.clear();
      Object.entries(data.domainMetrics).forEach(([domain, methods]) => {
        const domainMap = new Map();
        Object.entries(methods).forEach(([method, metrics]) => {
          domainMap.set(method, metrics);
        });
        this.metrics.set(domain, domainMap);
      });
    }

    if (data.globalMetrics) {
      this.globalMetrics.clear();
      Object.entries(data.globalMetrics).forEach(([method, metrics]) => {
        this.globalMetrics.set(method, metrics);
      });
    }

    if (data.recentAttempts) {
      this.recentAttempts = data.recentAttempts;
    }

    logger.info('Imported metrics data', {
      domains: this.metrics.size,
      methods: this.globalMetrics.size,
      recentAttempts: this.recentAttempts.length
    });
  }
}

module.exports = BypassMetrics;
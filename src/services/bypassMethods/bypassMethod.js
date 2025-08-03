const logger = require('../../utils/logger');

/**
 * Base class for all paywall bypass methods
 * Provides a standardized interface for implementing different bypass strategies
 */
class BypassMethod {
  constructor(name, config = {}) {
    this.name = name;
    this.config = {
      enabled: true,
      priority: 5, // 1-10, higher = more preferred
      timeout: 30000,
      maxRetries: 2,
      healthCheckInterval: 300000, // 5 minutes
      ...config
    };
    
    this.healthStatus = {
      healthy: true,
      lastCheck: null,
      consecutiveFailures: 0,
      lastError: null
    };
    
    this.metrics = {
      totalAttempts: 0,
      successfulAttempts: 0,
      averageResponseTime: 0,
      lastAttempt: null
    };
  }

  /**
   * Main method to attempt bypassing a paywall
   * Must be implemented by subclasses
   * @param {string} url - The URL to bypass
   * @param {Object} options - Additional options
   * @returns {Promise<BypassResult>}
   */
  async attempt(url, options = {}) {
    throw new Error(`Method 'attempt' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Performs a health check for this bypass method
   * Can be overridden by subclasses for custom health checks
   * @returns {Promise<HealthCheckResult>}
   */
  async healthCheck() {
    try {
      // Default health check - attempt to bypass a known test URL
      const testUrl = this.getTestUrl();
      if (!testUrl) {
        return { healthy: true, message: 'No test URL configured' };
      }

      const startTime = Date.now();
      const result = await this.attempt(testUrl, { isHealthCheck: true });
      const duration = Date.now() - startTime;

      this.healthStatus.lastCheck = new Date();
      this.healthStatus.consecutiveFailures = result.success ? 0 : this.healthStatus.consecutiveFailures + 1;
      this.healthStatus.healthy = this.healthStatus.consecutiveFailures < 3;

      return {
        healthy: this.healthStatus.healthy,
        responseTime: duration,
        message: result.success ? 'Health check passed' : `Health check failed: ${result.error}`
      };
    } catch (error) {
      this.healthStatus.lastCheck = new Date();
      this.healthStatus.consecutiveFailures++;
      this.healthStatus.healthy = this.healthStatus.consecutiveFailures < 3;
      this.healthStatus.lastError = error.message;

      logger.debug(`Health check failed for ${this.name}`, { error: error.message });
      
      return {
        healthy: false,
        error: error.message,
        message: `Health check error: ${error.message}`
      };
    }
  }

  /**
   * Gets a test URL for health checks
   * Should be overridden by subclasses
   * @returns {string|null}
   */
  getTestUrl() {
    return this.config.testUrl || null;
  }

  /**
   * Records metrics for an attempt
   * @param {boolean} success - Whether the attempt was successful
   * @param {number} responseTime - Response time in milliseconds
   * @param {Object} additionalMetrics - Additional metrics to record
   */
  recordMetrics(success, responseTime, additionalMetrics = {}) {
    this.metrics.totalAttempts++;
    if (success) {
      this.metrics.successfulAttempts++;
    }
    
    // Update average response time using exponential moving average
    const alpha = 0.1; // Smoothing factor
    if (this.metrics.averageResponseTime === 0) {
      this.metrics.averageResponseTime = responseTime;
    } else {
      this.metrics.averageResponseTime = 
        alpha * responseTime + (1 - alpha) * this.metrics.averageResponseTime;
    }
    
    this.metrics.lastAttempt = new Date();

    logger.debug(`Recorded metrics for ${this.name}`, {
      success,
      responseTime,
      successRate: this.getSuccessRate(),
      ...additionalMetrics
    });
  }

  /**
   * Gets the current success rate
   * @returns {number} Success rate as a percentage (0-100)
   */
  getSuccessRate() {
    if (this.metrics.totalAttempts === 0) return 0;
    return (this.metrics.successfulAttempts / this.metrics.totalAttempts) * 100;
  }

  /**
   * Gets comprehensive metrics for this method
   * @returns {Object} Metrics object
   */
  getMetrics() {
    return {
      name: this.name,
      enabled: this.config.enabled,
      priority: this.config.priority,
      healthStatus: this.healthStatus,
      metrics: {
        ...this.metrics,
        successRate: this.getSuccessRate()
      }
    };
  }

  /**
   * Checks if this method is currently available
   * @returns {boolean}
   */
  isAvailable() {
    return this.config.enabled && this.healthStatus.healthy;
  }

  /**
   * Updates the configuration for this method
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    logger.debug(`Updated config for ${this.name}`, { config: this.config });
  }

  /**
   * Validates a URL before attempting bypass
   * @param {string} url - URL to validate
   * @returns {boolean}
   */
  validateUrl(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Creates a standardized result object
   * @param {boolean} success - Whether the bypass was successful
   * @param {string|null} result - The bypass result (URL or content)
   * @param {string|null} error - Error message if failed
   * @param {Object} metadata - Additional metadata
   * @returns {BypassResult}
   */
  createResult(success, result = null, error = null, metadata = {}) {
    return {
      success,
      result,
      error,
      method: this.name,
      timestamp: new Date(),
      ...metadata
    };
  }

  /**
   * Cleanup method called when the method is being destroyed
   */
  async cleanup() {
    // Override in subclasses if cleanup is needed
    logger.debug(`Cleaning up ${this.name}`);
  }
}

module.exports = BypassMethod;
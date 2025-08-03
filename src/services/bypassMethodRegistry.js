const logger = require('../utils/logger');
const BypassMethod = require('./bypassMethods/bypassMethod');

/**
 * Registry for managing all bypass methods
 * Handles registration, discovery, and lifecycle management of bypass methods
 */
class BypassMethodRegistry {
  constructor() {
    this.methods = new Map();
    this.healthCheckInterval = null;
    this.healthCheckIntervalMs = 300000; // 5 minutes
  }

  /**
   * Registers a bypass method
   * @param {BypassMethod} method - The bypass method to register
   */
  register(method) {
    if (!(method instanceof BypassMethod)) {
      throw new Error('Method must extend BypassMethod class');
    }

    if (this.methods.has(method.name)) {
      logger.warn(`Method ${method.name} is already registered, replacing`);
    }

    this.methods.set(method.name, method);
    logger.info(`Registered bypass method: ${method.name}`, {
      priority: method.config.priority,
      enabled: method.config.enabled
    });
  }

  /**
   * Unregisters a bypass method
   * @param {string} name - Name of the method to unregister
   */
  async unregister(name) {
    const method = this.methods.get(name);
    if (method) {
      await method.cleanup();
      this.methods.delete(name);
      logger.info(`Unregistered bypass method: ${name}`);
    }
  }

  /**
   * Gets a specific bypass method by name
   * @param {string} name - Name of the method
   * @returns {BypassMethod|null}
   */
  getMethod(name) {
    return this.methods.get(name) || null;
  }

  /**
   * Gets all registered methods
   * @returns {BypassMethod[]}
   */
  getAllMethods() {
    return Array.from(this.methods.values());
  }

  /**
   * Gets all available (enabled and healthy) methods
   * @returns {BypassMethod[]}
   */
  getAvailableMethods() {
    return this.getAllMethods().filter(method => method.isAvailable());
  }

  /**
   * Gets methods sorted by priority (highest first)
   * @param {boolean} onlyAvailable - Whether to only return available methods
   * @returns {BypassMethod[]}
   */
  getMethodsByPriority(onlyAvailable = true) {
    const methods = onlyAvailable ? this.getAvailableMethods() : this.getAllMethods();
    return methods.sort((a, b) => b.config.priority - a.config.priority);
  }

  /**
   * Gets methods filtered by a custom predicate
   * @param {Function} predicate - Filter function
   * @returns {BypassMethod[]}
   */
  getMethodsWhere(predicate) {
    return this.getAllMethods().filter(predicate);
  }

  /**
   * Updates configuration for a specific method
   * @param {string} name - Method name
   * @param {Object} config - New configuration
   */
  updateMethodConfig(name, config) {
    const method = this.getMethod(name);
    if (method) {
      method.updateConfig(config);
      logger.info(`Updated config for method: ${name}`, { config });
    } else {
      logger.warn(`Attempted to update config for unknown method: ${name}`);
    }
  }

  /**
   * Updates configuration for multiple methods
   * @param {Object} configs - Object with method names as keys and configs as values
   */
  updateMethodConfigs(configs) {
    Object.entries(configs).forEach(([name, config]) => {
      this.updateMethodConfig(name, config);
    });
  }

  /**
   * Enables or disables a method
   * @param {string} name - Method name
   * @param {boolean} enabled - Whether to enable the method
   */
  setMethodEnabled(name, enabled) {
    this.updateMethodConfig(name, { enabled });
  }

  /**
   * Sets the priority for a method
   * @param {string} name - Method name
   * @param {number} priority - New priority (1-10)
   */
  setMethodPriority(name, priority) {
    if (priority < 1 || priority > 10) {
      throw new Error('Priority must be between 1 and 10');
    }
    this.updateMethodConfig(name, { priority });
  }

  /**
   * Performs health checks on all registered methods
   * @returns {Promise<Object>} Health check results
   */
  async performHealthChecks() {
    const results = {};
    const methods = this.getAllMethods();

    logger.debug(`Performing health checks on ${methods.length} methods`);

    const healthCheckPromises = methods.map(async (method) => {
      try {
        const result = await method.healthCheck();
        results[method.name] = result;
        return { method: method.name, ...result };
      } catch (error) {
        const errorResult = {
          healthy: false,
          error: error.message,
          message: `Health check failed: ${error.message}`
        };
        results[method.name] = errorResult;
        return { method: method.name, ...errorResult };
      }
    });

    await Promise.all(healthCheckPromises);

    const healthyCount = Object.values(results).filter(r => r.healthy).length;
    const totalCount = methods.length;

    logger.info(`Health checks completed: ${healthyCount}/${totalCount} methods healthy`);

    return {
      timestamp: new Date(),
      totalMethods: totalCount,
      healthyMethods: healthyCount,
      results
    };
  }

  /**
   * Starts periodic health checks
   * @param {number} intervalMs - Interval in milliseconds (optional)
   */
  startHealthChecks(intervalMs = this.healthCheckIntervalMs) {
    if (this.healthCheckInterval) {
      this.stopHealthChecks();
    }

    this.healthCheckIntervalMs = intervalMs;
    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.performHealthChecks();
      } catch (error) {
        logger.error('Error during periodic health checks', { error: error.message });
      }
    }, intervalMs);

    // Ensure the interval doesn't keep the process alive
    if (this.healthCheckInterval.unref) {
      this.healthCheckInterval.unref();
    }

    logger.info(`Started periodic health checks every ${intervalMs}ms`);
  }

  /**
   * Stops periodic health checks
   */
  stopHealthChecks() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      logger.info('Stopped periodic health checks');
    }
  }

  /**
   * Gets comprehensive metrics for all methods
   * @returns {Object} Metrics summary
   */
  getMetrics() {
    const methods = this.getAllMethods();
    const methodMetrics = methods.map(method => method.getMetrics());

    const summary = {
      totalMethods: methods.length,
      enabledMethods: methods.filter(m => m.config.enabled).length,
      healthyMethods: methods.filter(m => m.healthStatus.healthy).length,
      averageSuccessRate: 0,
      totalAttempts: 0,
      totalSuccesses: 0
    };

    // Calculate aggregate metrics
    let totalAttempts = 0;
    let totalSuccesses = 0;
    let totalResponseTime = 0;
    let methodsWithAttempts = 0;

    methodMetrics.forEach(metric => {
      totalAttempts += metric.metrics.totalAttempts;
      totalSuccesses += metric.metrics.successfulAttempts;
      
      if (metric.metrics.totalAttempts > 0) {
        totalResponseTime += metric.metrics.averageResponseTime;
        methodsWithAttempts++;
      }
    });

    summary.totalAttempts = totalAttempts;
    summary.totalSuccesses = totalSuccesses;
    summary.averageSuccessRate = totalAttempts > 0 ? (totalSuccesses / totalAttempts) * 100 : 0;
    summary.averageResponseTime = methodsWithAttempts > 0 ? totalResponseTime / methodsWithAttempts : 0;

    return {
      summary,
      methods: methodMetrics,
      timestamp: new Date()
    };
  }

  /**
   * Resets metrics for all methods
   */
  resetMetrics() {
    this.getAllMethods().forEach(method => {
      method.metrics = {
        totalAttempts: 0,
        successfulAttempts: 0,
        averageResponseTime: 0,
        lastAttempt: null
      };
    });
    logger.info('Reset metrics for all methods');
  }

  /**
   * Auto-discovers and registers bypass methods from the bypassMethods directory
   * @param {string} methodsDir - Directory containing method files
   */
  async autoRegisterMethods(methodsDir = './bypassMethods') {
    try {
      const fs = require('fs').promises;
      const path = require('path');
      
      const methodsPath = path.resolve(__dirname, methodsDir);
      const files = await fs.readdir(methodsPath);
      
      const methodFiles = files.filter(file => 
        file.endsWith('.js') && 
        file !== 'BypassMethod.js' && 
        !file.endsWith('.test.js')
      );

      logger.info(`Auto-registering ${methodFiles.length} bypass methods`);

      for (const file of methodFiles) {
        try {
          const MethodClass = require(path.join(methodsPath, file));
          
          // Skip if not a constructor function
          if (typeof MethodClass !== 'function') continue;
          
          const method = new MethodClass();
          this.register(method);
        } catch (error) {
          logger.error(`Failed to auto-register method from ${file}`, { error: error.message });
        }
      }
    } catch (error) {
      logger.error('Failed to auto-register methods', { error: error.message });
    }
  }

  /**
   * Cleanup method - stops health checks and cleans up all methods
   */
  async cleanup() {
    this.stopHealthChecks();
    
    const cleanupPromises = this.getAllMethods().map(method => method.cleanup());
    await Promise.all(cleanupPromises);
    
    this.methods.clear();
    logger.info('Registry cleanup completed');
  }
}

module.exports = BypassMethodRegistry;
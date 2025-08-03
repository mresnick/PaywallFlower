const BypassMethod = require('./bypassMethod');
const ArchiveService = require('../archiveService');
const logger = require('../../utils/logger');

/**
 * Wayback Machine (archive.org) bypass method
 * Wraps the existing ArchiveService for Wayback Machine functionality
 */
class WaybackMethod extends BypassMethod {
  constructor(config = {}) {
    super('wayback_machine', {
      priority: 4, // Lower priority due to reliability issues
      timeout: 15000,
      testUrl: 'https://www.example.com',
      ...config
    });
    
    this.archiveService = new ArchiveService();
  }

  /**
   * Attempts to bypass paywall using Wayback Machine
   * @param {string} url - The URL to bypass
   * @param {Object} options - Additional options
   * @returns {Promise<BypassResult>}
   */
  async attempt(url, options = {}) {
    if (!this.validateUrl(url)) {
      return this.createResult(false, null, 'Invalid URL provided');
    }

    const startTime = Date.now();
    
    try {
      logger.debug(`Attempting Wayback Machine bypass for: ${url}`);

      const archiveUrl = await this.archiveService.tryWaybackMachine(url);
      const responseTime = Date.now() - startTime;

      if (archiveUrl && typeof archiveUrl === 'string' && archiveUrl.length > 0) {
        // Validate that the archive URL is actually from archive.org
        if (archiveUrl.includes('web.archive.org') || archiveUrl.includes('archive.org')) {
          this.recordMetrics(true, responseTime, { 
            archiveUrl,
            method: 'wayback_machine'
          });

          return this.createResult(true, archiveUrl, null, {
            responseTime,
            archiveUrl,
            method: 'archive_redirect'
          });
        } else {
          const error = 'Invalid Wayback Machine URL returned';
          this.recordMetrics(false, responseTime, { error, returnedUrl: archiveUrl });
          return this.createResult(false, null, error);
        }
      } else {
        const error = 'No archive found on Wayback Machine';
        this.recordMetrics(false, responseTime, { error });
        return this.createResult(false, null, error);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordMetrics(false, responseTime, { error: error.message });
      
      logger.debug(`Wayback Machine bypass failed for ${url}`, {
        error: error.message,
        responseTime
      });

      return this.createResult(false, null, `Wayback Machine error: ${error.message}`);
    }
  }

  /**
   * Performs health check using Wayback Machine API
   * @returns {Promise<HealthCheckResult>}
   */
  async healthCheck() {
    try {
      const testUrl = 'https://www.wikipedia.org';
      const startTime = Date.now();
      
      // Use the Wayback Machine availability API
      const apiUrl = `https://archive.org/wayback/available?url=${testUrl}`;
      const axios = require('axios');
      
      const response = await axios.get(apiUrl, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      const responseTime = Date.now() - startTime;
      
      // Check if the API is working and returns valid data
      const isHealthy = response.status === 200 && 
                       response.data && 
                       typeof response.data === 'object';
      
      let message = 'Wayback Machine API is responding normally';
      if (!isHealthy) {
        message = `Wayback Machine API returned unexpected response: ${response.status}`;
      } else if (!response.data.archived_snapshots) {
        message = 'Wayback Machine API is responding but may have limited functionality';
      }
      
      return {
        healthy: isHealthy,
        responseTime,
        message,
        hasSnapshots: !!response.data?.archived_snapshots?.closest
      };
      
    } catch (error) {
      // Check if it's a timeout or network error (common with archive.org)
      const isNetworkError = error.code === 'ECONNABORTED' || 
                            error.code === 'ENOTFOUND' || 
                            error.code === 'ECONNRESET';
      
      return {
        healthy: false,
        error: error.message,
        message: `Wayback Machine health check failed: ${error.message}`,
        networkError: isNetworkError
      };
    }
  }

  /**
   * Gets test URL for this method
   * @returns {string}
   */
  getTestUrl() {
    return this.config.testUrl;
  }

  /**
   * Override to provide domain-specific reliability information
   * @param {string} domain - Domain to check
   * @returns {Object} Reliability information
   */
  getDomainReliability(domain) {
    // Known domains where Wayback Machine has issues
    const problematicDomains = [
      'nytimes.com',
      'wsj.com',
      'ft.com',
      'economist.com',
      'bloomberg.com'
    ];

    const isProblematic = problematicDomains.includes(domain.toLowerCase());
    
    return {
      reliable: !isProblematic,
      reason: isProblematic ? 
        'This domain is known to have limited availability on Wayback Machine' : 
        'Domain should work normally with Wayback Machine',
      recommendedPriority: isProblematic ? 2 : 4
    };
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    // Archive service doesn't need cleanup
    await super.cleanup();
  }
}

module.exports = WaybackMethod;
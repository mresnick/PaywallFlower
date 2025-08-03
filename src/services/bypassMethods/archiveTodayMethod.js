const BypassMethod = require('./bypassMethod');
const ArchiveService = require('../archiveService');
const logger = require('../../utils/logger');

/**
 * Archive.today bypass method
 * Wraps the existing ArchiveService for archive.today functionality
 */
class ArchiveTodayMethod extends BypassMethod {
  constructor(config = {}) {
    super('archive_today', {
      priority: 9,
      timeout: 10000,
      testUrl: 'https://www.example.com',
      ...config
    });
    
    this.archiveService = new ArchiveService();
  }

  /**
   * Attempts to bypass paywall using Archive.today
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
      logger.debug(`Attempting Archive.today bypass for: ${url}`);

      const archiveUrl = await this.archiveService.tryArchiveToday(url);
      const responseTime = Date.now() - startTime;

      if (archiveUrl && typeof archiveUrl === 'string' && archiveUrl.length > 0) {
        // Validate that the archive URL is actually from archive.today/archive.ph
        if (archiveUrl.includes('archive.today') || archiveUrl.includes('archive.ph')) {
          this.recordMetrics(true, responseTime, { 
            archiveUrl,
            method: 'archive_today'
          });

          return this.createResult(true, archiveUrl, null, {
            responseTime,
            archiveUrl,
            method: 'archive_redirect'
          });
        } else {
          const error = 'Invalid archive URL returned';
          this.recordMetrics(false, responseTime, { error, returnedUrl: archiveUrl });
          return this.createResult(false, null, error);
        }
      } else {
        const error = 'No archive found on Archive.today';
        this.recordMetrics(false, responseTime, { error });
        return this.createResult(false, null, error);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordMetrics(false, responseTime, { error: error.message });
      
      logger.debug(`Archive.today bypass failed for ${url}`, {
        error: error.message,
        responseTime
      });

      return this.createResult(false, null, `Archive.today error: ${error.message}`);
    }
  }

  /**
   * Performs health check using Archive.today
   * @returns {Promise<HealthCheckResult>}
   */
  async healthCheck() {
    try {
      const testUrl = 'https://httpbin.org/html';
      const startTime = Date.now();
      
      // Try to search for an existing archive (not create a new one)
      const searchUrl = `https://archive.today/newest/${testUrl}`;
      const axios = require('axios');
      
      const response = await axios.get(searchUrl, {
        timeout: 8000,
        maxRedirects: 3,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;
      const isHealthy = response.status === 200;
      
      return {
        healthy: isHealthy,
        responseTime,
        message: isHealthy ? 'Archive.today is responding normally' : `Archive.today returned status ${response.status}`
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        message: `Archive.today health check failed: ${error.message}`
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
   * Cleanup method
   */
  async cleanup() {
    // Archive service doesn't need cleanup
    await super.cleanup();
  }
}

module.exports = ArchiveTodayMethod;
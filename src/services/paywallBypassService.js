const PaywallDetectorService = require('./paywallDetector');
const ArchiveService = require('./archiveService');
const BrowserService = require('./browserService');
const logger = require('../utils/logger');
const { normalizeUrl } = require('../utils/urlExtractor');

class PaywallBypassService {
  constructor() {
    this.paywallDetector = new PaywallDetectorService();
    this.archiveService = new ArchiveService();
    this.browserService = new BrowserService();
    this.requestCounts = new Map(); // For rate limiting
  }

  /**
   * Attempts to bypass paywall for a given URL using fallback chain
   * @param {string} url - The URL to bypass
   * @returns {Promise<{success: boolean, result?: string, method?: string, error?: string}>}
   */
  async bypassPaywall(url) {
    const normalizedUrl = normalizeUrl(url);
    
    try {
      logger.info(`Starting paywall bypass for: ${normalizedUrl}`);

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

      // Try archive services first
      logger.info(`Attempting archive services`);
      const archiveStartTime = Date.now();
      
      try {
        const archiveResult = await this.archiveService.findArchive(normalizedUrl);
        const archiveDuration = Date.now() - archiveStartTime;
        
        if (archiveResult && typeof archiveResult === 'string' && archiveResult.length > 0) {
          logger.info(`Archive services found result in ${archiveDuration}ms`, {
            archiveUrl: archiveResult
          });
          return {
            success: true,
            result: archiveResult,
            method: 'archive'
          };
        }
        logger.debug(`Archive services failed after ${archiveDuration}ms, trying browser`);
      } catch (error) {
        const archiveDuration = Date.now() - archiveStartTime;
        logger.error(`Archive services failed after ${archiveDuration}ms`, {
          error: error.message
        });
      }

      // If archive services fail, try headless browser
      logger.info(`Attempting browser extraction`);
      const browserStartTime = Date.now();
      
      try {
        const browserResult = await this.browserService.extractContent(normalizedUrl);
        const browserDuration = Date.now() - browserStartTime;
        
        if (browserResult && browserResult.success) {
          logger.info(`Browser extraction completed in ${browserDuration}ms`, {
            titleLength: browserResult.title?.length || 0,
            contentLength: browserResult.content?.length || 0
          });

          // Format the extracted content for Discord
          const formattedContent = this.formatExtractedContent(
            browserResult.title,
            browserResult.content,
            normalizedUrl
          );

          return {
            success: true,
            result: formattedContent,
            method: 'browser'
          };
        }
        logger.debug(`Browser extraction failed after ${browserDuration}ms`);
      } catch (error) {
        const browserDuration = Date.now() - browserStartTime;
        logger.error(`Browser extraction failed after ${browserDuration}ms`, {
          error: error.message
        });
      }

      // All methods failed
      const totalDuration = Date.now() - archiveStartTime;
      logger.warn(`All bypass methods failed after ${totalDuration}ms`);
      return {
        success: false,
        error: 'All bypass methods failed'
      };

    } catch (error) {
      logger.error(`Paywall bypass failed`, {
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
   * Formats extracted content for Discord message
   * @param {string} title - Article title
   * @param {string} content - Article content
   * @param {string} originalUrl - Original URL
   * @returns {string} Formatted content
   */
  formatExtractedContent(title, content, originalUrl) {
    // Discord has a 2000 character limit for messages
    const maxLength = 1800; // Leave room for formatting
    
    let formattedContent = `**${title}**\n\n`;
    
    // Truncate content if too long
    let articleContent = content;
    if (articleContent.length > maxLength - formattedContent.length - 100) {
      articleContent = articleContent.substring(0, maxLength - formattedContent.length - 100) + '...';
    }
    
    formattedContent += articleContent;
    formattedContent += `\n\n*Original URL: ${originalUrl}*`;
    formattedContent += `\n*Content extracted via PaywallFlower*`;
    
    return formattedContent;
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
   * Cleanup method
   */
  async cleanup() {
    await this.browserService.cleanup();
  }
}

module.exports = PaywallBypassService;
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
      logger.info(`[BYPASS] ========== Starting paywall bypass for: ${normalizedUrl} ==========`);
      logger.debug(`[BYPASS] Original URL: ${url}`);
      logger.debug(`[BYPASS] Normalized URL: ${normalizedUrl}`);

      // Check if URL is paywalled
      logger.debug(`[BYPASS] Step 1: Checking if URL is paywalled...`);
      const isPaywalled = await this.paywallDetector.isPaywalled(normalizedUrl);
      logger.debug(`[BYPASS] Paywall detection result: ${isPaywalled}`);
      
      if (!isPaywalled) {
        logger.info(`[BYPASS] ✗ URL ${normalizedUrl} is not paywalled, skipping bypass`);
        return { success: false, error: 'URL is not paywalled' };
      }

      // Check rate limiting
      logger.debug(`[BYPASS] Step 2: Checking rate limits...`);
      if (!this.checkRateLimit(normalizedUrl)) {
        logger.warn(`[BYPASS] ✗ Rate limit exceeded for ${normalizedUrl}`);
        return { success: false, error: 'Rate limit exceeded' };
      }
      logger.debug(`[BYPASS] Rate limit check passed`);

      // Try archive services first
      logger.info(`[BYPASS] Step 3: Attempting archive services for ${normalizedUrl}`);
      const archiveStartTime = Date.now();
      
      try {
        const archiveResult = await this.archiveService.findArchive(normalizedUrl);
        const archiveDuration = Date.now() - archiveStartTime;
        
        logger.debug(`[BYPASS] Archive service returned: ${archiveResult} (type: ${typeof archiveResult})`);
        
        if (archiveResult && typeof archiveResult === 'string' && archiveResult.length > 0) {
          logger.info(`[BYPASS] ✓ SUCCESS: Archive services found result in ${archiveDuration}ms - STOPPING HERE, NOT TRYING BROWSER`, {
            url: normalizedUrl,
            archiveUrl: archiveResult,
            duration: archiveDuration
          });
          return {
            success: true,
            result: archiveResult,
            method: 'archive'
          };
        }
        logger.warn(`[BYPASS] ✗ Archive services returned invalid result (${archiveResult}) after ${archiveDuration}ms, trying headless browser`);
      } catch (error) {
        const archiveDuration = Date.now() - archiveStartTime;
        logger.error(`[BYPASS] ✗ Archive services threw exception after ${archiveDuration}ms`, {
          error: error.message,
          url: normalizedUrl
        });
      }

      // If archive services fail, try headless browser
      logger.info(`[BYPASS] Step 4: Attempting headless browser for ${normalizedUrl}`);
      const browserStartTime = Date.now();
      
      try {
        const browserResult = await this.browserService.extractContent(normalizedUrl);
        const browserDuration = Date.now() - browserStartTime;
        
        if (browserResult && browserResult.success) {
          logger.info(`[BYPASS] ✓ SUCCESS: Browser extraction completed in ${browserDuration}ms`, {
            url: normalizedUrl,
            titleLength: browserResult.title?.length || 0,
            contentLength: browserResult.content?.length || 0,
            duration: browserDuration
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
        logger.warn(`[BYPASS] ✗ Browser extraction failed after ${browserDuration}ms - result: ${JSON.stringify(browserResult)}`);
      } catch (error) {
        const browserDuration = Date.now() - browserStartTime;
        logger.error(`[BYPASS] ✗ Browser extraction threw exception after ${browserDuration}ms`, {
          error: error.message,
          url: normalizedUrl
        });
      }

      // All methods failed
      const totalDuration = Date.now() - archiveStartTime;
      logger.error(`[BYPASS] ========== COMPLETE FAILURE: All bypass methods failed for ${normalizedUrl} after ${totalDuration}ms ==========`);
      return {
        success: false,
        error: 'All bypass methods failed'
      };

    } catch (error) {
      logger.error(`[BYPASS] ✗ Exception occurred during paywall bypass for ${normalizedUrl}`, {
        error: error.message,
        stack: error.stack,
        url: normalizedUrl,
        originalUrl: url
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
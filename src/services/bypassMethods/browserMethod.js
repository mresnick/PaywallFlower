const BypassMethod = require('./bypassMethod');
const BrowserService = require('../browserService');
const logger = require('../../utils/logger');

/**
 * Browser extraction bypass method
 * Wraps the existing BrowserService for headless browser content extraction
 */
class BrowserMethod extends BypassMethod {
  constructor(config = {}) {
    super('browser_extraction', {
      priority: 3, // Lower priority as it's resource intensive
      timeout: 30000,
      testUrl: 'https://www.example.com',
      ...config
    });
    
    this.browserService = new BrowserService();
  }

  /**
   * Attempts to bypass paywall using browser extraction
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
      logger.debug(`Attempting browser extraction bypass for: ${url}`);

      const extractionResult = await this.browserService.extractContent(url);
      const responseTime = Date.now() - startTime;

      if (extractionResult && extractionResult.success) {
        // Validate the extracted content
        const validation = this.validateExtractedContent(extractionResult, url);
        if (!validation.isValid) {
          this.recordMetrics(false, responseTime, { 
            error: validation.reason,
            contentLength: extractionResult.content?.length || 0
          });
          return this.createResult(false, null, validation.reason);
        }

        // Format the content for Discord
        const formattedContent = this.formatExtractedContent(
          extractionResult.title,
          extractionResult.content,
          url
        );

        this.recordMetrics(true, responseTime, { 
          contentLength: extractionResult.content.length,
          titleLength: extractionResult.title?.length || 0,
          method: 'browser_extraction'
        });

        return this.createResult(true, formattedContent, null, {
          responseTime,
          extractedTitle: extractionResult.title,
          extractedContentLength: extractionResult.content.length,
          method: 'browser_content'
        });

      } else {
        const error = extractionResult?.error || 'Browser extraction failed';
        this.recordMetrics(false, responseTime, { error });
        return this.createResult(false, null, error);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordMetrics(false, responseTime, { error: error.message });
      
      logger.debug(`Browser extraction bypass failed for ${url}`, {
        error: error.message,
        responseTime
      });

      return this.createResult(false, null, `Browser extraction error: ${error.message}`);
    }
  }

  /**
   * Validates extracted content quality
   * @param {Object} extractionResult - Result from browser service
   * @param {string} originalUrl - Original URL
   * @returns {Object} Validation result
   */
  validateExtractedContent(extractionResult, originalUrl) {
    if (!extractionResult.content || extractionResult.content.length < 100) {
      return { isValid: false, reason: 'Extracted content too short' };
    }

    if (!extractionResult.title || extractionResult.title.length < 5) {
      return { isValid: false, reason: 'No valid title extracted' };
    }

    // Check for common extraction failures
    const failureIndicators = [
      /var dd=\{.*'rt':'c'/i,  // CAPTCHA pattern
      /captcha/i,
      /cloudflare/i,
      /access.*denied/i,
      /403.*forbidden/i,
      /bot.*detect/i,
      /security.*check/i
    ];

    for (const pattern of failureIndicators) {
      if (pattern.test(extractionResult.content)) {
        return { isValid: false, reason: 'Content extraction blocked or failed' };
      }
    }

    // Check for paywall content that wasn't bypassed
    const paywallIndicators = [
      /subscribe.*to.*continue/i,
      /premium.*content.*subscribe/i,
      /subscription.*required/i,
      /sign.*up.*to.*read/i,
      /become.*a.*member/i
    ];

    const paywallMatches = paywallIndicators.filter(pattern => 
      pattern.test(extractionResult.content)
    ).length;

    // If more than 2 paywall indicators and content is short, likely failed
    if (paywallMatches > 2 && extractionResult.content.length < 500) {
      return { isValid: false, reason: 'Paywall content not successfully bypassed' };
    }

    return { isValid: true, reason: 'Content appears valid' };
  }

  /**
   * Formats extracted content for Discord message
   * @param {string} title - Article title
   * @param {string} content - Article content
   * @param {string} originalUrl - Original URL
   * @returns {string} Formatted content
   */
  formatExtractedContent(title, content, originalUrl) {
    // Clean and prepare content
    const cleanTitle = this.cleanText(title);
    const cleanContent = this.cleanText(content);
    
    // Truncate content if too long for Discord
    let truncatedContent = cleanContent;
    const maxLength = 1800; // Leave room for title and footer
    
    if (cleanContent.length > maxLength) {
      truncatedContent = cleanContent.substring(0, maxLength);
      // Try to cut at a sentence boundary
      const lastSentence = truncatedContent.lastIndexOf('.');
      if (lastSentence > maxLength * 0.8) {
        truncatedContent = truncatedContent.substring(0, lastSentence + 1);
      }
      truncatedContent += '\n\n*[Content truncated for length]*';
    }
    
    // Format content with proper structure
    let formattedContent = `**${cleanTitle}**\n\n`;
    formattedContent += truncatedContent;
    formattedContent += `\n\n*Original URL: ${originalUrl}*`;
    formattedContent += `\n*Content extracted via PaywallFlower*`;
    
    return formattedContent;
  }

  /**
   * Cleans text content by removing excessive whitespace and formatting issues
   * @param {string} text - Text to clean
   * @returns {string} Cleaned text
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      // Remove excessive whitespace
      .replace(/\s+/g, ' ')
      // Remove multiple consecutive newlines
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      // Trim whitespace
      .trim()
      // Remove any Discord markdown that might interfere
      .replace(/\|\|/g, '')
      // Clean up common formatting issues
      .replace(/\*\*\s*\*\*/g, '')
      .replace(/\*\s*\*/g, '');
  }

  /**
   * Performs health check using browser service
   * @returns {Promise<HealthCheckResult>}
   */
  async healthCheck() {
    try {
      const testUrl = 'https://httpbin.org/html';
      const startTime = Date.now();
      
      const result = await this.browserService.extractContent(testUrl);
      const responseTime = Date.now() - startTime;
      
      const isHealthy = result && result.success && 
                       result.content && result.content.length > 100;
      
      return {
        healthy: isHealthy,
        responseTime,
        message: isHealthy ? 
          'Browser service is working normally' : 
          `Browser service issue: ${result?.error || 'Unknown error'}`,
        contentLength: result?.content?.length || 0
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        message: `Browser service health check failed: ${error.message}`
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
   * Checks if this method should be used based on resource availability
   * @returns {boolean}
   */
  isAvailable() {
    // Check base availability first
    if (!super.isAvailable()) {
      return false;
    }

    // Check if browser service has capacity
    if (this.browserService.activeSessions >= this.browserService.maxConcurrent) {
      return false;
    }

    return true;
  }

  /**
   * Gets resource usage information
   * @returns {Object}
   */
  getResourceUsage() {
    return {
      activeSessions: this.browserService.activeSessions,
      maxConcurrent: this.browserService.maxConcurrent,
      utilizationPercent: (this.browserService.activeSessions / this.browserService.maxConcurrent) * 100
    };
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    await this.browserService.cleanup();
    await super.cleanup();
  }
}

module.exports = BrowserMethod;
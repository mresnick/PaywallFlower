const axios = require('axios');
const BypassMethod = require('./bypassMethod');
const logger = require('../../utils/logger');

/**
 * Google Cache bypass method
 * Uses Google's cached version of pages to bypass paywalls
 */
class GoogleCacheMethod extends BypassMethod {
  constructor(config = {}) {
    super('google_cache', {
      priority: 6,
      timeout: 15000,
      testUrl: 'https://www.example.com',
      ...config
    });
    
    this.cacheUrl = 'https://webcache.googleusercontent.com/search?q=cache:';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }

  /**
   * Attempts to bypass paywall using Google Cache
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
      logger.debug(`Attempting Google Cache bypass for: ${url}`);

      // Construct Google Cache URL
      const cacheUrl = `${this.cacheUrl}${encodeURIComponent(url)}`;
      
      const response = await axios.get(cacheUrl, {
        timeout: this.config.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 200) {
        const content = response.data;
        
        // Check if Google Cache found the page
        if (this.isNotCached(content)) {
          const error = 'Page not found in Google Cache';
          this.recordMetrics(false, responseTime, { error, status: response.status });
          return this.createResult(false, null, error);
        }

        // Check for Google Cache error messages
        if (this.containsErrorMessages(content)) {
          const error = this.extractErrorMessage(content);
          this.recordMetrics(false, responseTime, { error, status: response.status });
          return this.createResult(false, null, error);
        }

        // Validate that we got actual article content
        const validation = this.validateContent(content, url);
        if (!validation.isValid) {
          this.recordMetrics(false, responseTime, { 
            error: validation.reason, 
            status: response.status 
          });
          return this.createResult(false, null, validation.reason);
        }

        // Extract clean content from Google Cache
        const extractedContent = this.extractContent(content, url);
        
        this.recordMetrics(true, responseTime, { 
          contentLength: extractedContent.length,
          status: response.status 
        });

        return this.createResult(true, cacheUrl, null, {
          extractedContent,
          responseTime,
          method: 'google_cache_redirect'
        });

      } else if (response.status === 404) {
        const error = 'Page not found in Google Cache';
        this.recordMetrics(false, responseTime, { status: response.status });
        return this.createResult(false, null, error);
        
      } else {
        const error = `Google Cache returned status ${response.status}`;
        this.recordMetrics(false, responseTime, { status: response.status });
        return this.createResult(false, null, error);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordMetrics(false, responseTime, { error: error.message });
      
      logger.debug(`Google Cache bypass failed for ${url}`, {
        error: error.message,
        responseTime
      });

      return this.createResult(false, null, `Google Cache error: ${error.message}`);
    }
  }

  /**
   * Checks if the page is not cached by Google
   * @param {string} content - HTML content
   * @returns {boolean}
   */
  isNotCached(content) {
    const notCachedIndicators = [
      /no information available/i,
      /page not found/i,
      /404 not found/i,
      /the requested url was not found/i,
      /google does not have a copy/i,
      /not in google's cache/i
    ];

    return notCachedIndicators.some(pattern => pattern.test(content));
  }

  /**
   * Checks if the response contains error messages from Google Cache
   * @param {string} content - HTML content
   * @returns {boolean}
   */
  containsErrorMessages(content) {
    const errorPatterns = [
      /error occurred/i,
      /temporarily unavailable/i,
      /service error/i,
      /blocked/i,
      /forbidden/i,
      /access denied/i,
      /rate limit/i,
      /captcha/i,
      /unusual traffic/i
    ];

    return errorPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Extracts error message from Google Cache response
   * @param {string} content - HTML content
   * @returns {string}
   */
  extractErrorMessage(content) {
    // Try to extract specific error message
    const errorSelectors = [
      /<div[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/div>/i,
      /<p[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/p>/i,
      /<div[^>]*id="[^"]*error[^"]*"[^>]*>(.*?)<\/div>/i
    ];

    for (const selector of errorSelectors) {
      const match = content.match(selector);
      if (match) {
        return match[1].replace(/<[^>]*>/g, '').trim();
      }
    }

    // Check title for error indication
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1].toLowerCase().includes('error')) {
      return titleMatch[1].trim();
    }

    return 'Google Cache encountered an error';
  }

  /**
   * Validates that the content is actual article content
   * @param {string} content - HTML content
   * @param {string} originalUrl - Original URL
   * @returns {Object}
   */
  validateContent(content, originalUrl) {
    // Check minimum content length
    if (content.length < 1000) {
      return { isValid: false, reason: 'Cached content too short' };
    }

    // Check for Google Cache specific elements
    const cacheIndicators = [
      /webcache\.googleusercontent\.com/i,
      /google.*cache/i,
      /cached.*version/i
    ];

    const hasCacheElements = cacheIndicators.some(pattern => pattern.test(content));
    if (!hasCacheElements) {
      return { isValid: false, reason: 'Content not from Google Cache' };
    }

    // Check for actual article content
    const contentIndicators = [
      /<h1/i,
      /<article/i,
      /<div[^>]*class="[^"]*content[^"]*"/i,
      /<div[^>]*class="[^"]*article[^"]*"/i,
      /<p>/i
    ];

    const hasContent = contentIndicators.some(pattern => pattern.test(content));
    if (!hasContent) {
      return { isValid: false, reason: 'No article content found in cache' };
    }

    // Check if the cached version still has paywall elements
    // Note: Google Cache often preserves the original page structure,
    // but the paywall JavaScript may not execute
    const strongPaywallIndicators = [
      /subscription.*required.*continue/i,
      /premium.*content.*subscribe/i,
      /paywall.*active/i
    ];

    const hasStrongPaywall = strongPaywallIndicators.some(pattern => pattern.test(content));
    if (hasStrongPaywall) {
      return { isValid: false, reason: 'Cached version still shows paywall content' };
    }

    return { isValid: true, reason: 'Valid cached content' };
  }

  /**
   * Extracts clean content from Google Cache response
   * @param {string} content - HTML content
   * @param {string} originalUrl - Original URL
   * @returns {string}
   */
  extractContent(content, originalUrl) {
    try {
      // Extract title
      let title = 'Cached Article';
      const titleSelectors = [
        /<h1[^>]*>(.*?)<\/h1>/i,
        /<title>(.*?)<\/title>/i
      ];

      for (const selector of titleSelectors) {
        const match = content.match(selector);
        if (match) {
          title = match[1].replace(/<[^>]*>/g, '').trim();
          // Remove Google Cache prefix if present
          title = title.replace(/^.*?\s*-\s*Google\s*Search$/i, '').trim();
          break;
        }
      }

      // Extract cache date from Google Cache header
      let cacheDate = '';
      const cacheDateMatch = content.match(/snapshot.*?(\d{1,2}\s+\w+\s+\d{4})/i);
      if (cacheDateMatch) {
        cacheDate = `\n*Cached on: ${cacheDateMatch[1]}*`;
      }

      // Remove Google Cache header and navigation elements
      let cleanedContent = content
        .replace(/<div[^>]*id="[^"]*google[^"]*"[^>]*>.*?<\/div>/gis, '')
        .replace(/<div[^>]*class="[^"]*cache[^"]*"[^>]*>.*?<\/div>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<script[^>]*>.*?<\/script>/gis, '');

      // Extract article content using common selectors
      let articleContent = '';
      const contentSelectors = [
        /<article[^>]*>(.*?)<\/article>/is,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*article[^"]*"[^>]*>(.*?)<\/div>/is,
        /<div[^>]*class="[^"]*story[^"]*"[^>]*>(.*?)<\/div>/is,
        /<main[^>]*>(.*?)<\/main>/is
      ];

      for (const selector of contentSelectors) {
        const match = cleanedContent.match(selector);
        if (match) {
          articleContent = match[1];
          break;
        }
      }

      // If no specific content found, try to extract from body
      if (!articleContent) {
        const bodyMatch = cleanedContent.match(/<body[^>]*>(.*?)<\/body>/is);
        if (bodyMatch) {
          articleContent = bodyMatch[1];
        }
      }

      // Clean up the content
      const finalContent = this.cleanHtmlContent(articleContent);

      return `**${title}**${cacheDate}\n\n${finalContent}\n\n*Original URL: ${originalUrl}*\n*Retrieved from Google Cache*`;
      
    } catch (error) {
      logger.debug('Error extracting content from Google Cache response', { error: error.message });
      return `Cached content available at Google Cache URL\n\n*Original URL: ${originalUrl}*`;
    }
  }

  /**
   * Cleans HTML content for better readability
   * @param {string} htmlContent - Raw HTML content
   * @returns {string} Cleaned text content
   */
  cleanHtmlContent(htmlContent) {
    return htmlContent
      // Remove script and style tags
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      .replace(/<style[^>]*>.*?<\/style>/gis, '')
      // Remove common paywall elements that might still be in cache
      .replace(/<div[^>]*class="[^"]*paywall[^"]*"[^>]*>.*?<\/div>/gis, '')
      .replace(/<div[^>]*class="[^"]*subscription[^"]*"[^>]*>.*?<\/div>/gis, '')
      .replace(/<div[^>]*class="[^"]*premium[^"]*"[^>]*>.*?<\/div>/gis, '')
      // Convert headers
      .replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (match, level, text) => {
        const hashes = '#'.repeat(parseInt(level));
        return `\n\n${hashes} ${text.trim()}\n\n`;
      })
      // Convert paragraphs and breaks
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      // Convert formatting
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      // Convert links
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
      // Convert blockquotes and lists
      .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gi, '\n> $1\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '• $1\n')
      .replace(/<ul[^>]*>|<\/ul>/gi, '\n')
      .replace(/<ol[^>]*>|<\/ol>/gi, '\n')
      // Remove remaining HTML tags
      .replace(/<[^>]*>/g, ' ')
      // Clean up whitespace
      .replace(/\s+/g, ' ')
      .replace(/\n\s*\n\s*\n/g, '\n\n')
      .trim();
  }

  /**
   * Performs health check using Google Cache
   * @returns {Promise<HealthCheckResult>}
   */
  async healthCheck() {
    try {
      // Use a well-known URL that should be cached
      const testUrl = 'https://www.wikipedia.org';
      const cacheUrl = `${this.cacheUrl}${encodeURIComponent(testUrl)}`;
      
      const response = await axios.get(cacheUrl, {
        timeout: 10000,
        headers: { 'User-Agent': this.userAgent }
      });

      const isHealthy = response.status === 200 && 
                       response.data.length > 1000 && 
                       !this.isNotCached(response.data) &&
                       !this.containsErrorMessages(response.data);
      
      return {
        healthy: isHealthy,
        responseTime: response.headers['x-response-time'] || 'unknown',
        message: isHealthy ? 'Google Cache is responding normally' : 'Google Cache may be experiencing issues'
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        message: `Google Cache health check failed: ${error.message}`
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
}

module.exports = GoogleCacheMethod;
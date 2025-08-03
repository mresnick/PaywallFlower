const axios = require('axios');
const BypassMethod = require('./bypassMethod');
const logger = require('../../utils/logger');

/**
 * 12ft.io bypass method
 * Uses the 12ft.io service to bypass paywalls
 */
class TwelveFtMethod extends BypassMethod {
  constructor(config = {}) {
    super('12ft_io', {
      priority: 8,
      timeout: 15000,
      testUrl: 'https://www.nytimes.com/2024/01/01/technology/test-article.html',
      ...config
    });
    
    this.baseUrl = 'https://12ft.io/';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }

  /**
   * Attempts to bypass paywall using 12ft.io
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
      logger.debug(`Attempting 12ft.io bypass for: ${url}`);

      // Construct 12ft.io URL
      const bypassUrl = `${this.baseUrl}${encodeURIComponent(url)}`;
      
      const response = await axios.get(bypassUrl, {
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
        validateStatus: (status) => status < 500 // Accept 4xx errors for analysis
      });

      const responseTime = Date.now() - startTime;

      // Check if 12ft.io successfully processed the page
      if (response.status === 200) {
        const content = response.data;
        
        // Check for 12ft.io error messages
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

        // Extract clean content
        const extractedContent = this.extractContent(content, url);
        
        this.recordMetrics(true, responseTime, { 
          contentLength: extractedContent.length,
          status: response.status 
        });

        return this.createResult(true, bypassUrl, null, {
          extractedContent,
          responseTime,
          method: '12ft_io_redirect'
        });

      } else {
        const error = `12ft.io returned status ${response.status}`;
        this.recordMetrics(false, responseTime, { status: response.status });
        return this.createResult(false, null, error);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordMetrics(false, responseTime, { error: error.message });
      
      logger.debug(`12ft.io bypass failed for ${url}`, {
        error: error.message,
        responseTime
      });

      return this.createResult(false, null, `12ft.io error: ${error.message}`);
    }
  }

  /**
   * Checks if the response contains error messages from 12ft.io
   * @param {string} content - HTML content
   * @returns {boolean}
   */
  containsErrorMessages(content) {
    const errorPatterns = [
      /12ft has been disabled for this site/i,
      /this site is not supported/i,
      /paywall not detected/i,
      /unable to parse/i,
      /blocked by the site/i,
      /rate limit exceeded/i,
      /service temporarily unavailable/i,
      /error 403/i,
      /error 404/i,
      /error 429/i,
      /cloudflare/i
    ];

    return errorPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Extracts error message from 12ft.io response
   * @param {string} content - HTML content
   * @returns {string}
   */
  extractErrorMessage(content) {
    // Try to extract specific error message
    const errorMatch = content.match(/<div[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/div>/i);
    if (errorMatch) {
      return errorMatch[1].replace(/<[^>]*>/g, '').trim();
    }

    // Try to extract from title
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && titleMatch[1].toLowerCase().includes('error')) {
      return titleMatch[1].trim();
    }

    return '12ft.io reported an error processing this URL';
  }

  /**
   * Validates that the content is actual article content
   * @param {string} content - HTML content
   * @param {string} originalUrl - Original URL
   * @returns {Object}
   */
  validateContent(content, originalUrl) {
    // Check minimum content length
    if (content.length < 500) {
      return { isValid: false, reason: 'Content too short' };
    }

    // Check for 12ft.io wrapper elements (indicates successful processing)
    if (!content.includes('12ft.io') && !content.includes('12ft')) {
      return { isValid: false, reason: 'Not processed by 12ft.io' };
    }

    // Check for actual article content indicators
    const articleIndicators = [
      /<article/i,
      /<div[^>]*class="[^"]*content[^"]*"/i,
      /<div[^>]*class="[^"]*article[^"]*"/i,
      /<main/i,
      /<p>/i // At least some paragraph content
    ];

    const hasArticleContent = articleIndicators.some(pattern => pattern.test(content));
    if (!hasArticleContent) {
      return { isValid: false, reason: 'No article content detected' };
    }

    // Check for paywall indicators that weren't bypassed
    const paywallIndicators = [
      /subscribe to continue/i,
      /sign up to read/i,
      /premium content/i,
      /subscription required/i
    ];

    const hasPaywall = paywallIndicators.some(pattern => pattern.test(content));
    if (hasPaywall) {
      return { isValid: false, reason: 'Paywall not successfully bypassed' };
    }

    return { isValid: true, reason: 'Content appears valid' };
  }

  /**
   * Extracts clean content from 12ft.io response
   * @param {string} content - HTML content
   * @param {string} originalUrl - Original URL
   * @returns {string}
   */
  extractContent(content, originalUrl) {
    // For 12ft.io, we typically return the bypass URL since it provides
    // a clean reading experience. However, we can also extract text content.
    
    try {
      // Extract title
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      const title = titleMatch ? titleMatch[1].replace(/12ft\.io - /i, '').trim() : 'Article';

      // Try to extract main content
      let articleContent = '';
      
      // Look for common article content selectors
      const contentPatterns = [
        /<article[^>]*>(.*?)<\/article>/is,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is,
        /<main[^>]*>(.*?)<\/main>/is
      ];

      for (const pattern of contentPatterns) {
        const match = content.match(pattern);
        if (match) {
          articleContent = match[1];
          break;
        }
      }

      // If no specific content found, extract from body
      if (!articleContent) {
        const bodyMatch = content.match(/<body[^>]*>(.*?)<\/body>/is);
        if (bodyMatch) {
          articleContent = bodyMatch[1];
        }
      }

      // Clean up HTML tags and format
      const cleanContent = articleContent
        .replace(/<script[^>]*>.*?<\/script>/gis, '')
        .replace(/<style[^>]*>.*?<\/style>/gis, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

      return `**${title}**\n\n${cleanContent}\n\n*Original URL: ${originalUrl}*\n*Bypassed via 12ft.io*`;
      
    } catch (error) {
      logger.debug('Error extracting content from 12ft.io response', { error: error.message });
      return `Content available at 12ft.io bypass URL\n\n*Original URL: ${originalUrl}*`;
    }
  }

  /**
   * Performs health check using a known test URL
   * @returns {Promise<HealthCheckResult>}
   */
  async healthCheck() {
    try {
      const testUrl = 'https://httpbin.org/html'; // Simple test URL
      const bypassUrl = `${this.baseUrl}${encodeURIComponent(testUrl)}`;
      
      const response = await axios.get(bypassUrl, {
        timeout: 10000,
        headers: { 'User-Agent': this.userAgent }
      });

      const isHealthy = response.status === 200 && response.data.length > 100;
      
      return {
        healthy: isHealthy,
        responseTime: response.headers['x-response-time'] || 'unknown',
        message: isHealthy ? '12ft.io is responding normally' : '12ft.io response seems degraded'
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        message: `12ft.io health check failed: ${error.message}`
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

module.exports = TwelveFtMethod;
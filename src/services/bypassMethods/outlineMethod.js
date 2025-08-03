const axios = require('axios');
const BypassMethod = require('./bypassMethod');
const logger = require('../../utils/logger');

/**
 * Outline.com bypass method
 * Uses the Outline.com service to extract clean article content
 */
class OutlineMethod extends BypassMethod {
  constructor(config = {}) {
    super('outline_com', {
      priority: 7,
      timeout: 20000,
      testUrl: 'https://www.washingtonpost.com/technology/test-article',
      ...config
    });
    
    this.baseUrl = 'https://outline.com/';
    this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
  }

  /**
   * Attempts to bypass paywall using Outline.com
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
      logger.debug(`Attempting Outline.com bypass for: ${url}`);

      // Construct Outline.com URL
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
          'Upgrade-Insecure-Requests': '1',
          'Referer': 'https://outline.com/'
        },
        maxRedirects: 5,
        validateStatus: (status) => status < 500
      });

      const responseTime = Date.now() - startTime;

      if (response.status === 200) {
        const content = response.data;
        
        // Check for Outline.com error messages
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

        // Extract clean content from Outline.com
        const extractedContent = this.extractContent(content, url);
        
        this.recordMetrics(true, responseTime, { 
          contentLength: extractedContent.length,
          status: response.status 
        });

        return this.createResult(true, bypassUrl, null, {
          extractedContent,
          responseTime,
          method: 'outline_redirect'
        });

      } else if (response.status === 429) {
        const error = 'Outline.com rate limit exceeded';
        this.recordMetrics(false, responseTime, { status: response.status });
        return this.createResult(false, null, error);
        
      } else {
        const error = `Outline.com returned status ${response.status}`;
        this.recordMetrics(false, responseTime, { status: response.status });
        return this.createResult(false, null, error);
      }

    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.recordMetrics(false, responseTime, { error: error.message });
      
      logger.debug(`Outline.com bypass failed for ${url}`, {
        error: error.message,
        responseTime
      });

      return this.createResult(false, null, `Outline.com error: ${error.message}`);
    }
  }

  /**
   * Checks if the response contains error messages from Outline.com
   * @param {string} content - HTML content
   * @returns {boolean}
   */
  containsErrorMessages(content) {
    const errorPatterns = [
      /unable to parse/i,
      /failed to fetch/i,
      /article not found/i,
      /access denied/i,
      /rate limit/i,
      /temporarily unavailable/i,
      /service error/i,
      /blocked/i,
      /forbidden/i,
      /not supported/i,
      /cloudflare/i,
      /captcha/i
    ];

    return errorPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Extracts error message from Outline.com response
   * @param {string} content - HTML content
   * @returns {string}
   */
  extractErrorMessage(content) {
    // Try to extract specific error message from Outline.com
    const errorSelectors = [
      /<div[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/div>/i,
      /<p[^>]*class="[^"]*error[^"]*"[^>]*>(.*?)<\/p>/i,
      /<div[^>]*class="[^"]*message[^"]*"[^>]*>(.*?)<\/div>/i
    ];

    for (const selector of errorSelectors) {
      const match = content.match(selector);
      if (match) {
        return match[1].replace(/<[^>]*>/g, '').trim();
      }
    }

    // Check title for error indication
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch && (titleMatch[1].toLowerCase().includes('error') || 
                      titleMatch[1].toLowerCase().includes('failed'))) {
      return titleMatch[1].trim();
    }

    return 'Outline.com could not process this URL';
  }

  /**
   * Validates that the content is actual article content
   * @param {string} content - HTML content
   * @param {string} originalUrl - Original URL
   * @returns {Object}
   */
  validateContent(content, originalUrl) {
    // Check minimum content length
    if (content.length < 800) {
      return { isValid: false, reason: 'Content too short for Outline.com response' };
    }

    // Check for Outline.com specific elements
    const outlineIndicators = [
      /outline\.com/i,
      /<div[^>]*class="[^"]*otl-[^"]*"/i,
      /<article[^>]*class="[^"]*otl-[^"]*"/i
    ];

    const hasOutlineElements = outlineIndicators.some(pattern => pattern.test(content));
    if (!hasOutlineElements) {
      return { isValid: false, reason: 'Content not processed by Outline.com' };
    }

    // Check for actual article content
    const contentIndicators = [
      /<h1/i,
      /<article/i,
      /<div[^>]*class="[^"]*content[^"]*"/i,
      /<p>/i
    ];

    const hasContent = contentIndicators.some(pattern => pattern.test(content));
    if (!hasContent) {
      return { isValid: false, reason: 'No article content found' };
    }

    // Check that paywall wasn't just moved to Outline
    const paywallIndicators = [
      /subscribe.*continue/i,
      /premium.*content/i,
      /subscription.*required/i,
      /sign.*up.*read/i
    ];

    const stillHasPaywall = paywallIndicators.some(pattern => pattern.test(content));
    if (stillHasPaywall) {
      return { isValid: false, reason: 'Paywall still present in Outline version' };
    }

    return { isValid: true, reason: 'Valid Outline.com content' };
  }

  /**
   * Extracts clean content from Outline.com response
   * @param {string} content - HTML content
   * @param {string} originalUrl - Original URL
   * @returns {string}
   */
  extractContent(content, originalUrl) {
    try {
      // Extract title - Outline.com usually has clean titles
      let title = 'Article';
      const titleSelectors = [
        /<h1[^>]*class="[^"]*otl-title[^"]*"[^>]*>(.*?)<\/h1>/i,
        /<h1[^>]*>(.*?)<\/h1>/i,
        /<title>(.*?)<\/title>/i
      ];

      for (const selector of titleSelectors) {
        const match = content.match(selector);
        if (match) {
          title = match[1].replace(/<[^>]*>/g, '').trim();
          // Remove "- Outline" suffix if present
          title = title.replace(/\s*-\s*Outline\s*$/i, '');
          break;
        }
      }

      // Extract article content - Outline.com has specific content structure
      let articleContent = '';
      const contentSelectors = [
        /<div[^>]*class="[^"]*otl-content[^"]*"[^>]*>(.*?)<\/div>/is,
        /<article[^>]*class="[^"]*otl-article[^"]*"[^>]*>(.*?)<\/article>/is,
        /<div[^>]*class="[^"]*content[^"]*"[^>]*>(.*?)<\/div>/is,
        /<article[^>]*>(.*?)<\/article>/is
      ];

      for (const selector of contentSelectors) {
        const match = content.match(selector);
        if (match) {
          articleContent = match[1];
          break;
        }
      }

      // If no specific content found, try to extract from main content area
      if (!articleContent) {
        const mainMatch = content.match(/<main[^>]*>(.*?)<\/main>/is);
        if (mainMatch) {
          articleContent = mainMatch[1];
        }
      }

      // Clean up the content
      const cleanContent = this.cleanHtmlContent(articleContent);

      // Extract author and date if available
      let metadata = '';
      const authorMatch = content.match(/<span[^>]*class="[^"]*author[^"]*"[^>]*>(.*?)<\/span>/i);
      const dateMatch = content.match(/<time[^>]*>(.*?)<\/time>/i);
      
      if (authorMatch || dateMatch) {
        metadata = '\n\n';
        if (authorMatch) {
          metadata += `*By ${authorMatch[1].replace(/<[^>]*>/g, '').trim()}*`;
        }
        if (dateMatch) {
          metadata += `${authorMatch ? ' • ' : '*'}${dateMatch[1].replace(/<[^>]*>/g, '').trim()}${authorMatch ? '' : '*'}`;
        }
      }

      return `**${title}**${metadata}\n\n${cleanContent}\n\n*Original URL: ${originalUrl}*\n*Cleaned by Outline.com*`;
      
    } catch (error) {
      logger.debug('Error extracting content from Outline.com response', { error: error.message });
      return `Clean article available at Outline.com\n\n*Original URL: ${originalUrl}*`;
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
      // Convert common HTML elements to markdown-like format
      .replace(/<h([1-6])[^>]*>(.*?)<\/h[1-6]>/gi, (match, level, text) => {
        const hashes = '#'.repeat(parseInt(level));
        return `\n\n${hashes} ${text.trim()}\n\n`;
      })
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
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
   * Performs health check using Outline.com
   * @returns {Promise<HealthCheckResult>}
   */
  async healthCheck() {
    try {
      // Use a simple test URL that should work
      const testUrl = 'https://example.com';
      const bypassUrl = `${this.baseUrl}${encodeURIComponent(testUrl)}`;
      
      const response = await axios.get(bypassUrl, {
        timeout: 10000,
        headers: { 'User-Agent': this.userAgent }
      });

      const isHealthy = response.status === 200 && 
                       response.data.length > 500 && 
                       !this.containsErrorMessages(response.data);
      
      return {
        healthy: isHealthy,
        responseTime: response.headers['x-response-time'] || 'unknown',
        message: isHealthy ? 'Outline.com is responding normally' : 'Outline.com may be experiencing issues'
      };
      
    } catch (error) {
      return {
        healthy: false,
        error: error.message,
        message: `Outline.com health check failed: ${error.message}`
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

module.exports = OutlineMethod;
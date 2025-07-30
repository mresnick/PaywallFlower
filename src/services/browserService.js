const puppeteer = require('puppeteer');
const config = require('../config');
const logger = require('../utils/logger');

class BrowserService {
  constructor() {
    this.browser = null;
    this.activeSessions = 0;
    this.maxConcurrent = config.rateLimit.puppeteerMaxConcurrent;
    this.timeout = config.archive.puppeteerTimeout;
    this.puppeteerConfig = config.puppeteer;
  }

  /**
   * Initializes the browser instance
   */
  async initBrowser() {
    if (!this.browser) {
      logger.debug('Initializing Puppeteer browser');
      
      const launchOptions = {
        headless: this.puppeteerConfig.headless,
        args: this.puppeteerConfig.args,
        timeout: this.timeout
      };

      // Set Chrome executable path if running in Docker
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }

      this.browser = await puppeteer.launch(launchOptions);
    }
    return this.browser;
  }

  /**
   * Closes the browser instance
   */
  async closeBrowser() {
    if (this.browser) {
      logger.debug('Closing Puppeteer browser');
      await this.browser.close();
      this.browser = null;
      this.activeSessions = 0;
    }
  }

  /**
   * Extracts content from a paywalled URL using headless browser
   * @param {string} url - The URL to extract content from
   * @returns {Promise<{success: boolean, content?: string, title?: string, error?: string}>}
   */
  async extractContent(url) {
    if (this.activeSessions >= this.maxConcurrent) {
      logger.warn(`Max concurrent browser sessions reached (${this.maxConcurrent})`);
      return { success: false, error: 'Max concurrent sessions reached' };
    }

    this.activeSessions++;
    let page = null;

    try {
      logger.debug(`Starting browser content extraction`);
      
      await this.initBrowser();
      page = await this.browser.newPage();

      // Set user agent and viewport
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
      await page.setViewport({ width: 1920, height: 1080 });

      // Block images and other resources to speed up loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // Navigate to the page
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: this.timeout 
      });

      // Wait a bit for dynamic content to load
      await page.waitForTimeout(2000);

      // Try to bypass common paywall overlays
      await this.bypassPaywallOverlays(page);

      // Extract title and content
      const result = await page.evaluate(() => {
        // Remove common paywall elements
        const paywallSelectors = [
          '[class*="paywall"]',
          '[class*="subscription"]',
          '[class*="premium"]',
          '[id*="paywall"]',
          '.overlay',
          '.modal',
          '[class*="signup"]'
        ];

        paywallSelectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => el.remove());
        });

        // Get title
        const title = document.title || document.querySelector('h1')?.textContent || 'Untitled';

        // Try to find main content using common selectors
        const contentSelectors = [
          'article',
          '[class*="article"]',
          '[class*="content"]',
          '[class*="story"]',
          '[class*="post"]',
          'main',
          '.entry-content',
          '.post-content',
          '.article-body'
        ];

        let content = '';
        for (const selector of contentSelectors) {
          const element = document.querySelector(selector);
          if (element) {
            content = element.innerText || element.textContent || '';
            if (content.length > 200) { // Ensure we got substantial content
              break;
            }
          }
        }

        // Fallback to body content if no specific content found
        if (!content || content.length < 200) {
          content = document.body.innerText || document.body.textContent || '';
        }

        return {
          title: title.trim(),
          content: content.trim()
        };
      });

      // Validate that the extracted content is actually article content, not CAPTCHA/anti-bot responses
      const validationResult = this.validateExtractedContent(result.content, result.title, url);
      
      if (!validationResult.isValid) {
        logger.debug(`Invalid content detected: ${validationResult.reason}`, {
          contentLength: result.content?.length || 0
        });
        return { success: false, error: validationResult.reason };
      }

      if (result.content && result.content.length > 100) {
        logger.debug(`Successfully extracted content`, {
          titleLength: result.title.length,
          contentLength: result.content.length
        });

        return {
          success: true,
          title: result.title,
          content: result.content
        };
      } else {
        logger.debug(`Insufficient content extracted`, {
          contentLength: result.content?.length || 0
        });
        return { success: false, error: 'Insufficient content extracted' };
      }

    } catch (error) {
      logger.error(`Browser content extraction failed`, {
        error: error.message,
        stack: error.stack
      });
      return { success: false, error: error.message };
    } finally {
      if (page) {
        await page.close();
      }
      this.activeSessions--;
    }
  }

  /**
   * Attempts to bypass common paywall overlay techniques
   * @param {Page} page - Puppeteer page instance
   */
  async bypassPaywallOverlays(page) {
    try {
      // Remove overflow hidden from body (common paywall technique)
      await page.evaluate(() => {
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
      });

      // Try to close modal dialogs
      const closeSelectors = [
        '[aria-label*="close"]',
        '[class*="close"]',
        '.modal-close',
        '.overlay-close',
        '[data-dismiss="modal"]'
      ];

      for (const selector of closeSelectors) {
        try {
          await page.click(selector, { timeout: 1000 });
          await page.waitForTimeout(500);
        } catch (e) {
          // Ignore if element not found or not clickable
        }
      }

      // Try to scroll to reveal content
      await page.evaluate(() => {
        window.scrollTo(0, document.body.scrollHeight / 4);
      });

    } catch (error) {
      logger.debug('Error during paywall overlay bypass', { error: error.message });
    }
  }

  /**
   * Validates that extracted content is actually article content, not CAPTCHA/anti-bot responses
   * @param {string} content - The extracted content
   * @param {string} title - The extracted title
   * @param {string} url - The original URL
   * @returns {Object} Validation result with isValid boolean and reason string
   */
  validateExtractedContent(content, title, url) {
    if (!content || content.length < 50) {
      return { isValid: false, reason: 'Content too short' };
    }

    // Check for CAPTCHA indicators
    const captchaIndicators = [
      /var dd=\{.*'rt':'c'/i,  // The specific pattern from your example
      /captcha/i,
      /cloudflare/i,
      /challenge/i,
      /verification/i,
      /bot.*detect/i,
      /security.*check/i,
      /please.*verify/i,
      /human.*verification/i,
      /ray.*id/i,  // Cloudflare Ray ID
      /cf-ray/i,   // Cloudflare Ray
      /'cid':/i,   // CAPTCHA ID pattern
      /'hsh':/i,   // Hash pattern from CAPTCHA
      /geo\.captcha-delivery\.com/i
    ];

    for (const pattern of captchaIndicators) {
      if (pattern.test(content)) {
        return { isValid: false, reason: 'CAPTCHA or anti-bot protection detected' };
      }
    }

    // Check for error pages
    const errorIndicators = [
      /access.*denied/i,
      /403.*forbidden/i,
      /404.*not.*found/i,
      /500.*error/i,
      /temporarily.*unavailable/i,
      /service.*unavailable/i,
      /blocked/i,
      /unauthorized/i
    ];

    for (const pattern of errorIndicators) {
      if (pattern.test(content)) {
        return { isValid: false, reason: 'Error page detected' };
      }
    }

    // Check for subscription/paywall pages that weren't bypassed
    const paywallIndicators = [
      /subscribe.*to.*continue/i,
      /sign.*up.*to.*read/i,
      /become.*a.*member/i,
      /premium.*content/i,
      /subscription.*required/i,
      /register.*to.*continue/i,
      /login.*to.*view/i
    ];

    for (const pattern of paywallIndicators) {
      if (pattern.test(content) && content.length < 500) {
        return { isValid: false, reason: 'Paywall page not bypassed' };
      }
    }

    // Check for JavaScript-heavy content that didn't render properly
    const jsIndicators = [
      /document\.write/i,
      /window\.location/i,
      /eval\(/i,
      /function\s*\(/i
    ];

    let jsMatches = 0;
    for (const pattern of jsIndicators) {
      if (pattern.test(content)) {
        jsMatches++;
      }
    }

    // If more than 30% of content appears to be JavaScript, it's likely not article content
    if (jsMatches > 2 && content.length < 1000) {
      return { isValid: false, reason: 'Content appears to be unrendered JavaScript' };
    }

    // Check content quality - should have some sentence structure
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 10);
    if (sentences.length < 3 && content.length < 300) {
      return { isValid: false, reason: 'Content lacks proper sentence structure' };
    }

    // Additional check for the specific pattern you encountered
    if (content.includes("var dd={") && content.includes("'rt':'c'")) {
      return { isValid: false, reason: 'CAPTCHA delivery script detected' };
    }

    return { isValid: true, reason: 'Content appears valid' };
  }

  /**
   * Cleanup method to ensure browser is closed
   */
  async cleanup() {
    await this.closeBrowser();
  }
}

module.exports = BrowserService;
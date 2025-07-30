const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { extractDomain } = require('../utils/urlExtractor');

class PaywallDetectorService {
  constructor() {
    this.knownPaywallDomains = new Set(config.paywallDomains);
    this.whitelistedDomains = new Set(config.whitelistedDomains);
    this.paywallIndicators = config.paywallIndicators;
  }

  /**
   * Checks if a URL is from a whitelisted domain (should never be considered paywalled)
   * @param {string} url - The URL to check
   * @returns {boolean} True if the domain is whitelisted
   */
  isWhitelistedDomain(url) {
    const domain = extractDomain(url);
    if (!domain) return false;

    return this.whitelistedDomains.has(domain);
  }

  /**
   * Checks if a URL is from a known paywall domain
   * @param {string} url - The URL to check
   * @returns {boolean} True if the domain is known to have paywalls
   */
  isKnownPaywallDomain(url) {
    const domain = extractDomain(url);
    if (!domain) return false;

    return this.knownPaywallDomains.has(domain);
  }

  /**
   * Performs heuristic detection by fetching the page and looking for paywall indicators
   * @param {string} url - The URL to check
   * @returns {Promise<boolean>} True if paywall indicators are found
   */
  async detectPaywallHeuristic(url) {
    try {
      logger.debug(`Performing heuristic paywall detection`);
      
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const content = response.data.toLowerCase();
      
      // Check for paywall indicators in the content
      const foundIndicators = this.paywallIndicators.filter(indicator => 
        content.includes(indicator.toLowerCase())
      );

      const hasPaywall = foundIndicators.length > 0;
      
      if (hasPaywall) {
        logger.debug(`Paywall detected via heuristics`, {
          indicators: foundIndicators
        });
        
        // Add domain to known paywall domains for future reference
        const domain = extractDomain(url);
        if (domain) {
          this.knownPaywallDomains.add(domain);
          logger.debug(`Added ${domain} to known paywall domains`);
        }
      }

      return hasPaywall;
    } catch (error) {
      logger.debug(`Failed to perform heuristic paywall detection`, {
        error: error.message
      });
      return false;
    }
  }

  /**
   * Main method to detect if a URL has a paywall
   * @param {string} url - The URL to check
   * @returns {Promise<boolean>} True if paywall is detected
   */
  async isPaywalled(url) {
    // First check if domain is whitelisted (highest priority)
    if (this.isWhitelistedDomain(url)) {
      logger.debug(`Domain is whitelisted, skipping paywall detection`, {
        domain: extractDomain(url)
      });
      return false;
    }

    // Then check known paywall domains (fast)
    if (this.isKnownPaywallDomain(url)) {
      return true;
    }

    // Finally perform heuristic detection (slower)
    return await this.detectPaywallHeuristic(url);
  }

  /**
   * Adds a domain to the known paywall domains list
   * @param {string} domain - The domain to add
   */
  addPaywallDomain(domain) {
    this.knownPaywallDomains.add(domain);
    logger.debug(`Manually added ${domain} to known paywall domains`);
  }

  /**
   * Gets the current list of known paywall domains
   * @returns {string[]} Array of known paywall domains
   */
  getKnownDomains() {
    return Array.from(this.knownPaywallDomains);
  }
}

module.exports = PaywallDetectorService;
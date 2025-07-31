const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');
const { extractDomain, isMediaFile } = require('../utils/urlExtractor');

class PaywallDetectorService {
  constructor() {
    this.knownPaywallDomains = new Set(config.paywallDomains);
    this.whitelistedDomains = new Set(config.whitelistedDomains);
    this.paywallConfig = config.paywallDetection;
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
   * Analyzes content structure to determine if it's truncated or blocked
   * @param {string} content - The HTML content to analyze
   * @returns {Object} Analysis results with score and details
   */
  analyzeContentStructure(content) {
    const analysis = {
      score: 0,
      details: []
    };

    // Check for truncated content indicators
    const textContent = content.replace(/<[^>]*>/g, '').trim();
    const contentLength = textContent.length;
    
    if (contentLength < 500) {
      analysis.score += 2;
      analysis.details.push('Very short content (possible truncation)');
    }

    // Check for common paywall overlay patterns
    const overlayPatterns = [
      /class="[^"]*paywall[^"]*"/i,
      /id="[^"]*paywall[^"]*"/i,
      /class="[^"]*subscription[^"]*"/i,
      /class="[^"]*premium[^"]*"/i,
      /style="[^"]*blur[^"]*"/i,
      /style="[^"]*opacity:\s*0\.[0-5]/i,
      /data-[^=]*paywall/i,
      /overlay.*subscription/i
    ];

    overlayPatterns.forEach(pattern => {
      if (pattern.test(content)) {
        analysis.score += 3;
        analysis.details.push(`Found paywall overlay pattern: ${pattern.source}`);
      }
    });

    // Check for article truncation indicators
    const truncationPatterns = [
      /\.{3,}/g, // Multiple dots indicating truncation
      /\[\.{3}\]/g, // [...]
      /read\s+more/i,
      /continue\s+reading/i
    ];

    truncationPatterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        analysis.score += 1;
        analysis.details.push(`Found truncation pattern: ${pattern.source}`);
      }
    });

    return analysis;
  }

  /**
   * Calculates paywall score based on weighted indicators
   * @param {string} content - The HTML content to analyze
   * @returns {Object} Score calculation results
   */
  calculatePaywallScore(content) {
    const lowerContent = content.toLowerCase();
    let score = 0;
    let foundIndicators = [];
    let weakIndicatorScore = 0;

    // Process strong indicators
    this.paywallConfig.strongIndicators.forEach(indicator => {
      if (lowerContent.includes(indicator.text)) {
        score += indicator.weight;
        foundIndicators.push({ type: 'strong', text: indicator.text, weight: indicator.weight });
      }
    });

    // Process medium indicators
    this.paywallConfig.mediumIndicators.forEach(indicator => {
      if (lowerContent.includes(indicator.text)) {
        score += indicator.weight;
        foundIndicators.push({ type: 'medium', text: indicator.text, weight: indicator.weight });
      }
    });

    // Process weak indicators with cap
    this.paywallConfig.weakIndicators.forEach(indicator => {
      if (lowerContent.includes(indicator.text)) {
        weakIndicatorScore += indicator.weight;
        foundIndicators.push({ type: 'weak', text: indicator.text, weight: indicator.weight });
      }
    });

    // Apply weak indicator cap to prevent false positives
    const cappedWeakScore = Math.min(weakIndicatorScore, this.paywallConfig.maxWeakIndicatorScore);
    score += cappedWeakScore;

    if (weakIndicatorScore > this.paywallConfig.maxWeakIndicatorScore) {
      foundIndicators.push({
        type: 'info',
        text: `Weak indicators capped at ${this.paywallConfig.maxWeakIndicatorScore} (was ${weakIndicatorScore})`,
        weight: 0
      });
    }

    // Process negative indicators
    this.paywallConfig.negativeIndicators.forEach(indicator => {
      if (lowerContent.includes(indicator.text)) {
        score += indicator.weight; // These are negative weights
        foundIndicators.push({ type: 'negative', text: indicator.text, weight: indicator.weight });
      }
    });

    // Add content structure analysis only if we have strong/medium indicators
    // This prevents structure analysis from inflating scores for weak-only content
    const structureAnalysis = this.analyzeContentStructure(content);
    const hasStrongOrMediumIndicators = foundIndicators.some(i => i.type === 'strong' || i.type === 'medium');
    
    if (hasStrongOrMediumIndicators) {
      score += structureAnalysis.score;
    } else {
      // For weak-only content, only add structure score if it's significant (indicating real paywall patterns)
      if (structureAnalysis.score >= 3) {
        score += structureAnalysis.score;
      }
    }

    return {
      score,
      foundIndicators,
      structureAnalysis,
      threshold: this.paywallConfig.threshold,
      hasPaywall: score >= this.paywallConfig.threshold
    };
  }

  /**
   * Performs advanced heuristic detection with weighted scoring
   * @param {string} url - The URL to check
   * @returns {Promise<boolean>} True if paywall is detected
   */
  async detectPaywallHeuristic(url) {
    try {
      logger.debug(`Performing advanced heuristic paywall detection`);
      
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const scoreResult = this.calculatePaywallScore(response.data);
      
      if (scoreResult.hasPaywall) {
        logger.debug(`Paywall detected via advanced heuristics`, {
          score: scoreResult.score,
          threshold: scoreResult.threshold,
          indicators: scoreResult.foundIndicators,
          structureAnalysis: scoreResult.structureAnalysis
        });
        
        // Add domain to known paywall domains for future reference
        const domain = extractDomain(url);
        if (domain) {
          this.knownPaywallDomains.add(domain);
          logger.debug(`Added ${domain} to known paywall domains`);
        }
      } else {
        logger.debug(`No paywall detected`, {
          score: scoreResult.score,
          threshold: scoreResult.threshold,
          indicators: scoreResult.foundIndicators
        });
      }

      return scoreResult.hasPaywall;
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
    // First check if it's a media file (highest priority - media files are never paywalled)
    if (isMediaFile(url)) {
      logger.debug(`URL is a media file, skipping paywall detection`, {
        url: url
      });
      return false;
    }

    // Then check if domain is whitelisted (second highest priority)
    if (this.isWhitelistedDomain(url)) {
      logger.debug(`Domain is whitelisted, skipping paywall detection`, {
        domain: extractDomain(url)
      });
      return false;
    }

    // Then check known paywall domains (fast)
    if (this.isKnownPaywallDomain(url)) {
      logger.debug(`Domain is known paywall domain`, {
        domain: extractDomain(url)
      });
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

  /**
   * Gets detailed paywall analysis for debugging purposes
   * @param {string} url - The URL to analyze
   * @returns {Promise<Object>} Detailed analysis results
   */
  async getDetailedAnalysis(url) {
    try {
      const response = await axios.get(url, {
        timeout: 5000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }
      });

      const scoreResult = this.calculatePaywallScore(response.data);
      
      return {
        url,
        domain: extractDomain(url),
        isWhitelisted: this.isWhitelistedDomain(url),
        isKnownPaywall: this.isKnownPaywallDomain(url),
        isMediaFile: isMediaFile(url),
        ...scoreResult
      };
    } catch (error) {
      return {
        url,
        domain: extractDomain(url),
        error: error.message,
        isWhitelisted: this.isWhitelistedDomain(url),
        isKnownPaywall: this.isKnownPaywallDomain(url),
        isMediaFile: isMediaFile(url)
      };
    }
  }
}

module.exports = PaywallDetectorService;
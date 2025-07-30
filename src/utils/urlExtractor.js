const logger = require('./logger');

/**
 * Extracts URLs from a Discord message content
 * @param {string} content - The message content
 * @returns {string[]} Array of URLs found in the message
 */
function extractUrls(content) {
  const urlRegex = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
  const urls = content.match(urlRegex) || [];
  
  logger.debug(`Extracted ${urls.length} URLs from message`, { urls });
  return urls;
}

/**
 * Normalizes a URL by removing tracking parameters and fragments
 * @param {string} url - The URL to normalize
 * @returns {string} Normalized URL
 */
function normalizeUrl(url) {
  try {
    const urlObj = new URL(url);
    
    // Remove common tracking parameters
    const trackingParams = [
      'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
      'fbclid', 'gclid', 'ref', 'source', 'campaign'
    ];
    
    trackingParams.forEach(param => {
      urlObj.searchParams.delete(param);
    });
    
    // Remove fragment
    urlObj.hash = '';
    
    return urlObj.toString();
  } catch (error) {
    logger.warn(`Failed to normalize URL: ${url}`, { error: error.message });
    return url;
  }
}

/**
 * Extracts domain from URL
 * @param {string} url - The URL
 * @returns {string|null} Domain or null if invalid
 */
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, '');
  } catch (error) {
    logger.warn(`Failed to extract domain from URL: ${url}`, { error: error.message });
    return null;
  }
}

module.exports = {
  extractUrls,
  normalizeUrl,
  extractDomain
};
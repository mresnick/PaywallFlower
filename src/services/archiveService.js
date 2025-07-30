const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

class ArchiveService {
  constructor() {
    this.archiveTodayTimeout = config.archive.archiveTodayTimeout;
    this.waybackTimeout = config.archive.waybackTimeout;
  }

  /**
   * Attempts to find an archived version on archive.today
   * @param {string} url - The URL to archive
   * @returns {Promise<string|null>} Archive URL or null if not found
   */
  async tryArchiveToday(url) {
    try {
      logger.debug(`[ARCHIVE.TODAY] Starting search for: ${url}`);
      logger.debug(`[ARCHIVE.TODAY] Timeout configured: ${this.archiveTodayTimeout}ms`);
      
      const searchUrl = `https://archive.today/newest/${url}`;
      logger.debug(`[ARCHIVE.TODAY] Search URL: ${searchUrl}`);
      
      // First, try to find existing archive
      logger.debug(`[ARCHIVE.TODAY] Making GET request to find existing archive...`);
      const searchResponse = await axios.get(searchUrl, {
        timeout: this.archiveTodayTimeout,
        maxRedirects: 5,
        validateStatus: (status) => status < 400
      });

      logger.debug(`[ARCHIVE.TODAY] Search response status: ${searchResponse.status}`);
      logger.debug(`[ARCHIVE.TODAY] Search response headers:`, {
        contentType: searchResponse.headers['content-type'],
        contentLength: searchResponse.headers['content-length'],
        location: searchResponse.headers['location']
      });
      
      if (searchResponse.request && searchResponse.request.res) {
        logger.debug(`[ARCHIVE.TODAY] Final response URL: ${searchResponse.request.res.responseUrl}`);
      }

      if (searchResponse.status === 200 && searchResponse.request.res.responseUrl) {
        const archiveUrl = searchResponse.request.res.responseUrl;
        logger.debug(`[ARCHIVE.TODAY] Checking if response URL is archive: ${archiveUrl}`);
        
        if (archiveUrl.includes('archive.today') || archiveUrl.includes('archive.ph')) {
          logger.info(`[ARCHIVE.TODAY] ✓ Found existing archive for ${url}`, { archiveUrl });
          return archiveUrl;
        } else {
          logger.debug(`[ARCHIVE.TODAY] Response URL is not an archive link: ${archiveUrl}`);
        }
      } else {
        logger.debug(`[ARCHIVE.TODAY] No valid response URL found`);
      }

      // If no existing archive, try to create one
      logger.debug(`[ARCHIVE.TODAY] No existing archive found, attempting to create new archive for ${url}`);
      
      const postData = new URLSearchParams({
        url: url,
        anyway: '1'
      });
      logger.debug(`[ARCHIVE.TODAY] POST data:`, { url, anyway: '1' });
      
      const createResponse = await axios.post('https://archive.today/submit/',
        postData,
        {
          timeout: this.archiveTodayTimeout,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          },
          maxRedirects: 5
        }
      );

      logger.debug(`[ARCHIVE.TODAY] Create response status: ${createResponse.status}`);
      logger.debug(`[ARCHIVE.TODAY] Create response headers:`, {
        contentType: createResponse.headers['content-type'],
        contentLength: createResponse.headers['content-length'],
        location: createResponse.headers['location']
      });

      if (createResponse.request && createResponse.request.res) {
        logger.debug(`[ARCHIVE.TODAY] Create final response URL: ${createResponse.request.res.responseUrl}`);
      }

      if (createResponse.status === 200 && createResponse.request.res.responseUrl) {
        const newArchiveUrl = createResponse.request.res.responseUrl;
        logger.debug(`[ARCHIVE.TODAY] Checking if create response URL is archive: ${newArchiveUrl}`);
        
        if (newArchiveUrl.includes('archive.today') || newArchiveUrl.includes('archive.ph')) {
          logger.info(`[ARCHIVE.TODAY] ✓ Created new archive for ${url}`, { archiveUrl: newArchiveUrl });
          return newArchiveUrl;
        } else {
          logger.debug(`[ARCHIVE.TODAY] Create response URL is not an archive link: ${newArchiveUrl}`);
        }
      } else {
        logger.debug(`[ARCHIVE.TODAY] No valid create response URL found`);
      }

      logger.debug(`[ARCHIVE.TODAY] ✗ Failed to find or create archive for ${url}`);
      return null;
    } catch (error) {
      logger.error(`[ARCHIVE.TODAY] ✗ Exception occurred for ${url}`, {
        error: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data ? String(error.response.data).substring(0, 500) : null
      });
      return null;
    }
  }

  /**
   * Attempts to find an archived version on Wayback Machine
   * @param {string} url - The URL to search
   * @returns {Promise<string|null>} Archive URL or null if not found
   */
  async tryWaybackMachine(url) {
    try {
      logger.debug(`[WAYBACK] Starting search for: ${url}`);
      logger.debug(`[WAYBACK] Timeout configured: ${this.waybackTimeout}ms`);
      
      const apiUrl = `https://archive.org/wayback/available?url=${url}`;
      logger.debug(`[WAYBACK] API URL: ${apiUrl}`);
      
      logger.debug(`[WAYBACK] Making GET request to Wayback Machine API...`);
      const response = await axios.get(apiUrl, {
        timeout: this.waybackTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      logger.debug(`[WAYBACK] Response status: ${response.status}`);
      logger.debug(`[WAYBACK] Response headers:`, {
        contentType: response.headers['content-type'],
        contentLength: response.headers['content-length']
      });
      logger.debug(`[WAYBACK] Raw response data:`, response.data);

      if (!response.data) {
        logger.debug(`[WAYBACK] No response data received`);
        return null;
      }

      if (!response.data.archived_snapshots) {
        logger.debug(`[WAYBACK] No archived_snapshots in response`);
        return null;
      }

      logger.debug(`[WAYBACK] Archived snapshots found:`, response.data.archived_snapshots);

      if (!response.data.archived_snapshots.closest) {
        logger.debug(`[WAYBACK] No closest snapshot available`);
        return null;
      }

      const snapshot = response.data.archived_snapshots.closest;
      logger.debug(`[WAYBACK] Closest snapshot details:`, snapshot);

      if (!snapshot.available) {
        logger.debug(`[WAYBACK] Snapshot exists but is not available`);
        return null;
      }

      if (!snapshot.url) {
        logger.debug(`[WAYBACK] Snapshot is available but has no URL`);
        return null;
      }

      logger.info(`[WAYBACK] ✓ Found archive for ${url}`, {
        archiveUrl: snapshot.url,
        timestamp: snapshot.timestamp,
        status: snapshot.status
      });
      return snapshot.url;

    } catch (error) {
      logger.error(`[WAYBACK] ✗ Exception occurred for ${url}`, {
        error: error.message,
        code: error.code,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data ? JSON.stringify(error.response.data) : null
      });
      return null;
    }
  }

  /**
   * Attempts to find an archived version using all available services
   * @param {string} url - The URL to archive
   * @returns {Promise<string|null>} Archive URL or null if not found
   */
  async findArchive(url) {
    logger.info(`[ARCHIVE] ========== Starting archive search for: ${url} ==========`);
    logger.debug(`[ARCHIVE] Configured timeouts - Archive.today: ${this.archiveTodayTimeout}ms, Wayback: ${this.waybackTimeout}ms`);

    const overallStartTime = Date.now();

    // Try archive.today first (usually faster and more reliable for recent content)
    logger.info(`[ARCHIVE] Step 1/2: Attempting archive.today for ${url}`);
    const archiveTodayStartTime = Date.now();
    
    try {
      const archiveTodayResult = await this.tryArchiveToday(url);
      const archiveTodayDuration = Date.now() - archiveTodayStartTime;
      
      if (archiveTodayResult && typeof archiveTodayResult === 'string' && archiveTodayResult.length > 0) {
        logger.info(`[ARCHIVE] ✓ SUCCESS: archive.today found result in ${archiveTodayDuration}ms - RETURNING IMMEDIATELY`, {
          url,
          archiveUrl: archiveTodayResult,
          duration: archiveTodayDuration
        });
        return archiveTodayResult;
      }
      logger.warn(`[ARCHIVE] ✗ FAILED: archive.today returned ${archiveTodayResult} after ${archiveTodayDuration}ms, trying Wayback Machine as fallback`);
    } catch (error) {
      const archiveTodayDuration = Date.now() - archiveTodayStartTime;
      logger.error(`[ARCHIVE] ✗ EXCEPTION: archive.today threw error after ${archiveTodayDuration}ms`, {
        error: error.message,
        url
      });
    }

    // Try Wayback Machine as fallback
    logger.info(`[ARCHIVE] Step 2/2: Attempting Wayback Machine for ${url}`);
    const waybackStartTime = Date.now();
    
    try {
      const waybackResult = await this.tryWaybackMachine(url);
      const waybackDuration = Date.now() - waybackStartTime;
      
      if (waybackResult && typeof waybackResult === 'string' && waybackResult.length > 0) {
        logger.info(`[ARCHIVE] ✓ SUCCESS: Wayback Machine found result in ${waybackDuration}ms - RETURNING IMMEDIATELY`, {
          url,
          archiveUrl: waybackResult,
          duration: waybackDuration,
          totalDuration: Date.now() - overallStartTime
        });
        return waybackResult;
      }
      logger.warn(`[ARCHIVE] ✗ FAILED: Wayback Machine returned ${waybackResult} after ${waybackDuration}ms`);
    } catch (error) {
      const waybackDuration = Date.now() - waybackStartTime;
      logger.error(`[ARCHIVE] ✗ EXCEPTION: Wayback Machine threw error after ${waybackDuration}ms`, {
        error: error.message,
        url
      });
    }

    const totalDuration = Date.now() - overallStartTime;
    logger.error(`[ARCHIVE] ========== COMPLETE FAILURE: No archive found for ${url} after ${totalDuration}ms - all services failed ==========`);
    return null;
  }
}

module.exports = ArchiveService;
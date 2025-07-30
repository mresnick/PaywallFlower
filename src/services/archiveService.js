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
      logger.debug(`Searching archive.today for: ${url}`);
      
      const searchUrl = `https://archive.today/newest/${url}`;
      logger.debug(`Archive.today search URL: ${searchUrl}`);
      
      // First, try to find existing archive
      const searchResponse = await axios.get(searchUrl, {
        timeout: this.archiveTodayTimeout,
        maxRedirects: 5,
        validateStatus: (status) => status < 400
      });

      logger.debug(`Archive.today search response: ${searchResponse.status}`, {
        finalUrl: searchResponse.request?.res?.responseUrl,
        contentType: searchResponse.headers['content-type']
      });

      if (searchResponse.status === 200 && searchResponse.request.res.responseUrl) {
        const archiveUrl = searchResponse.request.res.responseUrl;
        
        if (archiveUrl.includes('archive.today') || archiveUrl.includes('archive.ph')) {
          logger.debug(`Found existing archive.today archive`, { archiveUrl });
          return archiveUrl;
        }
      }

      // If no existing archive, try to create one
      logger.debug(`No existing archive found, creating new one`);
      
      const postData = new URLSearchParams({
        url: url,
        anyway: '1'
      });
      
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

      logger.debug(`Archive.today create response: ${createResponse.status}`, {
        finalUrl: createResponse.request?.res?.responseUrl,
        contentType: createResponse.headers['content-type']
      });

      if (createResponse.status === 200 && createResponse.request.res.responseUrl) {
        const newArchiveUrl = createResponse.request.res.responseUrl;
        
        if (newArchiveUrl.includes('archive.today') || newArchiveUrl.includes('archive.ph')) {
          logger.debug(`Created new archive.today archive`, { archiveUrl: newArchiveUrl });
          return newArchiveUrl;
        }
      }

      logger.debug(`Failed to find or create archive.today archive`);
      return null;
    } catch (error) {
      logger.debug(`Archive.today failed`, {
        error: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        responseData: error.response?.data ? String(error.response.data).substring(0, 200) : null
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
      logger.debug(`Searching Wayback Machine for: ${url}`);
      
      const apiUrl = `https://archive.org/wayback/available?url=${url}`;
      logger.debug(`Wayback API URL: ${apiUrl}`);
      
      const response = await axios.get(apiUrl, {
        timeout: this.waybackTimeout,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      logger.debug(`Wayback response: ${response.status}`, {
        hasData: !!response.data,
        hasSnapshots: !!response.data?.archived_snapshots,
        hasClosest: !!response.data?.archived_snapshots?.closest
      });

      if (!response.data?.archived_snapshots?.closest?.available || !response.data.archived_snapshots.closest.url) {
        logger.debug(`No valid Wayback snapshot found`);
        return null;
      }

      const snapshot = response.data.archived_snapshots.closest;
      logger.debug(`Found Wayback Machine archive`, {
        archiveUrl: snapshot.url,
        timestamp: snapshot.timestamp,
        status: snapshot.status
      });
      return snapshot.url;

    } catch (error) {
      logger.debug(`Wayback Machine failed`, {
        error: error.message,
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
    logger.debug(`Starting archive search for: ${url}`);

    const overallStartTime = Date.now();

    // Try archive.today first (usually faster and more reliable for recent content)
    logger.debug(`Trying archive.today first`);
    const archiveTodayStartTime = Date.now();
    
    try {
      const archiveTodayResult = await this.tryArchiveToday(url);
      const archiveTodayDuration = Date.now() - archiveTodayStartTime;
      
      if (archiveTodayResult && typeof archiveTodayResult === 'string' && archiveTodayResult.length > 0) {
        logger.debug(`Archive.today found result in ${archiveTodayDuration}ms`);
        return archiveTodayResult;
      }
      logger.debug(`Archive.today failed after ${archiveTodayDuration}ms, trying Wayback`);
    } catch (error) {
      const archiveTodayDuration = Date.now() - archiveTodayStartTime;
      logger.debug(`Archive.today threw error after ${archiveTodayDuration}ms`, {
        error: error.message
      });
    }

    // Try Wayback Machine as fallback
    logger.debug(`Trying Wayback Machine as fallback`);
    const waybackStartTime = Date.now();
    
    try {
      const waybackResult = await this.tryWaybackMachine(url);
      const waybackDuration = Date.now() - waybackStartTime;
      
      if (waybackResult && typeof waybackResult === 'string' && waybackResult.length > 0) {
        logger.debug(`Wayback Machine found result in ${waybackDuration}ms`);
        return waybackResult;
      }
      logger.debug(`Wayback Machine failed after ${waybackDuration}ms`);
    } catch (error) {
      const waybackDuration = Date.now() - waybackStartTime;
      logger.debug(`Wayback Machine threw error after ${waybackDuration}ms`, {
        error: error.message
      });
    }

    const totalDuration = Date.now() - overallStartTime;
    logger.debug(`No archive found after ${totalDuration}ms`);
    return null;
  }
}

module.exports = ArchiveService;
require('dotenv').config();

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  
  archive: {
    archiveTodayTimeout: parseInt(process.env.ARCHIVE_TODAY_TIMEOUT) || 10000,
    waybackTimeout: parseInt(process.env.WAYBACK_TIMEOUT) || 15000,
    puppeteerTimeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000,
  },
  
  rateLimit: {
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 10,
    puppeteerMaxConcurrent: parseInt(process.env.PUPPETEER_MAX_CONCURRENT) || 2,
  },
  
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    args: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',') : [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
  },
  
  // Known paywall domains
  paywallDomains: [
    'nytimes.com',
    'wsj.com',
    'washingtonpost.com',
    'ft.com',
    'theatlantic.com',
    'economist.com',
    'bloomberg.com',
    'reuters.com',
    'newyorker.com',
    'wired.com',
    'medium.com',
    'substack.com'
  ],
  
  // Paywall detection heuristics
  paywallIndicators: [
    'subscribe',
    'paywall',
    'premium',
    'subscriber',
    'membership',
    'sign up',
    'register to read',
    'continue reading'
  ]
};

// Validation
if (!config.discord.token) {
  throw new Error('DISCORD_TOKEN environment variable is required');
}

module.exports = config;
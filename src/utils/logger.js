const winston = require('winston');
const config = require('../config');

const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'paywallflower' },
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// Always log to console for better visibility
logger.add(new winston.transports.Console({
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message, ...meta }) => {
      // Clean up meta object - remove service and other noise
      const cleanMeta = { ...meta };
      delete cleanMeta.service;
      delete cleanMeta.timestamp;
      
      // Only show meta if it has meaningful content
      const metaKeys = Object.keys(cleanMeta);
      let metaStr = '';
      if (metaKeys.length > 0) {
        // Format meta more cleanly
        const metaParts = [];
        for (const [key, value] of Object.entries(cleanMeta)) {
          if (value !== undefined && value !== null) {
            if (typeof value === 'string' && value.length > 100) {
              metaParts.push(`${key}: ${value.substring(0, 100)}...`);
            } else if (typeof value === 'object') {
              metaParts.push(`${key}: ${JSON.stringify(value)}`);
            } else {
              metaParts.push(`${key}: ${value}`);
            }
          }
        }
        if (metaParts.length > 0) {
          metaStr = ` (${metaParts.join(', ')})`;
        }
      }
      
      return `${timestamp} ${level}: ${message}${metaStr}`;
    })
  )
}));

module.exports = logger;
const { extractUrls } = require('../utils/urlExtractor');
const PaywallBypassService = require('../services/paywallBypassService');
const logger = require('../utils/logger');

class MessageHandler {
  constructor() {
    this.paywallBypassService = new PaywallBypassService();
    this.processingMessages = new Set(); // Prevent duplicate processing
  }

  /**
   * Handles incoming Discord messages
   * @param {Message} message - Discord message object
   */
  async handleMessage(message) {
    // Ignore bot messages and messages without content
    if (message.author.bot || !message.content) {
      return;
    }

    // Prevent duplicate processing of the same message
    if (this.processingMessages.has(message.id)) {
      return;
    }

    try {
      this.processingMessages.add(message.id);

      // Extract URLs from message
      const urls = extractUrls(message.content);
      if (urls.length === 0) {
        return;
      }

      logger.info(`Processing message with ${urls.length} URLs`, {
        messageId: message.id,
        channelId: message.channel.id,
        guildId: message.guild?.id,
        urls: urls
      });

      // Process URLs for paywall bypass
      const results = await this.paywallBypassService.processUrls(urls);

      // Send responses for successful bypasses
      for (const result of results) {
        await this.sendBypassResponse(message, result);
      }

    } catch (error) {
      logger.error('Error handling message', {
        messageId: message.id,
        error: error.message,
        stack: error.stack
      });
    } finally {
      this.processingMessages.delete(message.id);
    }
  }

  /**
   * Sends a response with the bypass result
   * @param {Message} originalMessage - Original Discord message
   * @param {Object} result - Bypass result object
   */
  async sendBypassResponse(originalMessage, result) {
    try {
      let responseContent;

      if (result.method === 'archive') {
        // For archive links, send a simple response
        responseContent = `🔓 **Archive link found:**\n${result.result}`;
      } else if (result.method === 'browser') {
        // For extracted content, send the formatted content
        responseContent = `🔓 **Paywall bypassed:**\n${result.result}`;
      }

      // Send the response
      await originalMessage.reply({
        content: responseContent,
        allowedMentions: { repliedUser: false } // Don't ping the original user
      });

      logger.info('Sent bypass response', {
        originalMessageId: originalMessage.id,
        method: result.method,
        originalUrl: result.originalUrl
      });

    } catch (error) {
      logger.error('Error sending bypass response', {
        originalMessageId: originalMessage.id,
        error: error.message
      });
    }
  }

  /**
   * Handles bot errors
   * @param {Error} error - The error that occurred
   */
  handleError(error) {
    logger.error('Bot error occurred', {
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Handles bot warnings
   * @param {string} warning - Warning message
   */
  handleWarning(warning) {
    logger.warn('Bot warning', { warning });
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    await this.paywallBypassService.cleanup();
  }
}

module.exports = MessageHandler;
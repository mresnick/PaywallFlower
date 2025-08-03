const { extractUrls } = require('../utils/urlExtractor');
const SmartBypassService = require('../services/smartBypassService');
const PaywallBypassService = require('../services/paywallBypassService');
const logger = require('../utils/logger');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const config = require('../config');
const fs = require('fs').promises;
const path = require('path');

class MessageHandler {
  constructor(options = {}) {
    // Use SmartBypassService by default, fallback to legacy service if specified
    if (options.useLegacyService) {
      this.paywallBypassService = new PaywallBypassService();
      this.isSmartService = false;
    } else {
      this.paywallBypassService = new SmartBypassService();
      this.isSmartService = true;
    }
    
    this.processingMessages = new Set(); // Prevent duplicate processing
    this.feedbackData = new Map(); // Store feedback data for button interactions
    this.initialized = false;
    
    // Initialize the service
    this.initialize().catch(error => {
      logger.error('Failed to initialize MessageHandler', { error: error.message });
    });
  }

  /**
   * Initializes the message handler and its services
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Initialize the bypass service if it's the smart service
      if (this.isSmartService) {
        await this.paywallBypassService.initialize();
      }

      // Load user whitelist
      await this.loadUserWhitelist();
      
      this.initialized = true;
      logger.info('MessageHandler initialized successfully', {
        serviceType: this.isSmartService ? 'SmartBypassService' : 'PaywallBypassService'
      });
      
    } catch (error) {
      logger.error('Failed to initialize MessageHandler', { error: error.message });
      throw error;
    }
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
        guildId: message.guild?.id
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

      // Handle different response formats based on service type
      if (this.isSmartService) {
        // SmartBypassService response format
        if (result.method && (result.method.includes('archive') || result.method === 'archive_today' || result.method === 'wayback_machine')) {
          // For archive links, send a simple response
          responseContent = `🔓 **Archive link found (${result.method}):**\n${result.result}`;
        } else if (result.extractedContent) {
          // For extracted content, use the pre-formatted content
          responseContent = result.extractedContent;
        } else if (result.method && (result.method === '12ft_io' || result.method === 'outline_com' || result.method === 'google_cache')) {
          // For bypass service links
          responseContent = `🔓 **Bypass link found (${result.method}):**\n${result.result}`;
        } else {
          // Fallback formatting
          responseContent = `🔓 **Content bypassed via ${result.method}:**\n${result.result}`;
        }
      } else {
        // Legacy PaywallBypassService response format
        if (result.method === 'archive') {
          responseContent = `🔓 **Archive link found:**\n${result.result}`;
        } else if (result.method === 'browser') {
          responseContent = this.formatCondensedContent(result.result);
        }
      }

      // Create feedback buttons
      const feedbackButtons = this.createFeedbackButtons(result.originalUrl);
      
      // Store feedback data for this interaction
      const feedbackId = `feedback_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      this.feedbackData.set(feedbackId, {
        originalUrl: result.originalUrl,
        method: result.method,
        timestamp: Date.now(),
        serviceType: this.isSmartService ? 'smart' : 'legacy'
      });

      // Send the response with buttons
      await originalMessage.reply({
        content: responseContent,
        components: [feedbackButtons],
        allowedMentions: { repliedUser: false } // Don't ping the original user
      });

      logger.debug('Sent bypass response with feedback buttons', {
        method: result.method,
        feedbackId: feedbackId,
        serviceType: this.isSmartService ? 'smart' : 'legacy'
      });

    } catch (error) {
      logger.error('Error sending bypass response', {
        originalMessageId: originalMessage.id,
        error: error.message
      });
    }
  }

  /**
   * Creates feedback buttons for paywall bypass responses
   * @param {string} url - The original URL that was processed
   * @returns {ActionRowBuilder} Action row with feedback buttons
   */
  createFeedbackButtons(url) {
    const feedbackId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`bypass_failed_${feedbackId}`)
          .setLabel('🚫 Bypass Failed')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`not_paywalled_${feedbackId}`)
          .setLabel('❌ Not Paywalled')
          .setStyle(ButtonStyle.Secondary)
      );

    // Store the URL for this feedback ID
    this.feedbackData.set(feedbackId, {
      originalUrl: url,
      timestamp: Date.now()
    });

    return row;
  }

  /**
   * Formats content in a condensed, clean format
   * @param {string} extractedContent - The formatted content from bypass service
   * @returns {string} Condensed content
   */
  formatCondensedContent(extractedContent) {
    const { title, content, originalUrl } = this.parseExtractedContent(extractedContent);
    
    // Create condensed format
    let condensedContent = `🔓 **${title}**\n\n`;
    
    // Add condensed article content
    if (content) {
      // Clean and condense the content
      const cleanContent = this.condenseText(content);
      condensedContent += `${cleanContent}\n\n`;
    }
    
    // Add footer with original URL
    condensedContent += `*Original: ${originalUrl}*`;
    
    return condensedContent;
  }

  /**
   * Parses the extracted content to separate title, content, and URL
   * @param {string} extractedContent - The formatted content from bypass service
   * @returns {Object} Parsed content object
   */
  parseExtractedContent(extractedContent) {
    let title = '';
    let content = '';
    let originalUrl = '';

    // Extract title (first bold line)
    const titleMatch = extractedContent.match(/^\*\*(.*?)\*\*/);
    if (titleMatch) {
      title = titleMatch[1];
    }

    // Extract original URL
    const urlMatch = extractedContent.match(/\*Original URL: (.*?)\*/);
    if (urlMatch) {
      originalUrl = urlMatch[1];
    }

    // Extract content (everything between title and footer)
    const contentStart = extractedContent.indexOf('\n\n') + 2;
    const contentEnd = extractedContent.indexOf('\n\n*Original URL:');
    if (contentStart > 1 && contentEnd > contentStart) {
      content = extractedContent.substring(contentStart, contentEnd).trim();
    }

    return { title, content, originalUrl };
  }

  /**
   * Condenses text by removing excessive whitespace and limiting length
   * @param {string} text - Text to condense
   * @returns {string} Condensed text
   */
  condenseText(text) {
    if (!text) return '';
    
    // Clean the text first
    let condensed = text
      // Remove excessive whitespace and normalize spaces
      .replace(/\s+/g, ' ')
      // Remove multiple consecutive newlines
      .replace(/\n\s*\n\s*\n+/g, '\n\n')
      // Trim whitespace
      .trim();
    
    // Discord message limit is 2000 characters, leave room for title and footer
    const maxLength = 1600;
    
    if (condensed.length <= maxLength) {
      return condensed;
    }
    
    // Truncate at a good breaking point
    let truncated = condensed.substring(0, maxLength);
    
    // Try to break at a sentence end
    const lastSentenceEnd = Math.max(
      truncated.lastIndexOf('. '),
      truncated.lastIndexOf('! '),
      truncated.lastIndexOf('? ')
    );
    
    if (lastSentenceEnd > maxLength * 0.7) {
      truncated = truncated.substring(0, lastSentenceEnd + 1);
    } else {
      // Break at word boundary
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > maxLength * 0.8) {
        truncated = truncated.substring(0, lastSpace);
      }
      truncated += '...';
    }
    
    return truncated;
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
   * Handles Discord interactions (button clicks)
   * @param {Interaction} interaction - Discord interaction object
   */
  async handleInteraction(interaction) {
    if (!interaction.isButton()) {
      return;
    }

    try {
      const customId = interaction.customId;
      
      // Parse feedback button interactions
      if (customId.startsWith('bypass_failed_') || customId.startsWith('not_paywalled_')) {
        await this.handleFeedbackInteraction(interaction);
      }

    } catch (error) {
      logger.error('Error handling interaction', {
        interactionId: interaction.id,
        customId: interaction.customId,
        error: error.message,
        stack: error.stack
      });

      // Try to respond with an error message
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: '❌ An error occurred while processing your feedback.',
            ephemeral: true
          });
        }
      } catch (replyError) {
        logger.error('Failed to send error response', { error: replyError.message });
      }
    }
  }

  /**
   * Handles feedback button interactions
   * @param {ButtonInteraction} interaction - Button interaction object
   */
  async handleFeedbackInteraction(interaction) {
    const customId = interaction.customId;
    const parts = customId.split('_');
    const action = parts[0];
    const response = parts[1];
    const feedbackId = parts.slice(2).join('_'); // Rejoin the remaining parts
    
    // Get the stored feedback data
    const feedbackData = this.feedbackData.get(feedbackId);
    if (!feedbackData) {
      await interaction.reply({
        content: '❌ Feedback session expired. Please try again with a new link.',
        ephemeral: true
      });
      return;
    }

    const { originalUrl } = feedbackData;
    const bypassFailed = action === 'bypass' && response === 'failed';
    const notPaywalled = action === 'not' && response === 'paywalled';

    if (bypassFailed) {
      // User reported bypass failed - blacklist method for this domain
      await this.blacklistMethodForDomain(originalUrl, feedbackData.method);
      
      await interaction.reply({
        content: '📝 Thank you for reporting! We\'ve blacklisted this method for this site and will try other approaches.',
        ephemeral: true
      });
      
      logger.info('Bypass failure reported and method blacklisted', {
        url: originalUrl,
        userId: interaction.user.id,
        method: feedbackData.method || 'unknown'
      });
    } else if (notPaywalled) {
      // User said it wasn't paywalled - add to whitelist
      await this.addToWhitelist(originalUrl);
      
      // Update the original message to reflect the feedback
      await this.updateMessageForNonPaywalled(interaction, originalUrl);
      
      await interaction.reply({
        content: '✅ Thank you! We\'ve added this site to our whitelist and won\'t try to bypass it in the future.',
        ephemeral: true
      });
    }

    // Clean up the feedback data
    this.feedbackData.delete(feedbackId);
    
    // Disable the buttons in the original message
    await this.disableFeedbackButtons(interaction);

    logger.info('Processed feedback', {
      url: originalUrl,
      bypassFailed: bypassFailed,
      notPaywalled: notPaywalled,
      userId: interaction.user.id
    });
  }

  /**
   * Adds a domain to the whitelist
   * @param {string} url - The URL to whitelist
   */
  async addToWhitelist(url) {
    try {
      const { extractDomain } = require('../utils/urlExtractor');
      const domain = extractDomain(url);
      
      if (!domain) {
        logger.warn('Could not extract domain from URL for whitelisting', { url });
        return;
      }

      // Add to the in-memory whitelist
      config.whitelistedDomains.push(domain);
      
      // Also add to the paywall detector service
      this.paywallBypassService.paywallDetector.whitelistedDomains.add(domain);

      // Save to persistent storage (append to config file or separate whitelist file)
      await this.saveWhitelistUpdate(domain);

      logger.info('Added domain to whitelist', { domain, url });

    } catch (error) {
      logger.error('Error adding domain to whitelist', {
        url,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Saves whitelist updates to persistent storage
   * @param {string} domain - The domain to add to persistent storage
   */
  async saveWhitelistUpdate(domain) {
    try {
      const whitelistFile = path.join(__dirname, '../../data/user-whitelist.json');
      
      // Ensure data directory exists
      const dataDir = path.dirname(whitelistFile);
      try {
        await fs.mkdir(dataDir, { recursive: true });
      } catch (mkdirError) {
        // Directory might already exist, ignore error
      }

      let userWhitelist = [];
      
      // Try to read existing whitelist
      try {
        const existingData = await fs.readFile(whitelistFile, 'utf8');
        userWhitelist = JSON.parse(existingData);
      } catch (readError) {
        // File doesn't exist yet, start with empty array
        userWhitelist = [];
      }

      // Add domain if not already present
      if (!userWhitelist.includes(domain)) {
        userWhitelist.push(domain);
        
        // Save updated whitelist
        await fs.writeFile(whitelistFile, JSON.stringify(userWhitelist, null, 2));
        
        logger.debug('Saved domain to user whitelist file', { domain, whitelistFile });
      }

    } catch (error) {
      logger.error('Error saving whitelist update', {
        domain,
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Updates the original message to indicate the site wasn't paywalled
   * @param {ButtonInteraction} interaction - The button interaction
   * @param {string} url - The original URL
   */
  async updateMessageForNonPaywalled(interaction, url) {
    try {
      const originalMessage = interaction.message;
      const { extractDomain } = require('../utils/urlExtractor');
      const domain = extractDomain(url);
      
      // Create short, clean updated content
      const updatedContent = `📝 **Update**: ${domain} has been added to our whitelist. ` +
        `We won't attempt to bypass content from this domain in the future.`;

      // Update the message
      await originalMessage.edit({
        content: updatedContent,
        components: [] // Remove buttons
      });

    } catch (error) {
      logger.error('Error updating message for non-paywalled site', {
        url,
        error: error.message
      });
    }
  }

  /**
   * Disables feedback buttons after interaction
   * @param {ButtonInteraction} interaction - The button interaction
   */
  async disableFeedbackButtons(interaction) {
    try {
      const originalMessage = interaction.message;
      
      // Create disabled buttons
      const disabledRow = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId('disabled_bypass_failed')
            .setLabel('🚫 Bypass Failed')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('disabled_not_paywalled')
            .setLabel('❌ Not Paywalled')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
        );

      // Update the message with disabled buttons
      await originalMessage.edit({
        content: originalMessage.content,
        components: [disabledRow]
      });

    } catch (error) {
      logger.error('Error disabling feedback buttons', {
        error: error.message
      });
    }
  }

  /**
   * Loads user whitelist from persistent storage on startup
   */
  async loadUserWhitelist() {
    try {
      const whitelistFile = path.join(__dirname, '../../data/user-whitelist.json');
      
      try {
        const data = await fs.readFile(whitelistFile, 'utf8');
        const userWhitelist = JSON.parse(data);
        
        // Add user whitelist domains to config and detector
        for (const domain of userWhitelist) {
          if (!config.whitelistedDomains.includes(domain)) {
            config.whitelistedDomains.push(domain);
          }
          
          // Add to the appropriate service's paywall detector
          if (this.paywallBypassService && this.paywallBypassService.paywallDetector) {
            this.paywallBypassService.paywallDetector.whitelistedDomains.add(domain);
          }
        }
        
        logger.info('Loaded user whitelist', {
          count: userWhitelist.length,
          domains: userWhitelist,
          serviceType: this.isSmartService ? 'smart' : 'legacy'
        });
        
      } catch (readError) {
        // File doesn't exist yet, that's okay
        logger.debug('No user whitelist file found, starting fresh');
      }

    } catch (error) {
      logger.error('Error loading user whitelist', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Cleanup method
   */
  async cleanup() {
    try {
      await this.paywallBypassService.cleanup();
      
      // Clean up old feedback data (older than 1 hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000);
      for (const [key, data] of this.feedbackData.entries()) {
        if (data.timestamp < oneHourAgo) {
          this.feedbackData.delete(key);
        }
      }
      
    } catch (error) {
      logger.error('Error during cleanup', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  /**
   * Blacklists a specific method for a domain when user reports bypass failure
   * @param {string} url - The original URL
   * @param {string} methodName - The method that failed
   */
  async blacklistMethodForDomain(url, methodName) {
    try {
      if (!this.isSmartService || !methodName) {
        logger.warn('Cannot blacklist method: not using smart service or no method specified', {
          isSmartService: this.isSmartService,
          methodName
        });
        return;
      }

      const { extractDomain } = require('../utils/urlExtractor');
      const domain = extractDomain(url);
      
      if (!domain) {
        logger.warn('Could not extract domain from URL for method blacklisting', { url });
        return;
      }

      // Get or create domain strategy
      let strategy = this.paywallBypassService.domainStrategies.get(domain);
      
      if (!strategy) {
        strategy = {
          domain,
          preferredMethods: [],
          blacklistedMethods: [],
          lastUpdated: new Date(),
          totalAttempts: 0,
          successfulAttempts: 0
        };
        this.paywallBypassService.domainStrategies.set(domain, strategy);
      }

      // Add method to blacklist if not already there
      if (!strategy.blacklistedMethods.includes(methodName)) {
        strategy.blacklistedMethods.push(methodName);
        strategy.lastUpdated = new Date();
        
        // Remove from preferred methods if it was there
        const preferredIndex = strategy.preferredMethods.indexOf(methodName);
        if (preferredIndex > -1) {
          strategy.preferredMethods.splice(preferredIndex, 1);
        }
        
        logger.info('Method blacklisted for domain based on user feedback', {
          domain,
          method: methodName,
          blacklistedMethods: strategy.blacklistedMethods
        });
      }

    } catch (error) {
      logger.error('Error blacklisting method for domain', {
        url,
        methodName,
        error: error.message,
        stack: error.stack
      });
    }
  }
}

module.exports = MessageHandler;
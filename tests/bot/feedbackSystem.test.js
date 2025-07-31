// Mock config first
jest.mock('../../src/config', () => ({
  whitelistedDomains: ['example.com', 'test.com'],
  logging: {
    level: 'info'
  },
  paywallDomains: ['nytimes.com', 'wsj.com'],
  paywallDetection: {
    strongIndicators: [],
    mediumIndicators: [],
    weakIndicators: [],
    negativeIndicators: [],
    threshold: 8,
    maxWeakIndicatorScore: 3
  }
}));

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

// Mock urlExtractor
jest.mock('../../src/utils/urlExtractor', () => ({
  extractUrls: jest.fn(),
  extractDomain: jest.fn((url) => {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }),
  normalizeUrl: jest.fn((url) => url),
  isMediaFile: jest.fn(() => false)
}));

// Mock PaywallBypassService
jest.mock('../../src/services/paywallBypassService', () => {
  return jest.fn().mockImplementation(() => ({
    paywallDetector: {
      whitelistedDomains: new Set(['example.com', 'test.com'])
    },
    cleanup: jest.fn().mockResolvedValue()
  }));
});

// Mock Discord.js components
jest.mock('discord.js', () => ({
  ActionRowBuilder: jest.fn().mockImplementation(() => ({
    addComponents: jest.fn().mockReturnThis()
  })),
  ButtonBuilder: jest.fn().mockImplementation(() => ({
    setCustomId: jest.fn().mockReturnThis(),
    setLabel: jest.fn().mockReturnThis(),
    setStyle: jest.fn().mockReturnThis(),
    setDisabled: jest.fn().mockReturnThis()
  })),
  ButtonStyle: {
    Success: 'SUCCESS',
    Danger: 'DANGER'
  }
}));

// Mock fs promises
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn()
  }
}));

const MessageHandler = require('../../src/bot/messageHandler');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const fs = require('fs').promises;
const path = require('path');

describe('Feedback System Tests', () => {
  let messageHandler;
  let mockMessage;
  let mockInteraction;

  beforeEach(() => {
    messageHandler = new MessageHandler();
    
    // Mock message object
    mockMessage = {
      id: 'test-message-id',
      author: { bot: false },
      content: 'https://nytimes.com/article/test',
      reply: jest.fn().mockResolvedValue({
        id: 'reply-message-id',
        content: 'Test response',
        edit: jest.fn().mockResolvedValue()
      }),
      channel: { id: 'test-channel-id' },
      guild: { id: 'test-guild-id' }
    };

    // Mock interaction object
    mockInteraction = {
      id: 'test-interaction-id',
      customId: 'paywalled_no_123456789_abcdef123',
      isButton: jest.fn().mockReturnValue(true),
      user: { id: 'test-user-id' },
      reply: jest.fn().mockResolvedValue(),
      message: {
        content: 'Original message content',
        edit: jest.fn().mockResolvedValue()
      },
      replied: false,
      deferred: false
    };

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('createFeedbackButtons', () => {
    test('should create feedback buttons with correct structure', () => {
      const url = 'https://nytimes.com/article/test';
      const buttons = messageHandler.createFeedbackButtons(url);

      expect(ActionRowBuilder).toHaveBeenCalled();
      expect(ButtonBuilder).toHaveBeenCalledTimes(2);
      
      // Check that feedback data was stored
      expect(messageHandler.feedbackData.size).toBeGreaterThan(0);
    });

    test('should store feedback data with correct structure', () => {
      const url = 'https://nytimes.com/article/test';
      messageHandler.createFeedbackButtons(url);

      const feedbackEntries = Array.from(messageHandler.feedbackData.values());
      expect(feedbackEntries).toHaveLength(1);
      expect(feedbackEntries[0]).toMatchObject({
        originalUrl: url,
        timestamp: expect.any(Number)
      });
    });
  });

  describe('handleInteraction', () => {
    test('should handle button interactions', async () => {
      // Set up feedback data
      const feedbackId = '123456789_abcdef123';
      messageHandler.feedbackData.set(feedbackId, {
        originalUrl: 'https://nytimes.com/article/test',
        timestamp: Date.now()
      });

      // Mock the methods that will be called
      messageHandler.disableFeedbackButtons = jest.fn().mockResolvedValue();

      await messageHandler.handleInteraction(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalled();
    });

    test('should ignore non-button interactions', async () => {
      mockInteraction.isButton.mockReturnValue(false);

      await messageHandler.handleInteraction(mockInteraction);

      expect(mockInteraction.reply).not.toHaveBeenCalled();
    });

    test('should handle expired feedback sessions', async () => {
      mockInteraction.customId = 'paywalled_no_expired_session';

      await messageHandler.handleInteraction(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '❌ Feedback session expired. Please try again with a new link.',
        ephemeral: true
      });
    });
  });

  describe('handleFeedbackInteraction', () => {
    beforeEach(() => {
      const feedbackId = '123456789_abcdef123';
      messageHandler.feedbackData.set(feedbackId, {
        originalUrl: 'https://nytimes.com/article/test',
        timestamp: Date.now()
      });
      
      // Mock the methods that will be called
      messageHandler.disableFeedbackButtons = jest.fn().mockResolvedValue();
    });

    test('should handle "was paywalled" feedback', async () => {
      mockInteraction.customId = 'paywalled_yes_123456789_abcdef123';

      await messageHandler.handleFeedbackInteraction(mockInteraction);

      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '✅ Thank you for confirming! This helps improve our paywall detection.',
        ephemeral: true
      });
    });

    test('should handle "not paywalled" feedback and add to whitelist', async () => {
      mockInteraction.customId = 'paywalled_no_123456789_abcdef123';
      
      // Mock the addToWhitelist method
      messageHandler.addToWhitelist = jest.fn().mockResolvedValue();
      messageHandler.updateMessageForNonPaywalled = jest.fn().mockResolvedValue();

      await messageHandler.handleFeedbackInteraction(mockInteraction);

      expect(messageHandler.addToWhitelist).toHaveBeenCalledWith('https://nytimes.com/article/test');
      expect(messageHandler.updateMessageForNonPaywalled).toHaveBeenCalled();
      expect(mockInteraction.reply).toHaveBeenCalledWith({
        content: '✅ Thank you! We\'ve added this site to our whitelist and won\'t try to bypass it in the future.',
        ephemeral: true
      });
    });

    test('should clean up feedback data after processing', async () => {
      const feedbackId = '123456789_abcdef123';
      mockInteraction.customId = `paywalled_yes_${feedbackId}`;

      expect(messageHandler.feedbackData.has(feedbackId)).toBe(true);

      await messageHandler.handleFeedbackInteraction(mockInteraction);

      expect(messageHandler.feedbackData.has(feedbackId)).toBe(false);
    });
  });

  describe('addToWhitelist', () => {
    test('should add domain to whitelist', async () => {
      const url = 'https://newsite.com/article/test';
      
      // Mock the saveWhitelistUpdate method
      messageHandler.saveWhitelistUpdate = jest.fn().mockResolvedValue();

      await messageHandler.addToWhitelist(url);

      expect(messageHandler.saveWhitelistUpdate).toHaveBeenCalledWith('newsite.com');
    });

    test('should handle invalid URLs gracefully', async () => {
      const invalidUrl = 'not-a-valid-url';
      
      messageHandler.saveWhitelistUpdate = jest.fn().mockResolvedValue();

      await messageHandler.addToWhitelist(invalidUrl);

      expect(messageHandler.saveWhitelistUpdate).not.toHaveBeenCalled();
    });
  });

  describe('saveWhitelistUpdate', () => {
    test('should create data directory if it doesn\'t exist', async () => {
      const domain = 'newsite.com';
      
      // Mock fs operations
      fs.mkdir.mockResolvedValue();
      fs.readFile.mockRejectedValue(new Error('File not found'));
      fs.writeFile.mockResolvedValue();

      await messageHandler.saveWhitelistUpdate(domain);

      expect(fs.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('data'),
        { recursive: true }
      );
    });

    test('should save new domain to whitelist file', async () => {
      const domain = 'newsite.com';
      
      // Mock fs operations
      fs.mkdir.mockResolvedValue();
      fs.readFile.mockRejectedValue(new Error('File not found'));
      fs.writeFile.mockResolvedValue();

      await messageHandler.saveWhitelistUpdate(domain);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('user_whitelist.json'),
        JSON.stringify([domain], null, 2)
      );
    });

    test('should append to existing whitelist file', async () => {
      const domain = 'newsite.com';
      const existingWhitelist = ['existing.com'];
      
      // Mock fs operations
      fs.mkdir.mockResolvedValue();
      fs.readFile.mockResolvedValue(JSON.stringify(existingWhitelist));
      fs.writeFile.mockResolvedValue();

      await messageHandler.saveWhitelistUpdate(domain);

      expect(fs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('user_whitelist.json'),
        JSON.stringify([...existingWhitelist, domain], null, 2)
      );
    });

    test('should not duplicate existing domains', async () => {
      const domain = 'existing.com';
      const existingWhitelist = ['existing.com'];
      
      // Mock fs operations
      fs.mkdir.mockResolvedValue();
      fs.readFile.mockResolvedValue(JSON.stringify(existingWhitelist));
      fs.writeFile.mockResolvedValue();

      await messageHandler.saveWhitelistUpdate(domain);

      expect(fs.writeFile).not.toHaveBeenCalled();
    });
  });

  describe('loadUserWhitelist', () => {
    test('should load existing whitelist on startup', async () => {
      const userWhitelist = ['user1.com', 'user2.com'];
      
      fs.readFile.mockResolvedValue(JSON.stringify(userWhitelist));

      await messageHandler.loadUserWhitelist();

      // Check that domains were added to the detector
      expect(messageHandler.paywallBypassService.paywallDetector.whitelistedDomains.has('user1.com')).toBe(true);
      expect(messageHandler.paywallBypassService.paywallDetector.whitelistedDomains.has('user2.com')).toBe(true);
    });

    test('should handle missing whitelist file gracefully', async () => {
      fs.readFile.mockRejectedValue(new Error('File not found'));

      await expect(messageHandler.loadUserWhitelist()).resolves.not.toThrow();
    });
  });

  describe('updateMessageForNonPaywalled', () => {
    test('should update message content with clean explanation', async () => {
      const url = 'https://example.com/article';
      
      await messageHandler.updateMessageForNonPaywalled(mockInteraction, url);

      expect(mockInteraction.message.edit).toHaveBeenCalledWith({
        content: '📝 **Update**: example.com has been added to our whitelist. We won\'t attempt to bypass content from this domain in the future.',
        components: []
      });
    });
  });

  describe('disableFeedbackButtons', () => {
    test('should create disabled buttons', async () => {
      await messageHandler.disableFeedbackButtons(mockInteraction);

      expect(ButtonBuilder).toHaveBeenCalled();
      expect(mockInteraction.message.edit).toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    test('should clean up old feedback data', async () => {
      // Add old feedback data
      const oldTimestamp = Date.now() - (2 * 60 * 60 * 1000); // 2 hours ago
      const recentTimestamp = Date.now() - (30 * 60 * 1000); // 30 minutes ago
      
      messageHandler.feedbackData.set('old_feedback', {
        originalUrl: 'https://old.com',
        timestamp: oldTimestamp
      });
      
      messageHandler.feedbackData.set('recent_feedback', {
        originalUrl: 'https://recent.com',
        timestamp: recentTimestamp
      });

      expect(messageHandler.feedbackData.size).toBe(2);

      await messageHandler.cleanup();

      expect(messageHandler.feedbackData.size).toBe(1);
      expect(messageHandler.feedbackData.has('recent_feedback')).toBe(true);
      expect(messageHandler.feedbackData.has('old_feedback')).toBe(false);
    });
  });
});
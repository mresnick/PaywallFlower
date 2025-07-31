// Mock config first
jest.mock('../../src/config', () => ({
  whitelistedDomains: ['example.com', 'test.com'],
  logging: {
    level: 'info'
  },
  discord: {
    token: 'mock-token'
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

// Mock puppeteer
jest.mock('puppeteer', () => ({}));

// Mock dependencies
jest.mock('../../src/utils/urlExtractor');
jest.mock('../../src/services/paywallBypassService');
jest.mock('../../src/services/browserService');
jest.mock('../../src/services/archiveService');

const MessageHandler = require('../../src/bot/messageHandler');
const { extractUrls } = require('../../src/utils/urlExtractor');
const PaywallBypassService = require('../../src/services/paywallBypassService');

describe('MessageHandler', () => {
  let messageHandler;
  let mockPaywallBypassService;
  let mockMessage;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock PaywallBypassService
    mockPaywallBypassService = {
      processUrls: jest.fn(),
      cleanup: jest.fn()
    };
    PaywallBypassService.mockImplementation(() => mockPaywallBypassService);

    // Create message handler
    messageHandler = new MessageHandler();

    // Mock Discord message object
    mockMessage = {
      id: 'message123',
      content: 'Check out this article: https://example.com/article',
      author: { bot: false },
      channel: { id: 'channel123' },
      guild: { id: 'guild123' },
      reply: jest.fn().mockResolvedValue(undefined)
    };
  });

  describe('handleMessage', () => {
    test('should ignore bot messages', async () => {
      mockMessage.author.bot = true;
      
      await messageHandler.handleMessage(mockMessage);
      
      expect(extractUrls).not.toHaveBeenCalled();
      expect(mockPaywallBypassService.processUrls).not.toHaveBeenCalled();
    });

    test('should ignore messages without content', async () => {
      mockMessage.content = '';
      
      await messageHandler.handleMessage(mockMessage);
      
      expect(extractUrls).not.toHaveBeenCalled();
      expect(mockPaywallBypassService.processUrls).not.toHaveBeenCalled();
    });

    test('should ignore messages with no URLs', async () => {
      extractUrls.mockReturnValue([]);
      
      await messageHandler.handleMessage(mockMessage);
      
      expect(extractUrls).toHaveBeenCalledWith(mockMessage.content);
      expect(mockPaywallBypassService.processUrls).not.toHaveBeenCalled();
    });

    test('should process messages with URLs', async () => {
      const urls = ['https://example.com/article'];
      const results = [
        {
          originalUrl: 'https://example.com/article',
          method: 'archive',
          result: 'https://archive.today/abc123'
        }
      ];

      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockResolvedValue(results);

      await messageHandler.handleMessage(mockMessage);

      expect(extractUrls).toHaveBeenCalledWith(mockMessage.content);
      expect(mockPaywallBypassService.processUrls).toHaveBeenCalledWith(urls);
      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '🔓 **Archive link found:**\nhttps://archive.today/abc123',
        components: expect.any(Array),
        allowedMentions: { repliedUser: false }
      });
    });

    test('should prevent duplicate processing of same message', async () => {
      const urls = ['https://example.com/article'];
      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockResolvedValue([]);

      // Process same message twice simultaneously
      const promise1 = messageHandler.handleMessage(mockMessage);
      const promise2 = messageHandler.handleMessage(mockMessage);

      await Promise.all([promise1, promise2]);

      // Should only be called once
      expect(mockPaywallBypassService.processUrls).toHaveBeenCalledTimes(1);
    });

    test('should handle errors gracefully', async () => {
      const urls = ['https://example.com/article'];
      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockRejectedValue(new Error('Service error'));

      // Should not throw
      await expect(messageHandler.handleMessage(mockMessage)).resolves.toBeUndefined();
    });

    test('should clean up processing set after completion', async () => {
      const urls = ['https://example.com/article'];
      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockResolvedValue([]);

      await messageHandler.handleMessage(mockMessage);

      // Should be able to process the same message again
      await messageHandler.handleMessage(mockMessage);
      expect(mockPaywallBypassService.processUrls).toHaveBeenCalledTimes(2);
    });

    test('should clean up processing set even after error', async () => {
      const urls = ['https://example.com/article'];
      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockRejectedValue(new Error('Service error'));

      await messageHandler.handleMessage(mockMessage);

      // Should be able to process the same message again after error
      mockPaywallBypassService.processUrls.mockResolvedValue([]);
      await messageHandler.handleMessage(mockMessage);
      expect(mockPaywallBypassService.processUrls).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendBypassResponse', () => {
    test('should send archive response correctly', async () => {
      const result = {
        method: 'archive',
        result: 'https://archive.today/abc123'
      };

      await messageHandler.sendBypassResponse(mockMessage, result);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '🔓 **Archive link found:**\nhttps://archive.today/abc123',
        components: expect.any(Array),
        allowedMentions: { repliedUser: false }
      });
    });

    test('should send browser response with condensed formatting', async () => {
      const result = {
        method: 'browser',
        result: '**Test Article**\n\nThis is test content that should be condensed nicely.\n\n*Original URL: https://example.com*\n*Content extracted via PaywallFlower*'
      };

      await messageHandler.sendBypassResponse(mockMessage, result);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '🔓 **Test Article**\n\nThis is test content that should be condensed nicely.\n\n*Original: https://example.com*',
        components: expect.any(Array),
        allowedMentions: { repliedUser: false }
      });
    });

    test('should handle reply errors gracefully', async () => {
      const result = {
        method: 'archive',
        result: 'https://archive.today/abc123'
      };

      mockMessage.reply.mockRejectedValue(new Error('Discord API error'));

      // Should not throw
      await expect(messageHandler.sendBypassResponse(mockMessage, result)).resolves.toBeUndefined();
    });
  });

  describe('formatCondensedContent', () => {
    test('should format content in condensed style', () => {
      const extractedContent = '**Test Article**\n\nThis is some test content with multiple    spaces   and\n\n\nexcessive newlines.\n\n*Original URL: https://example.com*\n*Content extracted via PaywallFlower*';
      
      const result = messageHandler.formatCondensedContent(extractedContent);
      
      expect(result).toBe('🔓 **Test Article**\n\nThis is some test content with multiple spaces and excessive newlines.\n\n*Original: https://example.com*');
    });

    test('should truncate very long content', () => {
      const longContent = 'Very long content. '.repeat(200); // Creates very long text
      const extractedContent = `**Long Article**\n\n${longContent}\n\n*Original URL: https://example.com*\n*Content extracted via PaywallFlower*`;
      
      const result = messageHandler.formatCondensedContent(extractedContent);
      
      expect(result.length).toBeLessThan(2000); // Discord limit
      expect(result).toContain('🔓 **Long Article**');
      expect(result).toContain('*Original: https://example.com*');
    });
  });

  describe('condenseText', () => {
    test('should remove excessive whitespace', () => {
      const text = 'This   has    multiple     spaces\n\n\n\nand newlines.';
      const result = messageHandler.condenseText(text);
      expect(result).toBe('This has multiple spaces and newlines.');
    });

    test('should truncate long text at sentence boundaries', () => {
      const longText = 'First sentence. Second sentence. Third sentence. ' + 'Very long content. '.repeat(100);
      const result = messageHandler.condenseText(longText);
      expect(result.length).toBeLessThan(1600);
      expect(result).toMatch(/\.$|\.\.\.$/); // Should end with period or ellipsis
    });

    test('should handle empty text', () => {
      expect(messageHandler.condenseText('')).toBe('');
      expect(messageHandler.condenseText(null)).toBe('');
      expect(messageHandler.condenseText(undefined)).toBe('');
    });
  });

  describe('handleError', () => {
    test('should log errors', () => {
      const error = new Error('Test error');
      
      // Should not throw
      expect(() => messageHandler.handleError(error)).not.toThrow();
    });
  });

  describe('handleWarning', () => {
    test('should log warnings', () => {
      const warning = 'Test warning';
      
      // Should not throw
      expect(() => messageHandler.handleWarning(warning)).not.toThrow();
    });
  });

  describe('cleanup', () => {
    test('should call paywall bypass service cleanup', async () => {
      await messageHandler.cleanup();
      
      expect(mockPaywallBypassService.cleanup).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', async () => {
      mockPaywallBypassService.cleanup.mockRejectedValue(new Error('Cleanup error'));
      
      // Should not throw
      await expect(messageHandler.cleanup()).resolves.toBeUndefined();
    });
  });

  describe('multiple URL processing', () => {
    test('should process multiple URLs and send multiple responses', async () => {
      const urls = ['https://example.com/article1', 'https://example.com/article2'];
      const results = [
        {
          originalUrl: 'https://example.com/article1',
          method: 'archive',
          result: 'https://archive.today/abc123'
        },
        {
          originalUrl: 'https://example.com/article2',
          method: 'browser',
          result: '**Test Article**\n\nExtracted content\n\n*Original URL: https://example.com/article2*\n*Content extracted via PaywallFlower*'
        }
      ];

      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockResolvedValue(results);

      await messageHandler.handleMessage(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledTimes(2);
      expect(mockMessage.reply).toHaveBeenNthCalledWith(1, {
        content: '🔓 **Archive link found:**\nhttps://archive.today/abc123',
        components: expect.any(Array),
        allowedMentions: { repliedUser: false }
      });
      expect(mockMessage.reply).toHaveBeenNthCalledWith(2, {
        content: '🔓 **Test Article**\n\nExtracted content\n\n*Original: https://example.com/article2*',
        components: expect.any(Array),
        allowedMentions: { repliedUser: false }
      });
    });

    test('should handle empty results array', async () => {
      const urls = ['https://example.com/article'];
      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockResolvedValue([]);

      await messageHandler.handleMessage(mockMessage);

      expect(mockMessage.reply).not.toHaveBeenCalled();
    });
  });
});
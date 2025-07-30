const MessageHandler = require('../../src/bot/messageHandler');

// Mock dependencies
jest.mock('../../src/utils/urlExtractor');
jest.mock('../../src/services/paywallBypassService');

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
        allowedMentions: { repliedUser: false }
      });
    });

    test('should send browser response correctly', async () => {
      const result = {
        method: 'browser',
        result: 'Article content extracted successfully'
      };

      await messageHandler.sendBypassResponse(mockMessage, result);

      expect(mockMessage.reply).toHaveBeenCalledWith({
        content: '🔓 **Paywall bypassed:**\nArticle content extracted successfully',
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
          result: 'Extracted content'
        }
      ];

      extractUrls.mockReturnValue(urls);
      mockPaywallBypassService.processUrls.mockResolvedValue(results);

      await messageHandler.handleMessage(mockMessage);

      expect(mockMessage.reply).toHaveBeenCalledTimes(2);
      expect(mockMessage.reply).toHaveBeenNthCalledWith(1, {
        content: '🔓 **Archive link found:**\nhttps://archive.today/abc123',
        allowedMentions: { repliedUser: false }
      });
      expect(mockMessage.reply).toHaveBeenNthCalledWith(2, {
        content: '🔓 **Paywall bypassed:**\nExtracted content',
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
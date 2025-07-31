const PaywallFlowerBot = require('../src/index');

// Mock Discord.js - already mocked in setup.js but we need to access the mock
const { Client } = require('discord.js');

// Mock dependencies
jest.mock('../src/config', () => ({
  discord: {
    token: 'test-token'
  },
  logging: {
    level: 'DEBUG'
  }
}));

jest.mock('../src/bot/messageHandler');
const MessageHandler = require('../src/bot/messageHandler');

describe('PaywallFlowerBot', () => {
  let mockClient;
  let mockMessageHandler;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock MessageHandler
    mockMessageHandler = {
      handleMessage: jest.fn(),
      handleError: jest.fn(),
      handleWarning: jest.fn(),
      cleanup: jest.fn().mockResolvedValue(undefined)
    };
    MessageHandler.mockImplementation(() => mockMessageHandler);

    // Get the mocked Client constructor
    mockClient = {
      once: jest.fn(),
      on: jest.fn(),
      login: jest.fn().mockResolvedValue(undefined),
      destroy: jest.fn().mockResolvedValue(undefined),
      user: { tag: 'TestBot#1234', id: '123456789' },
      guilds: { cache: { size: 1 } },
      readyAt: new Date() // Add readyAt property to simulate ready state
    };
    Client.mockImplementation(() => mockClient);
  });

  describe('constructor', () => {
    test('should create Discord client with correct intents', () => {
      new PaywallFlowerBot();

      expect(Client).toHaveBeenCalledWith({
        intents: [1, 2, 4] // Guilds, GuildMessages, MessageContent
      });
    });

    test('should create MessageHandler instance', () => {
      new PaywallFlowerBot();

      expect(MessageHandler).toHaveBeenCalled();
    });

    test('should setup event listeners', () => {
      new PaywallFlowerBot();

      expect(mockClient.once).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('messageCreate', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('warn', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
      expect(mockClient.on).toHaveBeenCalledWith('resume', expect.any(Function));
    });
  });

  describe('event handlers', () => {
    let bot;

    beforeEach(() => {
      bot = new PaywallFlowerBot();
    });

    test('should handle ready event', () => {
      const readyHandler = mockClient.once.mock.calls.find(call => call[0] === 'ready')[1];
      
      expect(() => readyHandler()).not.toThrow();
    });

    test('should handle messageCreate event', async () => {
      const messageHandler = mockClient.on.mock.calls.find(call => call[0] === 'messageCreate')[1];
      const mockMessage = { id: 'test-message' };
      
      await messageHandler(mockMessage);
      
      expect(mockMessageHandler.handleMessage).toHaveBeenCalledWith(mockMessage);
    });

    test('should handle error event', () => {
      const errorHandler = mockClient.on.mock.calls.find(call => call[0] === 'error')[1];
      const mockError = new Error('Test error');
      
      expect(() => errorHandler(mockError)).not.toThrow();
    });

    test('should handle warn event', () => {
      const warnHandler = mockClient.on.mock.calls.find(call => call[0] === 'warn')[1];
      const mockWarning = 'Test warning';
      
      expect(() => warnHandler(mockWarning)).not.toThrow();
    });

    test('should handle disconnect event', () => {
      const disconnectHandler = mockClient.on.mock.calls.find(call => call[0] === 'disconnect')[1];
      
      expect(() => disconnectHandler()).not.toThrow();
    });

    test('should handle reconnecting event', () => {
      const reconnectingHandler = mockClient.on.mock.calls.find(call => call[0] === 'reconnecting')[1];
      
      expect(() => reconnectingHandler()).not.toThrow();
    });

    test('should handle resume event', () => {
      const resumeHandler = mockClient.on.mock.calls.find(call => call[0] === 'resume')[1];
      
      expect(() => resumeHandler()).not.toThrow();
    });
  });

  describe('start', () => {
    test('should login to Discord', async () => {
      const bot = new PaywallFlowerBot();
      
      await bot.start();
      
      expect(mockClient.login).toHaveBeenCalledWith('test-token');
    });

    test('should handle login errors', async () => {
      const bot = new PaywallFlowerBot();
      const loginError = new Error('Login failed');
      mockClient.login.mockRejectedValue(loginError);

      // Mock process.exit to prevent actual exit
      const originalExit = process.exit;
      process.exit = jest.fn();

      await bot.start();

      expect(process.exit).toHaveBeenCalledWith(1);
      
      // Restore process.exit
      process.exit = originalExit;
    });
  });

  describe('stop', () => {
    test('should cleanup and destroy client', async () => {
      const bot = new PaywallFlowerBot();
      
      await bot.stop();
      
      expect(mockMessageHandler.cleanup).toHaveBeenCalled();
      expect(mockClient.destroy).toHaveBeenCalled();
    });

    test('should handle cleanup errors gracefully', async () => {
      const bot = new PaywallFlowerBot();
      mockMessageHandler.cleanup.mockRejectedValue(new Error('Cleanup failed'));
      
      // Should not throw
      await expect(bot.stop()).resolves.toBeUndefined();
    });

    test('should handle client destroy errors gracefully', async () => {
      const bot = new PaywallFlowerBot();
      mockClient.destroy.mockRejectedValue(new Error('Destroy failed'));
      
      // Should not throw
      await expect(bot.stop()).resolves.toBeUndefined();
    });
  });

  describe('error handling in message handler', () => {
    test('should handle message handler errors', async () => {
      const bot = new PaywallFlowerBot();
      const messageHandler = mockClient.on.mock.calls.find(call => call[0] === 'messageCreate')[1];
      const mockMessage = { id: 'test-message' };
      
      mockMessageHandler.handleMessage.mockRejectedValue(new Error('Handler error'));
      
      // Should not throw
      await expect(messageHandler(mockMessage)).resolves.toBeUndefined();
    });
  });
});
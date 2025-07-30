// Jest setup file
// This file runs before each test file

// Mock console methods to reduce noise during testing
global.console = {
  ...console,
  // Uncomment to silence console.log during tests
  // log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce logging noise during tests

// Mock Discord.js client for testing
jest.mock('discord.js', () => ({
  Client: jest.fn().mockImplementation(() => ({
    once: jest.fn(),
    on: jest.fn(),
    login: jest.fn().mockResolvedValue(undefined),
    destroy: jest.fn().mockResolvedValue(undefined),
    user: { tag: 'TestBot#1234', id: '123456789' },
    guilds: { cache: { size: 1 } }
  })),
  GatewayIntentBits: {
    Guilds: 1,
    GuildMessages: 2,
    MessageContent: 4
  }
}));

// Mock axios for HTTP requests
jest.mock('axios');
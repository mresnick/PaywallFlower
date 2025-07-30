const { Client, GatewayIntentBits } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');
const MessageHandler = require('./bot/messageHandler');

class PaywallFlowerBot {
  constructor() {
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
      ]
    });

    this.messageHandler = new MessageHandler();
    this.setupEventListeners();
  }

  /**
   * Sets up Discord client event listeners
   */
  setupEventListeners() {
    this.client.once('ready', () => {
      logger.info(`PaywallFlower bot is ready! Logged in as ${this.client.user.tag}`, {
        userId: this.client.user.id,
        guildCount: this.client.guilds.cache.size
      });
    });

    this.client.on('messageCreate', async (message) => {
      await this.messageHandler.handleMessage(message);
    });

    this.client.on('error', (error) => {
      this.messageHandler.handleError(error);
    });

    this.client.on('warn', (warning) => {
      this.messageHandler.handleWarning(warning);
    });

    this.client.on('disconnect', () => {
      logger.warn('Bot disconnected from Discord');
    });

    this.client.on('reconnecting', () => {
      logger.info('Bot reconnecting to Discord');
    });

    this.client.on('resume', () => {
      logger.info('Bot resumed connection to Discord');
    });
  }

  /**
   * Starts the bot
   */
  async start() {
    try {
      logger.info('Starting PaywallFlower bot...');
      await this.client.login(config.discord.token);
    } catch (error) {
      logger.error('Failed to start bot', {
        error: error.message,
        stack: error.stack
      });
      process.exit(1);
    }
  }

  /**
   * Stops the bot gracefully
   */
  async stop() {
    try {
      logger.info('Stopping PaywallFlower bot...');
      await this.messageHandler.cleanup();
      await this.client.destroy();
      logger.info('Bot stopped successfully');
    } catch (error) {
      logger.error('Error stopping bot', {
        error: error.message,
        stack: error.stack
      });
    }
  }
}

// Create and start the bot
const bot = new PaywallFlowerBot();

// Handle process termination gracefully
process.on('SIGINT', async () => {
  logger.info('Received SIGINT, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Received SIGTERM, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise,
    reason: reason
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});

// Start the bot
bot.start().catch((error) => {
  logger.error('Failed to start bot', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
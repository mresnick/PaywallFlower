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
      try {
        await this.messageHandler.handleMessage(message);
      } catch (error) {
        logger.error('Error in messageCreate handler', {
          messageId: message.id,
          error: error.message,
          stack: error.stack
        });
      }
    });

    this.client.on('interactionCreate', async (interaction) => {
      try {
        await this.messageHandler.handleInteraction(interaction);
      } catch (error) {
        logger.error('Error in interactionCreate handler', {
          interactionId: interaction.id,
          error: error.message,
          stack: error.stack
        });
      }
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
      
      // Set a timeout to force exit if graceful shutdown takes too long
      const shutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timed out, forcing exit');
        process.exit(1);
      }, 10000); // 10 second timeout
      
      // Cleanup message handler (includes browser service cleanup)
      if (this.messageHandler) {
        try {
          await this.messageHandler.cleanup();
        } catch (cleanupError) {
          logger.error('Error during message handler cleanup', {
            error: cleanupError.message,
            stack: cleanupError.stack
          });
        }
      }
      
      // Destroy Discord client connection
      if (this.client && this.client.readyAt) {
        try {
          await this.client.destroy();
        } catch (destroyError) {
          logger.error('Error destroying Discord client', {
            error: destroyError.message,
            stack: destroyError.stack
          });
        }
      }
      
      // Clear the timeout since we completed successfully
      clearTimeout(shutdownTimeout);
      
      logger.info('Bot stopped successfully');
    } catch (error) {
      logger.error('Error stopping bot', {
        error: error.message,
        stack: error.stack
      });
      // Don't re-throw - handle gracefully
    }
  }
}

// Export the class for testing
module.exports = PaywallFlowerBot;

// Create and start the bot
const bot = new PaywallFlowerBot();

// Handle process termination gracefully
let isShuttingDown = false;

const gracefulShutdown = async (signal) => {
  if (isShuttingDown) {
    logger.warn(`Already shutting down, ignoring ${signal}`);
    return;
  }
  
  isShuttingDown = true;
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  try {
    await bot.stop();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    logger.error('Error during graceful shutdown', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

// Handle various termination signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Handle Windows-specific signals
process.on('SIGBREAK', () => gracefulShutdown('SIGBREAK'));

// Handle process exit event
process.on('exit', (code) => {
  logger.info(`Process exiting with code: ${code}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', async (reason, promise) => {
  logger.error('Unhandled Rejection at:', {
    promise: promise,
    reason: reason
  });
  
  // For critical unhandled rejections, perform graceful shutdown
  if (reason && reason.code === 'ECONNRESET' ||
      (reason && reason.message && reason.message.includes('WebSocket'))) {
    logger.error('Critical error detected, initiating graceful shutdown');
    await gracefulShutdown('unhandledRejection');
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', async (error) => {
  logger.error('Uncaught Exception:', {
    error: error.message,
    stack: error.stack
  });
  
  // Attempt graceful shutdown for uncaught exceptions
  try {
    await gracefulShutdown('uncaughtException');
  } catch (shutdownError) {
    logger.error('Failed to shutdown gracefully after uncaught exception', {
      shutdownError: shutdownError.message
    });
    process.exit(1);
  }
});

// Handle beforeExit event (last chance to perform async operations)
process.on('beforeExit', (code) => {
  logger.info(`Process about to exit with code: ${code}`);
});

// Start the bot
bot.start().catch((error) => {
  logger.error('Failed to start bot', {
    error: error.message,
    stack: error.stack
  });
  process.exit(1);
});
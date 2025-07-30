# PaywallFlower

A Discord bot that automatically replies to messages containing paywalled links with non-paywalled versions of the content.

## Features

- **Automatic Paywall Detection**: Detects paywalled links from known news sites and uses heuristics to identify new ones
- **Multi-Method Bypass**: Uses a fallback chain of archive services and headless browser extraction
- **Archive Services**: Integrates with archive.today and Wayback Machine
- **Content Extraction**: Uses Puppeteer for direct content extraction as a last resort
- **Rate Limiting**: Built-in rate limiting to prevent abuse
- **Comprehensive Logging**: Detailed logging for monitoring and debugging
- **Docker Support**: Easy deployment with Docker and Docker Compose

## How It Works

1. **Message Monitoring**: Bot monitors Discord messages for URLs
2. **Paywall Detection**: Checks if URLs are from known paywall domains or uses heuristics
3. **Fallback Chain**:
   - First tries archive.today for existing or new archives
   - Falls back to Wayback Machine if archive.today fails
   - Uses headless browser content extraction as final fallback
4. **Response**: Replies with archive links or extracted content

## Installation

### Prerequisites

- Node.js 18 or higher
- Discord Bot Token
- Docker (for containerized deployment)

### Local Development

1. Clone the repository:
```bash
git clone <repository-url>
cd PaywallFlower
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```env
DISCORD_TOKEN=your_discord_bot_token_here
LOG_LEVEL=info
# ... other settings
```

5. Run the bot:
```bash
npm start
```

For development with auto-restart:
```bash
npm run dev
```

### Docker Deployment

#### Using Pre-built Images (Recommended)

The project automatically builds and publishes Docker images on every commit. You can use these pre-built images:

**From GitHub Container Registry:**
```bash
docker pull ghcr.io/yourusername/paywallflower:latest
docker run -d --name paywallflower --env-file .env ghcr.io/yourusername/paywallflower:latest
```

**From Docker Hub:**
```bash
docker pull yourusername/paywallflower:latest
docker run -d --name paywallflower --env-file .env yourusername/paywallflower:latest
```

**With Docker Compose:**
```yaml
# Update docker-compose.yml to use pre-built image
services:
  paywallflower-bot:
    image: ghcr.io/yourusername/paywallflower:latest
    # ... rest of configuration
```

#### Building Locally

1. Create your `.env` file from the example
2. Build and run with Docker Compose:
```bash
docker-compose up -d
```

Or build and run manually:
```bash
docker build -t paywallflower .
docker run -d --name paywallflower --env-file .env paywallflower
```

#### Automated Builds

The project uses GitHub Actions to automatically:
- Build multi-platform Docker images (AMD64 and ARM64)
- Publish to GitHub Container Registry and Docker Hub
- Scan images for security vulnerabilities
- Tag images based on branches and releases

See [`.github/workflows/README.md`](.github/workflows/README.md) for detailed setup instructions.

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Discord bot token (required) | - |
| `LOG_LEVEL` | Logging level (error, warn, info, debug) | `info` |
| `ARCHIVE_TODAY_TIMEOUT` | Timeout for archive.today requests (ms) | `10000` |
| `WAYBACK_TIMEOUT` | Timeout for Wayback Machine requests (ms) | `15000` |
| `PUPPETEER_TIMEOUT` | Timeout for browser operations (ms) | `30000` |
| `MAX_REQUESTS_PER_MINUTE` | Global rate limit | `10` |
| `PUPPETEER_MAX_CONCURRENT` | Max concurrent browser sessions | `2` |
| `PUPPETEER_HEADLESS` | Run browser in headless mode | `true` |

### Discord Bot Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to the "Bot" section and create a bot
4. Copy the bot token to your `.env` file
5. Under "Privileged Gateway Intents", enable:
   - Message Content Intent
6. Generate an invite link with these permissions:
   - Send Messages
   - Read Message History
   - Use Slash Commands (optional)

## Usage

Once the bot is running and added to your Discord server:

1. Post a message containing a paywalled link
2. The bot will automatically detect the paywall and attempt to bypass it
3. If successful, it will reply with either:
   - An archive link (from archive.today or Wayback Machine)
   - The extracted article content (from headless browser)

### Example

```
User: Check out this article: https://www.nytimes.com/2024/01/15/some-article.html

PaywallFlower: 🔓 Archive link found:
https://archive.today/abc123
```

## Monitoring

### Logs

The bot creates detailed logs in the `logs/` directory:
- `combined.log`: All log entries
- `error.log`: Error-level logs only

### Health Checks

The Docker container includes health checks. Monitor with:
```bash
docker ps
docker logs paywallflower-bot
```

## Rate Limiting

The bot includes several rate limiting mechanisms:
- Maximum 3 requests per URL per minute
- Maximum 2 concurrent browser sessions
- Global request limits configurable via environment

## Troubleshooting

### Common Issues

1. **Bot not responding**: Check Discord token and permissions
2. **Archive services failing**: Check network connectivity and timeouts
3. **Browser extraction failing**: Ensure Docker has sufficient resources
4. **High memory usage**: Reduce `PUPPETEER_MAX_CONCURRENT` setting

### Debug Mode

Enable debug logging:
```env
LOG_LEVEL=debug
```

### Docker Issues

Check container logs:
```bash
docker logs paywallflower-bot
```

Restart the container:
```bash
docker-compose restart
```

## Development

### Project Structure

```
src/
├── bot/
│   └── messageHandler.js    # Discord message handling
├── config/
│   └── index.js            # Configuration management
├── services/
│   ├── archiveService.js   # Archive service integration
│   ├── browserService.js   # Puppeteer browser service
│   ├── paywallDetector.js  # Paywall detection logic
│   └── paywallBypassService.js # Main bypass orchestration
├── utils/
│   ├── logger.js           # Logging utilities
│   └── urlExtractor.js     # URL extraction utilities
└── index.js                # Main application entry point
```

### Adding New Archive Services

1. Create a new method in `ArchiveService` class
2. Add it to the fallback chain in `findArchive()` method
3. Update configuration and documentation

### Adding New Paywall Sites

Add domains to the `paywallDomains` array in [`src/config/index.js`](src/config/index.js:29).

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

This bot is for educational and research purposes. Users are responsible for complying with the terms of service of the websites they access and applicable laws in their jurisdiction.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review the logs for error details
3. Open an issue on GitHub with relevant log excerpts

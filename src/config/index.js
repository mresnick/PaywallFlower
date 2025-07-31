require('dotenv').config();

const config = {
  discord: {
    token: process.env.DISCORD_TOKEN,
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
  
  archive: {
    archiveTodayTimeout: parseInt(process.env.ARCHIVE_TODAY_TIMEOUT) || 10000,
    waybackTimeout: parseInt(process.env.WAYBACK_TIMEOUT) || 15000,
    puppeteerTimeout: parseInt(process.env.PUPPETEER_TIMEOUT) || 30000,
  },
  
  rateLimit: {
    maxRequestsPerMinute: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 10,
    puppeteerMaxConcurrent: parseInt(process.env.PUPPETEER_MAX_CONCURRENT) || 2,
  },
  
  puppeteer: {
    headless: process.env.PUPPETEER_HEADLESS !== 'false',
    args: process.env.PUPPETEER_ARGS ? process.env.PUPPETEER_ARGS.split(',') : [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ],
  },
  
  // Known paywall domains
  paywallDomains: [
    'nytimes.com',
    'wsj.com',
    'washingtonpost.com',
    'ft.com',
    'theatlantic.com',
    'economist.com',
    'bloomberg.com',
    'reuters.com',
    'newyorker.com',
    'wired.com',
    'medium.com',
    'substack.com'
  ],
  
  // Domains that should be whitelisted (never considered paywalled)
  // These are domains that might trigger paywall indicators but don't actually have paywalls
  whitelistedDomains: [
    // Social Media
    'x.com',
    'twitter.com',
    'facebook.com',
    'instagram.com',
    'linkedin.com',
    'reddit.com',
    'tiktok.com',
    'pinterest.com',
    'snapchat.com',
    'discord.com',
    'telegram.org',
    'whatsapp.com',
    'mastodon.social',
    'threads.net',
    
    // Video/Streaming Platforms
    'youtube.com',
    'youtu.be',
    'vimeo.com',
    'twitch.tv',
    'dailymotion.com',
    'rumble.com',
    'bitchute.com',
    'odysee.com',
    'netflix.com',
    'hulu.com',
    'disneyplus.com',
    'primevideo.com',
    'hbo.com',
    'hbomax.com',
    'max.com',
    'peacocktv.com',
    'paramountplus.com',
    'appletv.com',
    
    // Tech/Developer Sites
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'stackoverflow.com',
    'stackexchange.com',
    'superuser.com',
    'serverfault.com',
    'askubuntu.com',
    'mathoverflow.net',
    'codepen.io',
    'jsfiddle.net',
    'replit.com',
    'codesandbox.io',
    'glitch.com',
    'npmjs.com',
    'pypi.org',
    'packagist.org',
    'rubygems.org',
    'crates.io',
    'nuget.org',
    'maven.org',
    'dockerhub.com',
    'docker.com',
    
    // Reference/Educational
    'wikipedia.org',
    'wikimedia.org',
    'wiktionary.org',
    'wikiquote.org',
    'wikibooks.org',
    'wikinews.org',
    'wikiversity.org',
    'wikisource.org',
    'wikidata.org',
    'mozilla.org',
    'w3.org',
    'w3schools.com',
    'mdn.mozilla.org',
    'developer.mozilla.org',
    'docs.microsoft.com',
    'docs.google.com',
    'developer.apple.com',
    'android.com',
    'developer.android.com',
    
    // News Aggregators/Free News
    'news.ycombinator.com',
    'hackernews.com',
    'slashdot.org',
    'techmeme.com',
    'allsides.com',
    'ground.news',
    'reuters.com',
    'apnews.com',
    'bbc.com',
    'bbc.co.uk',
    'cnn.com',
    'npr.org',
    'pbs.org',
    'cbsnews.com',
    'abcnews.go.com',
    'nbcnews.com',
    'foxnews.com',
    'usatoday.com',
    'politico.com',
    'axios.com',
    'thehill.com',
    'c-span.org',
    
    // Image/Media Hosting
    'imgur.com',
    'giphy.com',
    'tenor.com',
    'flickr.com',
    'unsplash.com',
    'pexels.com',
    'pixabay.com',
    'shutterstock.com',
    'gettyimages.com',
    'cloudinary.com',
    'imagekit.io',
    'tinypic.com',
    'photobucket.com',
    'imageshack.com',
    'postimg.cc',
    'imgbb.com',
    'i.redd.it',
    'i.imgur.com',
    'media.giphy.com',
    'media.tenor.com',
    
    // File Sharing/Cloud Storage
    'dropbox.com',
    'drive.google.com',
    'onedrive.live.com',
    'icloud.com',
    'box.com',
    'mega.nz',
    'mediafire.com',
    'rapidshare.com',
    'sendspace.com',
    'wetransfer.com',
    'filebin.net',
    'pastebin.com',
    'hastebin.com',
    'gist.github.com',
    
    // Archives
    'archive.org',
    'archive.today',
    'web.archive.org',
    'archive.is',
    'archive.ph',
    'wayback.archive.org',
    
    // Gaming
    'steam.com',
    'steamcommunity.com',
    'epicgames.com',
    'gog.com',
    'itch.io',
    'gamejolt.com',
    'mixer.com',
    
    // Music/Audio
    'spotify.com',
    'soundcloud.com',
    'bandcamp.com',
    'last.fm',
    'genius.com',
    'musixmatch.com',
    'lyrics.com',
    'azlyrics.com',
    
    // Misc Popular Sites
    'amazon.com',
    'ebay.com',
    'etsy.com',
    'craigslist.org',
    'indeed.com',
    'glassdoor.com',
    'yelp.com',
    'tripadvisor.com',
    'booking.com',
    'airbnb.com',
    'zillow.com',
    'realtor.com',
    'weather.com',
    'accuweather.com',
    'imdb.com',
    'rottentomatoes.com',
    'metacritic.com',
    'goodreads.com',
    'urbandictionary.com',
    'knowyourmeme.com'
  ],
  
  // File extensions that should never be considered paywalled (images, videos, audio, etc.)
  mediaFileExtensions: [
    // Images
    'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'tiff', 'tif', 'ico', 'avif', 'heic', 'heif',
    // Videos
    'mp4', 'avi', 'mov', 'wmv', 'flv', 'webm', 'mkv', 'm4v', '3gp', 'ogv', 'ts', 'm3u8',
    // Audio
    'mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus',
    // Documents (often direct file downloads, not paywalled content)
    'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'rtf', 'csv',
    // Archives
    'zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz',
    // Other media/binary files
    'swf', 'exe', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'ipa'
  ],
  
  // Paywall detection heuristics with weighted scoring
  paywallDetection: {
    // Strong paywall indicators (high confidence)
    strongIndicators: [
      { text: 'paywall', weight: 10 },
      { text: 'subscriber-only', weight: 10 },
      { text: 'premium content', weight: 9 },
      { text: 'subscription required', weight: 9 },
      { text: 'register to read', weight: 8 },
      { text: 'continue reading', weight: 8 },
      { text: 'unlock this article', weight: 8 },
      { text: 'become a member', weight: 7 },
      { text: 'subscribe to continue', weight: 8 },
      { text: 'free articles remaining', weight: 9 },
      { text: 'article limit reached', weight: 9 },
      { text: 'premium subscription', weight: 7 }
    ],
    
    // Medium paywall indicators (moderate confidence)
    mediumIndicators: [
      { text: 'subscribe', weight: 4 },
      { text: 'membership', weight: 4 },
      { text: 'premium', weight: 3 },
      { text: 'subscriber', weight: 4 },
      { text: 'full access', weight: 3 },
      { text: 'unlimited access', weight: 4 },
      { text: 'digital subscription', weight: 5 }
    ],
    
    // Weak paywall indicators (low confidence, common on many sites)
    weakIndicators: [
      { text: 'sign up', weight: 1 },
      { text: 'register', weight: 1 },
      { text: 'join', weight: 1 },
      { text: 'account', weight: 1 }
    ],
    
    // Negative indicators (reduce paywall score)
    negativeIndicators: [
      { text: 'free', weight: -3 },
      { text: 'no subscription', weight: -5 },
      { text: 'always free', weight: -5 },
      { text: 'open access', weight: -4 },
      { text: 'public domain', weight: -4 },
      { text: 'creative commons', weight: -3 },
      { text: 'free to read', weight: -4 },
      { text: 'no paywall', weight: -8 },
      { text: 'free article', weight: -4 },
      { text: 'complimentary access', weight: -3 }
    ],
    
    // Context-specific indicators (only count if in specific contexts)
    contextIndicators: {
      // These only count if found in navigation, headers, or prominent UI elements
      navigation: [
        { text: 'subscribe', weight: 6 },
        { text: 'premium', weight: 5 },
        { text: 'membership', weight: 5 }
      ],
      // These only count if found in article content area
      content: [
        { text: 'continue reading', weight: 8 },
        { text: 'read more', weight: 2 },
        { text: 'full story', weight: 3 }
      ]
    },
    
    // Minimum score threshold for paywall detection
    threshold: 8,
    
    // Maximum score from weak indicators to prevent false positives
    maxWeakIndicatorScore: 3
  }
};

// Validation
if (!config.discord.token) {
  throw new Error('DISCORD_TOKEN environment variable is required');
}

module.exports = config;
const PaywallDetectorService = require('../../src/services/paywallDetector');

describe('Whitelist Integration Tests', () => {
  let detector;

  beforeEach(() => {
    detector = new PaywallDetectorService();
  });

  describe('whitelisted domains', () => {
    const whitelistedUrls = [
      // Original whitelist
      'https://x.com/some-tweet',
      'https://twitter.com/user/status/123',
      'https://facebook.com/post/123',
      'https://instagram.com/p/abc123',
      'https://linkedin.com/posts/activity-123',
      'https://reddit.com/r/programming/comments/abc',
      'https://youtube.com/watch?v=abc123',
      'https://github.com/user/repo',
      
      // New streaming platforms
      'https://youtu.be/abc123',
      'https://vimeo.com/123456',
      'https://twitch.tv/streamer',
      'https://netflix.com/title/123',
      
      // New tech sites
      'https://stackoverflow.com/questions/123',
      'https://docs.microsoft.com/guide',
      'https://developer.mozilla.org/docs',
      
      // New news aggregators
      'https://news.ycombinator.com/item?id=123',
      'https://bbc.com/news/article',
      'https://reuters.com/article/123',
      
      // New image/media hosting
      'https://imgur.com/abc123',
      'https://giphy.com/gifs/abc123',
      'https://i.imgur.com/abc123.gif',
      
      // New file sharing
      'https://drive.google.com/file/d/123',
      'https://dropbox.com/s/abc123',
      
      // New gaming
      'https://steam.com/app/123',
      'https://epicgames.com/store/game'
    ];

    test.each(whitelistedUrls)('should not detect paywall for whitelisted domain: %s', async (url) => {
      const isPaywalled = await detector.isPaywalled(url);
      expect(isPaywalled).toBe(false);
    });

    test('should return false for all whitelisted domains', async () => {
      const results = await Promise.all(
        whitelistedUrls.map(url => detector.isPaywalled(url))
      );
      
      expect(results.every(result => result === false)).toBe(true);
    });
  });

  describe('known paywall domains', () => {
    const paywallUrls = [
      'https://nytimes.com/article/123',
      'https://wsj.com/articles/123',
      'https://washingtonpost.com/news/123'
    ];

    test.each(paywallUrls)('should detect paywall for known paywall domain: %s', async (url) => {
      const isPaywalled = await detector.isPaywalled(url);
      expect(isPaywalled).toBe(true);
    });

    test('should return true for all known paywall domains', async () => {
      const results = await Promise.all(
        paywallUrls.map(url => detector.isPaywalled(url))
      );
      
      expect(results.every(result => result === true)).toBe(true);
    });
  });

  describe('whitelist priority', () => {
    test('should prioritize whitelist over known paywall domains', async () => {
      // Add a whitelisted domain to known paywall domains
      detector.addPaywallDomain('github.com');
      
      // Should still return false because whitelist has higher priority
      const isPaywalled = await detector.isPaywalled('https://github.com/user/repo');
      expect(isPaywalled).toBe(false);
    });
  });

  describe('domain extraction', () => {
    test('should handle www prefixes correctly', async () => {
      const withoutWww = await detector.isPaywalled('https://github.com/user/repo');
      const withWww = await detector.isPaywalled('https://www.github.com/user/repo');
      
      expect(withoutWww).toBe(withWww);
    });

    test('should handle different protocols', async () => {
      const https = await detector.isPaywalled('https://github.com/user/repo');
      const http = await detector.isPaywalled('http://github.com/user/repo');
      
      expect(https).toBe(http);
    });

    test('should handle query parameters and fragments', async () => {
      const simple = await detector.isPaywalled('https://github.com/user/repo');
      const withQuery = await detector.isPaywalled('https://github.com/user/repo?tab=readme');
      const withFragment = await detector.isPaywalled('https://github.com/user/repo#installation');
      
      expect(simple).toBe(withQuery);
      expect(simple).toBe(withFragment);
    });
  });

  describe('error handling', () => {
    test('should handle invalid URLs gracefully', async () => {
      const invalidUrls = [
        'not-a-url',
        '',
        'ftp://invalid-protocol.com',
        'javascript:alert("xss")'
      ];

      for (const url of invalidUrls) {
        const isPaywalled = await detector.isPaywalled(url);
        expect(typeof isPaywalled).toBe('boolean');
      }
    });
  });

  describe('performance', () => {
    test('should process whitelisted domains quickly', async () => {
      const start = Date.now();
      
      await Promise.all([
        detector.isPaywalled('https://github.com/user/repo'),
        detector.isPaywalled('https://youtube.com/watch?v=abc'),
        detector.isPaywalled('https://reddit.com/r/test'),
        detector.isPaywalled('https://twitter.com/user/status/123')
      ]);
      
      const duration = Date.now() - start;
      
      // Should be very fast since no HTTP requests are made for whitelisted domains
      expect(duration).toBeLessThan(100);
    });

    test('should process known paywall domains quickly', async () => {
      const start = Date.now();
      
      await Promise.all([
        detector.isPaywalled('https://nytimes.com/article/123'),
        detector.isPaywalled('https://wsj.com/articles/123'),
        detector.isPaywalled('https://washingtonpost.com/news/123')
      ]);
      
      const duration = Date.now() - start;
      
      // Should be fast since no HTTP requests are made for known domains
      expect(duration).toBeLessThan(100);
    });
  });

  describe('media file detection', () => {
    const mediaFileUrls = [
      // Images
      'https://example.com/image.jpg',
      'https://example.com/photo.png',
      'https://example.com/animation.gif',
      'https://example.com/vector.svg',
      'https://example.com/modern.webp',
      'https://i.imgur.com/abc123.gif',
      'https://media.giphy.com/media/abc123/giphy.gif',
      
      // Videos
      'https://example.com/video.mp4',
      'https://example.com/movie.avi',
      'https://example.com/clip.mov',
      'https://example.com/stream.webm',
      
      // Audio
      'https://example.com/song.mp3',
      'https://example.com/audio.wav',
      'https://example.com/music.flac',
      
      // Documents
      'https://example.com/document.pdf',
      'https://example.com/spreadsheet.xlsx',
      'https://example.com/presentation.pptx',
      
      // Archives
      'https://example.com/archive.zip',
      'https://example.com/backup.tar.gz',
      
      // URLs with query parameters
      'https://example.com/image.jpg?v=123&size=large',
      'https://example.com/video.mp4#t=30',
      
      // Case insensitive
      'https://example.com/IMAGE.JPG',
      'https://example.com/Video.MP4'
    ];

    test.each(mediaFileUrls)('should not detect paywall for media file: %s', async (url) => {
      const isPaywalled = await detector.isPaywalled(url);
      expect(isPaywalled).toBe(false);
    });

    test('should return false for all media file URLs', async () => {
      const results = await Promise.all(
        mediaFileUrls.map(url => detector.isPaywalled(url))
      );
      
      expect(results.every(result => result === false)).toBe(true);
    });

    test('should prioritize media file detection over known paywall domains', async () => {
      // Add a known paywall domain
      detector.addPaywallDomain('example.com');
      
      // Should still return false for media files from that domain
      const isPaywalled = await detector.isPaywalled('https://example.com/image.jpg');
      expect(isPaywalled).toBe(false);
    });

    test('should handle URLs without extensions correctly', async () => {
      const nonMediaUrls = [
        'https://example.com/article',
        'https://example.com/page/',
        'https://example.com/news/story',
        'https://example.com/'
      ];

      // These should go through normal paywall detection (not automatically return false)
      for (const url of nonMediaUrls) {
        // We can't predict the exact result, but it should not crash
        const result = await detector.isPaywalled(url);
        expect(typeof result).toBe('boolean');
      }
    });
  });
});
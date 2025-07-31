const { extractUrls, normalizeUrl, extractDomain, isMediaFile } = require('../../src/utils/urlExtractor');

describe('urlExtractor', () => {
  describe('extractUrls', () => {
    test('should extract single URL from message', () => {
      const content = 'Check out this article: https://example.com/article';
      const urls = extractUrls(content);
      expect(urls).toEqual(['https://example.com/article']);
    });

    test('should extract multiple URLs from message', () => {
      const content = 'Visit https://example.com and also https://test.org/page';
      const urls = extractUrls(content);
      expect(urls).toEqual(['https://example.com', 'https://test.org/page']);
    });

    test('should extract URLs with www prefix', () => {
      const content = 'Go to https://www.example.com/path';
      const urls = extractUrls(content);
      expect(urls).toEqual(['https://www.example.com/path']);
    });

    test('should extract URLs with query parameters', () => {
      const content = 'Link: https://example.com/search?q=test&page=1';
      const urls = extractUrls(content);
      expect(urls).toEqual(['https://example.com/search?q=test&page=1']);
    });

    test('should return empty array when no URLs found', () => {
      const content = 'This message has no URLs';
      const urls = extractUrls(content);
      expect(urls).toEqual([]);
    });

    test('should handle http URLs', () => {
      const content = 'Visit http://example.com';
      const urls = extractUrls(content);
      expect(urls).toEqual(['http://example.com']);
    });

    test('should extract URLs with fragments', () => {
      const content = 'See https://example.com/page#section1';
      const urls = extractUrls(content);
      expect(urls).toEqual(['https://example.com/page#section1']);
    });
  });

  describe('normalizeUrl', () => {
    test('should remove tracking parameters', () => {
      const url = 'https://example.com/article?utm_source=twitter&utm_campaign=test&content=main';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('https://example.com/article?content=main');
    });

    test('should remove fragment', () => {
      const url = 'https://example.com/page#section1';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('https://example.com/page');
    });

    test('should remove multiple tracking parameters', () => {
      const url = 'https://example.com/page?utm_source=fb&fbclid=123&gclid=456&ref=home';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('https://example.com/page');
    });

    test('should preserve non-tracking parameters', () => {
      const url = 'https://example.com/search?q=test&page=2&utm_source=google';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('https://example.com/search?q=test&page=2');
    });

    test('should handle invalid URLs gracefully', () => {
      const invalidUrl = 'not-a-url';
      const normalized = normalizeUrl(invalidUrl);
      expect(normalized).toBe(invalidUrl);
    });

    test('should handle URLs without parameters', () => {
      const url = 'https://example.com/page';
      const normalized = normalizeUrl(url);
      expect(normalized).toBe('https://example.com/page');
    });
  });

  describe('extractDomain', () => {
    test('should extract domain from simple URL', () => {
      const url = 'https://example.com/path';
      const domain = extractDomain(url);
      expect(domain).toBe('example.com');
    });

    test('should remove www prefix', () => {
      const url = 'https://www.example.com/path';
      const domain = extractDomain(url);
      expect(domain).toBe('example.com');
    });

    test('should handle subdomains', () => {
      const url = 'https://blog.example.com/post';
      const domain = extractDomain(url);
      expect(domain).toBe('blog.example.com');
    });

    test('should handle different ports', () => {
      const url = 'https://example.com:8080/path';
      const domain = extractDomain(url);
      expect(domain).toBe('example.com');
    });

    test('should handle http URLs', () => {
      const url = 'http://example.com/path';
      const domain = extractDomain(url);
      expect(domain).toBe('example.com');
    });

    test('should return null for invalid URLs', () => {
      const invalidUrl = 'not-a-url';
      const domain = extractDomain(invalidUrl);
      expect(domain).toBeNull();
    });

    test('should handle URLs with query parameters', () => {
      const url = 'https://example.com/search?q=test';
      const domain = extractDomain(url);
      expect(domain).toBe('example.com');
    });

    test('should handle URLs with fragments', () => {
      const url = 'https://example.com/page#section';
      const domain = extractDomain(url);
      expect(domain).toBe('example.com');
    });
  });

  describe('isMediaFile', () => {
    test('should detect image files', () => {
      const imageUrls = [
        'https://example.com/photo.jpg',
        'https://example.com/image.png',
        'https://example.com/animation.gif',
        'https://example.com/vector.svg',
        'https://example.com/modern.webp',
        'https://example.com/bitmap.bmp',
        'https://example.com/icon.ico'
      ];

      imageUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should detect video files', () => {
      const videoUrls = [
        'https://example.com/video.mp4',
        'https://example.com/movie.avi',
        'https://example.com/clip.mov',
        'https://example.com/stream.webm',
        'https://example.com/film.mkv',
        'https://example.com/mobile.3gp'
      ];

      videoUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should detect audio files', () => {
      const audioUrls = [
        'https://example.com/song.mp3',
        'https://example.com/audio.wav',
        'https://example.com/music.flac',
        'https://example.com/sound.aac',
        'https://example.com/voice.ogg',
        'https://example.com/track.m4a'
      ];

      audioUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should detect document files', () => {
      const documentUrls = [
        'https://example.com/document.pdf',
        'https://example.com/report.doc',
        'https://example.com/spreadsheet.xlsx',
        'https://example.com/presentation.pptx',
        'https://example.com/data.csv',
        'https://example.com/readme.txt'
      ];

      documentUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should detect archive files', () => {
      const archiveUrls = [
        'https://example.com/archive.zip',
        'https://example.com/backup.rar',
        'https://example.com/package.tar.gz',
        'https://example.com/compressed.7z'
      ];

      archiveUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should be case insensitive', () => {
      const mixedCaseUrls = [
        'https://example.com/IMAGE.JPG',
        'https://example.com/Video.MP4',
        'https://example.com/AUDIO.MP3',
        'https://example.com/Document.PDF'
      ];

      mixedCaseUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should handle URLs with query parameters', () => {
      const urlsWithParams = [
        'https://example.com/image.jpg?v=123&size=large',
        'https://example.com/video.mp4?t=30&quality=hd',
        'https://example.com/audio.mp3?playlist=favorites'
      ];

      urlsWithParams.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should handle URLs with fragments', () => {
      const urlsWithFragments = [
        'https://example.com/image.jpg#gallery',
        'https://example.com/video.mp4#t=30',
        'https://example.com/document.pdf#page=5'
      ];

      urlsWithFragments.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });

    test('should not detect non-media files', () => {
      const nonMediaUrls = [
        'https://example.com/article',
        'https://example.com/page.html',
        'https://example.com/api/data.json',
        'https://example.com/script.js',
        'https://example.com/style.css',
        'https://example.com/page/',
        'https://example.com/'
      ];

      nonMediaUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(false);
      });
    });

    test('should handle URLs without extensions', () => {
      const urlsWithoutExtensions = [
        'https://example.com/article',
        'https://example.com/page/',
        'https://example.com/',
        'https://example.com/api/endpoint'
      ];

      urlsWithoutExtensions.forEach(url => {
        expect(isMediaFile(url)).toBe(false);
      });
    });

    test('should handle URLs ending with dot', () => {
      const urlsEndingWithDot = [
        'https://example.com/file.',
        'https://example.com/page.'
      ];

      urlsEndingWithDot.forEach(url => {
        expect(isMediaFile(url)).toBe(false);
      });
    });

    test('should handle invalid URLs gracefully', () => {
      const invalidUrls = [
        'not-a-url',
        '',
        'ftp://example.com/file.jpg',
        'javascript:alert("test")'
      ];

      invalidUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(false);
      });
    });

    test('should handle real-world media URLs', () => {
      const realWorldUrls = [
        'https://i.imgur.com/abc123.gif',
        'https://media.giphy.com/media/abc123/giphy.gif',
        'https://i.redd.it/abc123.jpg',
        'https://pbs.twimg.com/media/abc123.jpg',
        'https://cdn.discordapp.com/attachments/123/456/image.png'
      ];

      realWorldUrls.forEach(url => {
        expect(isMediaFile(url)).toBe(true);
      });
    });
  });
});
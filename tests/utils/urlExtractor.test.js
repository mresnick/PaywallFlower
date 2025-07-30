const { extractUrls, normalizeUrl, extractDomain } = require('../../src/utils/urlExtractor');

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
});
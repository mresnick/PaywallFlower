# PaywallFlower Tests

This directory contains the test suite for the PaywallFlower Discord bot.

## Test Structure

```
tests/
├── setup.js                    # Jest setup and global mocks
├── bot/
│   └── messageHandler.test.js  # Tests for Discord message handling
├── services/
│   └── paywallDetector.test.js # Tests for paywall detection service
├── utils/
│   └── urlExtractor.test.js    # Tests for URL extraction utilities
├── integration/
│   └── whitelist.test.js       # Integration tests for whitelist functionality
└── index.test.js               # Tests for main bot class
```

## Running Tests

### Prerequisites

First, install the dependencies:

```bash
npm install
```

### Run All Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Run Tests with Coverage

```bash
npm run test:coverage
```

### Run Specific Test Files

```bash
# Run only URL extractor tests
npx jest tests/utils/urlExtractor.test.js

# Run only paywall detector tests
npx jest tests/services/paywallDetector.test.js

# Run only integration tests
npx jest tests/integration/
```

## Test Categories

### Unit Tests
- **urlExtractor.test.js**: Tests URL extraction, normalization, and domain extraction functions
- **paywallDetector.test.js**: Tests paywall detection logic, whitelist checking, and heuristic detection
- **messageHandler.test.js**: Tests Discord message processing and response handling
- **index.test.js**: Tests main bot initialization and lifecycle

### Integration Tests
- **whitelist.test.js**: Tests the complete whitelist functionality with real domain checking

## Mocking Strategy

The test suite uses comprehensive mocking to isolate units under test:

- **Discord.js**: Mocked to prevent actual Discord API calls
- **Axios**: Mocked for HTTP request testing
- **Config**: Mocked with test-specific configurations
- **Logger**: Silenced during tests to reduce noise

## Test Environment

Tests run in a Node.js environment with the following setup:
- Environment variables set to test values
- Console logging reduced to errors only
- All external dependencies mocked

## Coverage

The test suite aims for high coverage of:
- Core business logic
- Error handling paths
- Edge cases and boundary conditions
- Integration between components

## Writing New Tests

When adding new tests:

1. Place unit tests in the appropriate subdirectory matching the source structure
2. Use descriptive test names that explain the expected behavior
3. Mock external dependencies appropriately
4. Test both success and error scenarios
5. Include edge cases and boundary conditions

### Example Test Structure

```javascript
describe('ComponentName', () => {
  let component;

  beforeEach(() => {
    // Setup before each test
    component = new ComponentName();
  });

  describe('methodName', () => {
    test('should handle normal case', () => {
      // Test implementation
    });

    test('should handle error case', () => {
      // Test error handling
    });
  });
});
```

## Debugging Tests

To debug failing tests:

1. Run tests in verbose mode: `npm test -- --verbose`
2. Run a specific test: `npx jest -t "test name"`
3. Use `console.log` for debugging (temporarily uncomment in setup.js)
4. Check mock call history: `expect(mockFunction).toHaveBeenCalledWith(...)`
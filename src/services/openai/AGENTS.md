# OpenAIService Agent Guidelines

## Overview

The OpenAIService handles OpenAI API integration for chat completion and image generation. It manages API requests, error handling, rate limiting, and response processing.

## Key Responsibilities

- OpenAI API integration (chat completion and image generation)
- Prompt injection and message formatting
- Error handling and rate limit management
- Response processing and formatting
- Model configuration and parameter management

## Core Functionality

### Chat Completion

- Text generation using OpenAI's chat models
- System prompt injection and conversation context management
- Streaming and non-streaming response handling

### Image Generation

- OpenAI gpt-image-1 model for image generation
- Image prompt processing and parameter configuration
- Image URL handling and response formatting

## Architecture Notes

- Uses class-based TypeScript with private `_underscore` properties
- Implements OpenAI SDK for API communication
- Handles both synchronous and asynchronous operations
- Integrates with environment configuration for API keys and model selection

## Environment Variables

- `OPENAI_API_KEY` - OpenAI API authentication key
- `OPENAI_MODEL` - Default model for chat completion
- Additional model-specific configuration as needed

## Common Tasks

| Task                       | Action                                    | Notes                                        |
| -------------------------- | ----------------------------------------- | -------------------------------------------- |
| Add OpenAI model support   | Add model ID, update API payload/env vars | Update model configuration and validation    |
| Modify prompt injection    | Update system prompt handling             | Consider conversation context preservation   |
| Handle new OpenAI features | Extend API integration                    | Follow OpenAI SDK patterns                   |
| Update error handling      | Modify error catching and logging         | Handle rate limits and API errors gracefully |

## Testing

- Unit tests in `index.test.ts`
- Mock OpenAI SDK responses for reliable testing
- Test both success and error scenarios
- Validate prompt formatting and response processing

## Error Handling

- Graceful handling of API rate limits
- Retry logic for transient failures
- Meaningful error logging and user feedback
- Fallback behavior for API unavailability

## Dependencies

- OpenAI SDK for API communication
- Environment configuration management
- Integration with RooivalkService for business logic
- Access to shared types and constants

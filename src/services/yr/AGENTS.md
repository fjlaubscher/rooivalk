# YrService Agent Guidelines

## Overview

The YrService fetches and summarizes weather data from Yr.no for predefined locations. It provides weather information that is used by RooivalkService for MOTD (Message of the Day) and enhanced responses.

## Key Responsibilities

- Weather data fetching from Yr.no API
- Weather data summarization and formatting
- Location-based weather management
- Integration with RooivalkService for contextual responses
- Caching and performance optimization for weather data

## Core Functionality

### Weather Data Fetching

- Integrates with Yr.no weather API
- Handles multiple predefined locations
- Manages API requests and response processing

### Data Processing

- Summarizes weather data into readable formats
- Formats weather information for bot responses
- Handles weather data caching and updates

## Architecture Notes

- Uses class-based TypeScript with private `_underscore` properties
- Implements HTTP client for Yr.no API integration
- Provides weather data to RooivalkService via dependency injection
- Handles asynchronous weather data operations

## Integration Points

- **RooivalkService**: Provides weather data for MOTD and enhanced responses
- **Yr.no API**: External weather data source
- **Caching system**: For performance optimization

## Common Tasks

| Task                      | Action                          | Notes                                |
| ------------------------- | ------------------------------- | ------------------------------------ |
| Add new location          | Extend location configuration   | Update predefined locations list     |
| Modify weather formatting | Update data summarization logic | Consider readability and context     |
| Update API integration    | Modify Yr.no API handling       | Handle API changes and new endpoints |
| Add weather features      | Extend weather data processing  | Consider forecasts, alerts, etc.     |

## Testing

- Unit tests in `index.test.ts`
- Mock Yr.no API responses for reliable testing
- Test weather data formatting and summarization
- Validate location handling and error scenarios

## Error Handling

- Graceful handling of API unavailability
- Fallback behavior for weather service outages
- Meaningful error logging and recovery
- Cache management during service interruptions

## Dependencies

- HTTP client for API requests
- Weather data parsing and formatting utilities
- Integration with shared types and constants
- Environment configuration for API settings

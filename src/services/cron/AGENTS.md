# CronService Agent Guidelines

## Overview

The CronService handles scheduled jobs and background tasks for the bot. It manages time-based operations and recurring tasks that need to run independently of Discord events.

## Key Responsibilities

- Scheduled job management and execution
- Background task coordination
- Timer-based operations
- Recurring task scheduling
- Integration with other services for scheduled operations

## Core Functionality

### Job Scheduling

- Manages cron-like scheduled tasks
- Handles recurring operations and timers
- Coordinates background processes

### Task Management

- Executes scheduled maintenance tasks
- Handles periodic data updates
- Manages cleanup and housekeeping operations

## Architecture Notes

- Uses class-based TypeScript with private `_underscore` properties
- Implements scheduling logic for time-based operations
- Integrates with other services for scheduled tasks
- Handles asynchronous background operations

## Integration Points

- **RooivalkService**: For scheduled bot operations
- **YrService**: For periodic weather updates
- **DiscordService**: For scheduled Discord operations
- **System timers**: For precise scheduling

## Common Tasks

| Task                     | Action                          | Notes                                       |
| ------------------------ | ------------------------------- | ------------------------------------------- |
| Add scheduled task       | Extend job scheduling logic     | Update cron configuration and handlers      |
| Modify task timing       | Update scheduling parameters    | Consider system load and API limits         |
| Add maintenance jobs     | Extend cleanup and housekeeping | Consider data retention and performance     |
| Update task coordination | Modify service integration      | Handle dependencies between scheduled tasks |

## Testing

- Unit tests in `index.test.ts`
- Mock timer functions for reliable testing
- Test scheduling logic and task execution
- Validate error handling and recovery

## Error Handling

- Graceful handling of failed scheduled tasks
- Retry logic for transient failures
- Meaningful error logging and monitoring
- Fallback behavior for critical scheduled operations

## Dependencies

- Timer and scheduling utilities
- Integration with other services via dependency injection
- System resources for background operations
- Environment configuration for scheduling parameters

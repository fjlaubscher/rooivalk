# Rooivalk Discord Bot

Rooivalk is a Discord bot that leverages OpenAI's API to generate responses when mentioned in a Discord server. It is written in TypeScript and designed for easy customization and extension.

## Features
- Responds to messages where the bot is mentioned
- Integrates with OpenAI for AI-generated replies
- Custom error messages for failed completions

## Setup

### Prerequisites
- Node.js (v18 or newer recommended)
- A Discord bot token ([guide](https://discord.com/developers/applications))
- An OpenAI API key ([guide](https://platform.openai.com/account/api-keys))

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/rooivalk.git
   cd rooivalk
   ```
2. Install dependencies:
   ```sh
   npm install
   ```
3. Create a `.env` file in the root directory with the following contents:
   ```env
   DISCORD_TOKEN=your-discord-bot-token
   DISCORD_GUILD_ID=your-discord-server-id
   OPENAI_API_KEY=your-openai-api-key
   OPENAI_MODEL=gpt-3.5-turbo # or another supported model
   ```
4. Build the project:
   ```sh
   npx tsc
   ```
5. Start the bot:
   ```sh
   node dist/index.js
   ```

## Project Structure

```
rooivalk/
├── src/
│   ├── index.ts                # Main entry point
│   └── services/
│       ├── openai.ts           # OpenAI integration
│       └── get-rooivalk-error.ts # Custom error messages
├── package.json
├── tsconfig.json
└── .env                        # Environment variables (not committed)
```

## Customization
- Edit `src/services/openai.ts` to change how prompts are sent to OpenAI.
- Edit `src/services/get-rooivalk-error.ts` to customize error messages.

## License
MIT

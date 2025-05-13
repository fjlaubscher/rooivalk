# Rooivalk Discord Bot

Rooivalk is a Discord bot that leverages OpenAI's API to generate responses when mentioned in a Discord server. It is written in TypeScript and designed for easy customization and extension.

## Features
- Responds to messages where the bot is mentioned
- Integrates with OpenAI for AI-generated replies
- Custom error messages for failed completions

## Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (v20 or newer recommended)
- [Yarn](https://yarnpkg.com/) (v1.x recommended)
- A Discord bot token ([guide](https://discord.com/developers/applications))
- An OpenAI API key ([guide](https://platform.openai.com/account/api-keys))
- A Mem0 API key ([mem0ai docs](https://mem0.ai/docs))

### Installation

1. Clone the repository:
   ```sh
   git clone https://github.com/fjlaubscher/rooivalk.git
   cd rooivalk
   ```
2. Install dependencies:
   ```sh
   yarn install
   ```
3. Create a `.env` file in the root directory with the following contents:
   ```env
   DISCORD_STARTUP_CHANNEL_ID=channelidforstartup
   DISCORD_LEARN_CHANNEL_ID=channelidforlearning
   DISCORD_TOKEN=discord_app_token
   DISCORD_GUILD_ID=discord_server_id
   OPENAI_API_KEY=openai_key
   OPENAI_MODEL=gpt-4.1-nano
   MEM0_API_KEY=your_mem0_api_key_here
   ```
4. Build the project:
   ```sh
   yarn build
   ```
5. Start the bot:
   ```sh
   yarn start
   ```

### Project Structure

```
rooivalk/
├── src/
│   ├── constants.ts
│   ├── index.ts
│   └── services/
│       ├── openai/
│       │   ├── constants.ts
│       │   └── index.ts
│       └── rooivalk/
│           ├── constants.ts
│           ├── index.test.ts
│           └── index.ts
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

### Customization
- Edit `src/services/openai/index.ts` to change how prompts are sent to OpenAI.
- Edit `src/services/rooivalk/index.ts` to customize the bot's core logic and behavior.
- Update constants in the respective `constants.ts` files for configuration.

### Continuous Integration

This project uses GitHub Actions to automatically run tests on every push and pull request to the `main` branch. You can find the workflow configuration in `.github/workflows/test.yml`.

No additional setup is required—tests will run automatically if you push changes or open a pull request.

## License
MIT

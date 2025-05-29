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
   DISCORD_APP_ID=discord_app_id
   OPENAI_API_KEY=openai_key
   OPENAI_MODEL=gpt-4.1-nano
   OPENAI_IMAGE_MODEL=gpt-image-1
   ROOIVALK_MOTD_CRON="0 8 * * *"
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
│   ├── test-utils/
│   │   └── createMockMessage.ts
│   └── services/
│       ├── discord/
│       │   ├── index.ts
│       │   └── index.test.ts
│       ├── openai/
│       │   ├── constants.ts
│       │   └── index.ts
│       └── rooivalk/
│           ├── constants.ts
│           ├── index.test.ts
│           └── index.ts
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

### Customization
- Edit `src/services/openai/index.ts` to change how prompts are sent to OpenAI.
- Edit `src/services/rooivalk/index.ts` to customize the bot's core logic and behavior.
- Update constants in the respective `constants.ts` files for configuration.
- Test utilities are available in `src/test-utils/` for mocking Discord messages in tests.

### Continuous Integration

This project uses GitHub Actions to automatically run tests on every push and pull request to the `main` branch. You can find the workflow configuration in `.github/workflows/test.yml`.

No additional setup is required—tests will run automatically if you push changes or open a pull request.

---

## Notes

- The codebase is written in modern TypeScript, using strict mode and modular architecture.
- All tests are written using [Vitest](https://vitest.dev/), and test utilities are provided for mocking Discord interactions.

## License
MIT

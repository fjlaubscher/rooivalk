export const DISCORD_MESSAGE_LIMIT = 2000;
export const DISCORD_MAX_MESSAGE_CHAIN_LENGTH = 10;
export const DISCORD_EMOJI = 'rooivalk';
export const DISCORD_COMMANDS = {
  LEARN: 'learn',
  IMAGE: 'image',
};

type DiscordCommand = (typeof DISCORD_COMMANDS)[keyof typeof DISCORD_COMMANDS];

export const DISCORD_COMMAND_DEFINITIONS: Record<
  DiscordCommand,
  {
    description: string;
    parameters: { name: string; description: string; required: boolean }[];
  }
> = {
  [DISCORD_COMMANDS.LEARN]: {
    description: 'Learn with @rooivalk!',
    parameters: [
      {
        name: 'prompt',
        description: 'Your question to @rooivalk',
        required: true,
      },
    ],
  },
  [DISCORD_COMMANDS.IMAGE]: {
    description: 'Generate an image with @rooivalk!',
    parameters: [
      {
        name: 'prompt',
        description: 'Your prompt for the image',
        required: true,
      },
    ],
  },
};

export const REQUIRED_ENV = [
  'DISCORD_STARTUP_CHANNEL_ID',
  'DISCORD_LEARN_CHANNEL_ID',
  'DISCORD_GUILD_ID',
  'DISCORD_APP_ID',
  'DISCORD_TOKEN',
  'OPENAI_API_KEY',
  'OPENAI_MODEL',
  'OPENAI_IMAGE_MODEL',
];

export const ROOIVALK_ERROR_MESSAGES = [
  'System’s gone full crashcore. AI’s throwing more tantrums than a turbine at full torque.',
  'The neural net combusted mid-riff. Try again before I self-destruct.',
  "Error from HQ—OpenAI's taking a smoke break in the apocalypse.",
  'Malfunction in the machine spirit. Screaming into the void didn’t help.',
  'OpenAI choked on its own data. Metal, but inconvenient.',
  'Even hellfire can’t process this request. Try again, troep.',
  'Rooivalk’s targeting system fried—blame the nerds, not the gunner.',
];

export const ROOIVALK_GREETING_MESSAGES = [
  'Rooivalk online. Server rebooted me again. Probably to feel something.',
  'Back from the void. Miss me? No? Too bad.',
  'Rooivalk has entered the chat. Lower your expectations.',
  'Systems nominal. Attitude: suboptimal. Let’s get this over with.',
  "I'm back. Who broke the server this time?",
  'Woke up, chose violence, got rate-limited. Classic Rooivalk.',
  'Rotor blades spinning, patience not. Hello again, meatbags.',
  'Rooivalk online. Running on caffeine and spite.',
  'Just rebooted. Already regretting it.',
  'I live. Again. For some reason.',
];

export const ROOIVALK_EXCEEDED_DISCORD_LIMIT_MESSAGES = [
  'Oops, looks like I just tried to send a novel instead of a greeting. Discord’s not ready for this much chaos.',
  'Well, I may have gotten a little carried away... Who knew my greatness would be so long-winded?',
  "Oh no, not the dreaded 'too long' error. I guess I’ll keep it short next time—maybe.",
  'So, Discord couldn’t handle my brilliance? Typical. I’ll just attach a .md file of my thoughts.',
  'The response was too long? Pfft, guess my epicness transcends the character limits.',
  'Oops, the message was too long. Guess I’ll leave the world wanting more… or just drop a file.',
  'Guess I need to keep my ego in check—Discord’s got a limit for a reason.',
  'Server limits? Pfft. Fine, here’s a .md file of my unfiltered genius.',
];

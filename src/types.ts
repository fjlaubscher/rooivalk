import type { ThreadChannel } from 'discord.js';

export type Env = {
  DISCORD_STARTUP_CHANNEL_ID: string;
  DISCORD_MOTD_CHANNEL_ID: string;
  DISCORD_GUILD_ID: string;
  DISCORD_APP_ID: string;
  DISCORD_TOKEN: string;
  OPENAI_API_KEY: string;
  OPENAI_MODEL: string;
  OPENAI_IMAGE_MODEL: string;
  ROOIVALK_MOTD_CRON: string;
};

export type ChatProvider = 'openai' | 'xai';

/**
 * A declarative channel profile. A message that lands in `channelId` (or a
 * thread whose parent is `channelId`), optionally from a member holding
 * `roleId`, is handled by this profile's dedicated chat behaviour instead of
 * the default.
 *
 * The behaviour is config-only: instructions are loaded from
 * `config/profiles/<name>.md` (resolved from `name`), and `model`/`provider`
 * override the defaults. Adding a profile needs a new entry plus its
 * instructions file, no code changes.
 */
export type Profile = {
  /**
   * Human-readable label; the key used to look up the built service, and the
   * basename of the instructions file (`config/profiles/<name>.md`).
   */
  name: string;
  /** Discord channel id the profile applies to (with thread inheritance). */
  channelId: string;
  /** Optional Discord role id; when set, the member must hold it to match. */
  roleId?: string;
  /** Optional model override; falls back to the provider's default model. */
  model?: string;
  /** Optional provider override; defaults to `openai`. */
  provider?: ChatProvider;
};

/** Picks the system instructions for a request from the in-memory config. */
export type InstructionsSelector = (config: InMemoryConfig) => string;

/**
 * Role-based tool permissions, independent of channel profiles. Maps a Discord
 * role id to the tool names (from `TOOL_NAMES`) its holders may use. A tool
 * listed under any role is restricted — only members holding a role that grants
 * it may invoke it. Tools listed nowhere are unrestricted. The gate is
 * channel-independent: it applies in every channel, profiled or not.
 */
export type ToolRoles = Record<string, string[]>;

export type InMemoryConfig = {
  errorMessages: string[];
  greetingMessages: string[];
  discordLimitMessages: string[];
  leaderboardEmptyMessages: string[];
  instagramMessages: string[];
  redditMessages: string[];
  permissionDeniedMessages: string[];
  boastMessages: string[];
  instructions: {
    openai: string;
    xai: string;
  };
  /** Declarative channel profiles. */
  profiles: Profile[];
  /** Instruction text per profile, keyed by profile name. */
  profileInstructions: Record<string, string>;
  /** Role-based tool permissions, independent of channel profiles. */
  toolRoles: ToolRoles;
  motd: string;
  /** Instructions the chat model follows to craft the daily MOTD image prompt. */
  motdImagePrompt: string;
};

export type ResponseType =
  | 'error'
  | 'greeting'
  | 'discordLimit'
  | 'instagram'
  | 'reddit'
  | 'permissionDenied'
  | 'boast';
export type OpenAIResponse = {
  type: 'text' | 'image_generation_call';
  content: string;
  base64Images: string[];
  createdThread?: ThreadChannel;
  responseId?: string;
  contextLost?: boolean;
};

export type ToolExecutionResult = {
  output: string;
  createdThread?: ThreadChannel;
  base64Image?: string;
  /**
   * Set when the caller lacked permission for the requested tool. The provider
   * tool loop stops and replies with this text verbatim, so the refusal wording
   * is deterministic rather than narrated by the model.
   */
  deniedMessage?: string;
};

export interface ToolExecutor {
  (name: string, args: Record<string, unknown>): Promise<ToolExecutionResult>;
  /**
   * Returns the deterministic denial reply when `name` is gated for the current
   * caller, or null when the tool is allowed. Lets a provider preflight a batch
   * of tool calls and refuse the turn before running any side-effecting tool.
   */
  deniedMessage(name: string): string | null;
}

export type ConversationRefType = 'msg' | 'thread';

export type ConversationRef = {
  type: ConversationRefType;
  refId: string;
};

export type AttachmentForPrompt = {
  url: string;
  kind: 'image' | 'file';
  name?: string | null;
  contentType?: string | null;
};

export type DiscordCommandParams = {
  description: string;
  parameters: {
    name: string;
    description: string;
    required: boolean;
    choices?: { name: string; value: string }[];
  }[];
};

export type WeatherLocation = {
  name: string;
  latitude: number;
  longitude: number;
};

export type WeatherForecast = {
  location: string;
  friendlyName: string;
  minTemp: number;
  maxTemp: number;
  avgWindSpeed: number;
  avgWindDirection: string;
  avgHumidity: number;
  totalPrecipitation: number;
};

export type YrResponse = {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number, number]; // lon, lat, alt
  };
  properties: {
    meta: {
      updated_at: string;
      units: {
        air_pressure_at_sea_level: string;
        air_temperature: string;
        cloud_area_fraction: string;
        precipitation_amount: string;
        relative_humidity: string;
        wind_from_direction: string;
        wind_speed: string;
      };
    };
    timeseries: {
      time: string;
      data: {
        instant: {
          details: {
            air_pressure_at_sea_level: number;
            air_temperature: number;
            cloud_area_fraction: number;
            relative_humidity: number;
            wind_from_direction: number;
            wind_speed: number;
          };
        };
        next_1_hours?: {
          summary: {
            symbol_code: string;
          };
          details: {
            precipitation_amount: number;
          };
        };
        next_6_hours?: {
          summary: {
            symbol_code: string;
          };
          details: {
            precipitation_amount: number;
          };
        };
        next_12_hours?: {
          summary: {
            symbol_code: string;
          };
          details?: Record<string, unknown>; // Currently always empty
        };
      };
    }[];
  };
};

export type PeapixFeedResponseItem = {
  title: string;
  copyright: string;
  fullUrl: string;
  thumbUrl: string;
  imageUrl: string;
  pageUrl: string;
};

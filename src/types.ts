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
  ROOIVALK_QOTD_CRON: string;
};

export type InMemoryConfig = {
  errorMessages: string[];
  greetingMessages: string[];
  discordLimitMessages: string[];
  instructions: string;
  motd: string;
  qotd: string;
};

export type ResponseType = 'error' | 'greeting' | 'discordLimit';
export type OpenAIResponse = {
  type: 'text' | 'image_generation_call';
  content: string;
  base64Images: string[];
};

export type MessageInChain = {
  author: string | 'rooivalk';
  content: string;
  attachmentUrls: string[];
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

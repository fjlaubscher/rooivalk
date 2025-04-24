import { Client, GatewayIntentBits } from "discord.js";
import type { TextChannel } from "discord.js";
import "dotenv/config";

import { createChatCompletion } from "./services/openai.js";
import { getRooivalkError } from "./services/get-rooivalk-error.js";

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Validate required environment variables at startup
const requiredEnv = ["DISCORD_TOKEN", "DISCORD_CHANNEL_ID", "DISCORD_GUILD_ID"];
const missingEnv = requiredEnv.filter((key) => !process.env[key]);
if (missingEnv.length) {
  console.error(
    `Missing required environment variables: ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

// Precompile mention RegExp
let rooivalkMentionRegex: RegExp | null = null;

discordClient.once("ready", async () => {
  console.log(`🤖 Logged in as ${discordClient.user?.tag}`);
  const channelId = process.env.DISCORD_CHANNEL_ID;
  if (channelId) {
    try {
      const channel = await discordClient.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        const textChannel = channel as TextChannel;
        await textChannel.send("Rooivalk online :commibugs:");
      }
    } catch (err) {
      console.error("Error sending ready message:", err);
    }
  }
  // Set mention regex after bot is ready and has an ID
  if (discordClient.user?.id) {
    rooivalkMentionRegex = new RegExp(`<@!?${discordClient.user.id}>`, "g");
  }
});

discordClient.on("messageCreate", async (message) => {
  // Remove all bot mention formats from the prompt
  const rooivalkId = discordClient.user?.id;
  if (
    message.author.bot ||
    message.guild?.id !== process.env.DISCORD_GUILD_ID ||
    !rooivalkId ||
    !message.mentions.users.has(rooivalkId)
  ) {
    return;
  }

  try {
    let usersToMention = message.mentions.users.filter(
      (user) => user.id !== rooivalkId
    );
    let prompt = message.content;
    if (rooivalkMentionRegex) {
      prompt = prompt.replaceAll(rooivalkMentionRegex, "");
    }
    prompt = prompt.replace(/\s{2,}/g, " ").trim();
    const response = await createChatCompletion(prompt);

    if (response && usersToMention.size) {
      await message.reply({
        allowedMentions: { users: Array.from(usersToMention.keys()) },
        content: response,
      });
    } else if (response && !usersToMention.size) {
      await message.reply(response);
    } else {
      await message.reply(getRooivalkError());
    }
  } catch (error) {
    console.error("Error processing message:", error);
    const rooivalkError = getRooivalkError();
    if (error instanceof Error) {
      await message.reply(`${rooivalkError}\n\n\`\`\`${error.message}\`\`\``);
    } else {
      await message.reply(rooivalkError);
    }
  }
});

discordClient.login(process.env.DISCORD_TOKEN);

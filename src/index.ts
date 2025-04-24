import { Client, GatewayIntentBits } from "discord.js";
import 'dotenv/config';

import { createChatCompletion } from "./services/openai.js";
import { getRooivalkError } from "./services/get-rooivalk-error.js";

const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

discordClient.once("ready", () => {
  console.log(`🤖 Logged in as ${discordClient.user?.tag}`);
});

discordClient.on("messageCreate", async (message) => {
  const rooivalkId = discordClient.user?.id;
  // Ignore messages from:
  // 1. Other bots
  // 2. Messages not in the specified guild
  // 3. Messages that don't mention the bot
  if (
    message.author.bot ||
    message.guild?.id !== process.env.DISCORD_GUILD_ID ||
    !message.mentions.users.has(rooivalkId!)
  ) {
    return;
  }
  console.log("Message received:", message.content);
  try {
    // Always remove the bot mention from the prompt
    let usersToMention = message.mentions.users.filter(
      (user) => user.id !== rooivalkId!
    );
    let prompt = message.content.replace(`<@${discordClient.user?.id}>`, "");
    const response = await createChatCompletion(prompt);

    if (usersToMention.size) {
      // someone else was mentioned
      // remove their mentions from the prompt
      prompt.replace(/<@!?\d+>/g, (match) => {
        const userId = match.replace(/<@!?/, "").replace(/>/, "");
        const user = usersToMention.get(userId);
        if (user) {
          return `@${user.username}`;
        }
        return match;
      });
    }

    if (response && usersToMention.size) {
      message.reply({
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

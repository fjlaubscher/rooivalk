export type RecordReactionParams = {
  guildId: string;
  messageId: string;
  channelId: string;
  messageAuthorId: string;
  reactorId: string;
  emojiId: string | null;
  emojiName: string;
  emojiAnimated: boolean;
};

export type TopUser = {
  user_id: string;
  count: number;
};

export type EmojiChampion = {
  emoji_id: string | null;
  emoji_name: string;
  emoji_animated: number;
  user_id: string;
  count: number;
};

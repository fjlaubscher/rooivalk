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

export type TopMessage = {
  message_id: string;
  channel_id: string;
  message_author_id: string;
  count: number;
};

export type TopGiver = {
  user_id: string;
  count: number;
  fav_emoji_id: string | null;
  fav_emoji_name: string;
  fav_emoji_animated: number;
};

export type TopEmoji = {
  emoji_id: string | null;
  emoji_name: string;
  emoji_animated: number;
  count: number;
};

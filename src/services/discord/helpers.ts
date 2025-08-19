import type { MessageInChain } from '@/types';

export const formatMessageInChain = (message: MessageInChain): string => {
  let entry = `- ${message.author}: ${message.content}`;

  if (message.attachmentUrls.length > 0) {
    const formattedAttachments = message.attachmentUrls
      .map((url, index) => `[${index + 1}](${url})`)
      .join(', ');

    entry = `${entry} Attachments: ${formattedAttachments}`;
  }

  return entry;
};

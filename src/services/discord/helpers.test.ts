import { describe, it, expect } from 'vitest';
import { Collection } from 'discord.js';
import type { Attachment } from 'discord.js';
import { parseMessageInChain, formatMessageInChain } from './helpers';
import { createMockMessage } from '@/test-utils/createMockMessage';
import type { MessageInChain } from '@/types';

describe('discord helpers', () => {
  const mockDiscordClientId = 'bot-user-id';

  describe('parseMessageInChain', () => {
    it('should parse a regular user message with content', () => {
      const message = createMockMessage({
        author: { id: 'user-id', displayName: 'TestUser' },
        content: '  Hello world!  ',
      });

      const result = parseMessageInChain(message, mockDiscordClientId);

      expect(result).toEqual({
        author: 'TestUser',
        content: 'Hello world!',
        attachmentUrls: [],
      });
    });

    it('should parse a rooivalk message', () => {
      const message = createMockMessage({
        author: { id: mockDiscordClientId, displayName: 'Rooivalk' },
        content: 'Bot response',
      });

      const result = parseMessageInChain(message, mockDiscordClientId);

      expect(result).toEqual({
        author: 'rooivalk',
        content: 'Bot response',
        attachmentUrls: [],
      });
    });

    it('should parse message with attachments', () => {
      const mockAttachment1 = {
        url: 'https://example.com/image1.png',
      } as Attachment;
      const mockAttachment2 = {
        url: 'https://example.com/image2.jpg',
      } as Attachment;

      const mockAttachments = new Collection([
        ['1', mockAttachment1],
        ['2', mockAttachment2],
      ]);

      const message = createMockMessage({
        author: { id: 'user-id', displayName: 'TestUser' },
        content: 'Check these images',
        attachments: mockAttachments,
      });

      const result = parseMessageInChain(message, mockDiscordClientId);

      expect(result).toEqual({
        author: 'TestUser',
        content: 'Check these images',
        attachmentUrls: [
          'https://example.com/image1.png',
          'https://example.com/image2.jpg',
        ],
      });
    });

    it('should handle message with only attachments and no content', () => {
      const mockAttachment = {
        url: 'https://example.com/file.pdf',
      } as Attachment;
      const mockAttachments = new Collection([['1', mockAttachment]]);

      const message = createMockMessage({
        author: { id: 'user-id', displayName: 'TestUser' },
        content: '   ',
        attachments: mockAttachments,
      });

      const result = parseMessageInChain(message, mockDiscordClientId);

      expect(result).toEqual({
        author: 'TestUser',
        content: '',
        attachmentUrls: ['https://example.com/file.pdf'],
      });
    });

    it('should filter out messages with no content and no attachments', () => {
      const message = createMockMessage({
        author: { id: 'user-id', displayName: 'TestUser' },
        content: '',
        attachments: new Collection(),
      });

      const result = parseMessageInChain(message, mockDiscordClientId);

      expect(result).toBeNull();
    });

    it('should parse a message with empty content but with attachments', () => {
      const mockAttachment = { url: 'https://example.com/image.png' };
      const mockAttachments = new Collection();
      mockAttachments.set('1', mockAttachment as any);

      const message = createMockMessage({
        author: { id: 'user-id', displayName: 'TestUser' },
        content: '',
        attachments: mockAttachments,
      });

      const result = parseMessageInChain(message, mockDiscordClientId);

      expect(result).toEqual({
        author: 'TestUser',
        content: '',
        attachmentUrls: ['https://example.com/image.png'],
      });
    });
  });

  describe('formatMessageInChain', () => {
    it('should format message with content only', () => {
      const message: MessageInChain = {
        author: 'TestUser',
        content: 'Hello world!',
        attachmentUrls: [],
      };

      const result = formatMessageInChain(message);

      expect(result).toBe('- TestUser: Hello world!');
    });

    it('should format rooivalk message', () => {
      const message: MessageInChain = {
        author: 'rooivalk',
        content: 'How can I help you?',
        attachmentUrls: [],
      };

      const result = formatMessageInChain(message);

      expect(result).toBe('- rooivalk: How can I help you?');
    });

    it('should format message with single attachment', () => {
      const message: MessageInChain = {
        author: 'TestUser',
        content: 'Check this image',
        attachmentUrls: ['https://example.com/image.png'],
      };

      const result = formatMessageInChain(message);

      expect(result).toBe(
        '- TestUser: Check this image Attachments: [1](https://example.com/image.png)',
      );
    });

    it('should format message with multiple attachments', () => {
      const message: MessageInChain = {
        author: 'TestUser',
        content: 'Multiple files',
        attachmentUrls: [
          'https://example.com/file1.pdf',
          'https://example.com/image.jpg',
          'https://example.com/document.docx',
        ],
      };

      const result = formatMessageInChain(message);

      expect(result).toBe(
        '- TestUser: Multiple files Attachments: [1](https://example.com/file1.pdf), [2](https://example.com/image.jpg), [3](https://example.com/document.docx)',
      );
    });

    it('should format message with attachments but no content', () => {
      const message: MessageInChain = {
        author: 'TestUser',
        content: '',
        attachmentUrls: ['https://example.com/file.pdf'],
      };

      const result = formatMessageInChain(message);

      expect(result).toBe(
        '- TestUser:  Attachments: [1](https://example.com/file.pdf)',
      );
    });

    it('should handle empty message', () => {
      const message: MessageInChain = {
        author: 'TestUser',
        content: '',
        attachmentUrls: [],
      };

      const result = formatMessageInChain(message);

      expect(result).toBe('- TestUser: ');
    });
  });
});

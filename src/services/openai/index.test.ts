import {
  describe,
  it,
  expect,
  vi,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest';

import OpenAIService from '.';
import { MOCK_CONFIG } from '@/test-utils/mock';

const responsesCreateMock = vi.fn();
const imagesGenerateMock = vi.fn();

vi.mock('openai', () => {
  class OpenAIMock {
    responses = { create: responsesCreateMock };
    images = { generate: imagesGenerateMock };
    static OpenAIError = class extends Error {};
  }
  return { default: OpenAIMock };
});

import OpenAI from 'openai';

let service: OpenAIService;
let errorSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeAll(() => {
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterAll(() => {
  errorSpy.mockRestore();
  logSpy.mockRestore();
});

beforeEach(() => {
  vi.clearAllMocks();
  responsesCreateMock.mockReset();
  imagesGenerateMock.mockReset();
  vi.stubGlobal('process', {
    env: {
      OPENAI_API_KEY: 'key',
      OPENAI_MODEL: 'model',
      OPENAI_IMAGE_MODEL: 'image',
    },
  });
  service = new OpenAIService(MOCK_CONFIG);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('OpenAIService', () => {
  describe('createResponse', () => {
    it('returns output text on success', async () => {
      responsesCreateMock.mockResolvedValueOnce({
        output_text: 'test response',
        output: [],
      });
      const result = await service.createResponse('test user', 'hi');
      expect(result).toEqual({
        type: 'text',
        content: 'test response',
        base64Images: [],
      });
    });

    it('throws OpenAI error message', async () => {
      responsesCreateMock.mockRejectedValueOnce(
        new (OpenAI as any).OpenAIError('bad')
      );
      await expect(service.createResponse('test user', 'hi')).rejects.toThrow(
        'bad'
      );
      expect(errorSpy).toHaveBeenCalled();
    });

    it('throws generic error', async () => {
      responsesCreateMock.mockRejectedValueOnce(new Error('fail'));
      await expect(service.createResponse('test user', 'hi')).rejects.toThrow(
        'Error creating chat completion'
      );
    });
  });

  describe('createImage', () => {
    it('returns base64 image on success', async () => {
      imagesGenerateMock.mockResolvedValueOnce({ data: [{ b64_json: 'img' }] });
      await expect(service.createImage('cat')).resolves.toBe('img');
    });

    it('throws OpenAI error message', async () => {
      imagesGenerateMock.mockRejectedValueOnce(
        new (OpenAI as any).OpenAIError('img fail')
      );
      await expect(service.createImage('cat')).rejects.toThrow('img fail');
    });

    it('throws generic error', async () => {
      imagesGenerateMock.mockRejectedValueOnce(new Error('fail'));
      await expect(service.createImage('cat')).rejects.toThrow(
        'Error creating image'
      );
    });
  });

  describe('generateThreadName', () => {
    it('returns thread name on success', async () => {
      responsesCreateMock.mockResolvedValueOnce({
        output_text: 'Test Topic',
        output: [],
      });
      const result = await service.generateThreadName('prompt');
      expect(result).toBe('Test Topic');
    });

    it('throws OpenAI error message', async () => {
      responsesCreateMock.mockRejectedValueOnce(
        new (OpenAI as any).OpenAIError('bad')
      );
      await expect(service.generateThreadName('prompt')).rejects.toThrow('bad');
    });

    it('throws generic error', async () => {
      responsesCreateMock.mockRejectedValueOnce(new Error('fail'));
      await expect(service.generateThreadName('prompt')).rejects.toThrow(
        'Error creating thread name'
      );
    });
  });
});

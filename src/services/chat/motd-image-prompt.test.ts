import { describe, it, expect, vi } from 'vitest';

import { generateMotdImagePrompt } from './motd-image-prompt.ts';

const makeClient = (output: string) => {
  const create = vi.fn().mockResolvedValue({ output_text: output });
  return {
    client: { responses: { create } } as never,
    create,
  };
};

describe('generateMotdImagePrompt', () => {
  it('returns the trimmed model output', async () => {
    const { client } = makeClient('  a vivid prompt  ');
    const result = await generateMotdImagePrompt(
      client,
      'model-x',
      'base instructions',
      'Cape Town',
      'watercolour',
      'a harbour at dawn',
    );
    expect(result).toBe('a vivid prompt');
  });

  it('passes the instructions and the chosen location/style/subject through', async () => {
    const { client, create } = makeClient('prompt');
    await generateMotdImagePrompt(
      client,
      'model-x',
      'base instructions',
      'Cape Town',
      'ukiyo-e woodblock print',
      'a bustling local market scene',
    );
    const args = create.mock.calls[0]![0];
    expect(args.model).toBe('model-x');
    expect(args.instructions).toBe('base instructions');
    expect(args.input).toContain('Cape Town');
    expect(args.input).toContain('ukiyo-e woodblock print');
    expect(args.input).toContain('a bustling local market scene');
  });

  it('returns null when the model output is empty', async () => {
    const { client } = makeClient('   ');
    const result = await generateMotdImagePrompt(
      client,
      'model-x',
      'base',
      'Cape Town',
      'oil painting',
      'the skyline at golden hour',
    );
    expect(result).toBeNull();
  });

  it('returns null and logs when the request throws', async () => {
    const create = vi.fn().mockRejectedValue(new Error('boom'));
    const client = { responses: { create } } as never;
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await generateMotdImagePrompt(
      client,
      'model-x',
      'base',
      'Cape Town',
      'pixel art',
      'a cultural festival',
    );
    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

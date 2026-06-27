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
    );
    expect(result).toBe('a vivid prompt');
  });

  it('passes the base instructions and location through', async () => {
    const { client, create } = makeClient('prompt');
    await generateMotdImagePrompt(
      client,
      'model-x',
      'base instructions',
      'Cape Town',
    );
    const args = create.mock.calls[0]![0];
    expect(args.model).toBe('model-x');
    expect(args.input).toBe('Cape Town');
    expect(args.instructions).toContain('base instructions');
  });

  it('appends recent prompts as an avoid-list', async () => {
    const { client, create } = makeClient('prompt');
    await generateMotdImagePrompt(
      client,
      'model-x',
      'base instructions',
      'Cape Town',
      ['watercolour of Dubai', 'retro travel poster of Gdańsk'],
    );
    const { instructions } = create.mock.calls[0]![0];
    expect(instructions).toContain('Do NOT produce a prompt similar');
    expect(instructions).toContain('- watercolour of Dubai');
    expect(instructions).toContain('- retro travel poster of Gdańsk');
  });

  it('omits the avoid-list when there are no recent prompts', async () => {
    const { client, create } = makeClient('prompt');
    await generateMotdImagePrompt(client, 'model-x', 'base', 'Cape Town', []);
    const { instructions } = create.mock.calls[0]![0];
    expect(instructions).not.toContain('Do NOT produce a prompt similar');
  });

  it('skips blank recent prompts', async () => {
    const { client, create } = makeClient('prompt');
    await generateMotdImagePrompt(client, 'model-x', 'base', 'Cape Town', [
      '   ',
    ]);
    const { instructions } = create.mock.calls[0]![0];
    expect(instructions).not.toContain('Do NOT produce a prompt similar');
  });

  it('returns null when the model output is empty', async () => {
    const { client } = makeClient('   ');
    const result = await generateMotdImagePrompt(
      client,
      'model-x',
      'base',
      'Cape Town',
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
    );
    expect(result).toBeNull();
    expect(errSpy).toHaveBeenCalled();
    errSpy.mockRestore();
  });
});

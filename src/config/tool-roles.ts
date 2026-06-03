import { CONFIG_FILE_TOOL_ROLES } from '../constants.ts';
import { TOOL_NAMES } from '../services/chat/tool-names.ts';
import type { ToolRoles } from '../types.ts';
import { loadJsonConfig } from './json-config.ts';

const KNOWN_TOOL_NAMES = new Set<string>(Object.values(TOOL_NAMES));

/**
 * Validates the parsed `tool-roles.json` shape, `{ "<role_id>": ["tool", ...] }`.
 * This is a permission boundary, so it fails closed: a malformed entry or a
 * typo'd tool name throws rather than silently leaving the intended sensitive
 * tool ungated (and therefore public).
 */
export const parseToolRoles = (parsed: unknown): ToolRoles => {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error(
      `[config/loader] ${CONFIG_FILE_TOOL_ROLES} must be an object mapping role id to tool names`,
    );
  }

  const toolRoles: ToolRoles = {};
  for (const [roleId, tools] of Object.entries(
    parsed as Record<string, unknown>,
  )) {
    if (
      !Array.isArray(tools) ||
      !tools.every((tool) => typeof tool === 'string')
    ) {
      throw new Error(
        `[config/loader] ${CONFIG_FILE_TOOL_ROLES} role "${roleId}" must map to an array of tool names`,
      );
    }

    const unknownTools = tools.filter((tool) => !KNOWN_TOOL_NAMES.has(tool));
    if (unknownTools.length > 0) {
      throw new Error(
        `[config/loader] ${CONFIG_FILE_TOOL_ROLES} role "${roleId}" lists unknown tool name(s): ${unknownTools.join(', ')}. A typo would silently leave a sensitive tool ungated — fix or remove them.`,
      );
    }

    toolRoles[roleId] = tools;
  }

  return toolRoles;
};

/**
 * Loads the role-based tool permissions from `config/tool-roles.json`. The file
 * is deployment-specific (gitignored); a missing file means no tool is
 * restricted.
 */
export const loadToolRoles = async (): Promise<ToolRoles> =>
  loadJsonConfig(CONFIG_FILE_TOOL_ROLES, parseToolRoles, () => ({}));

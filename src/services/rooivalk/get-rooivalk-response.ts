import {
  ERROR_MESSAGES,
  EXCEEDED_DISCORD_LIMIT_MESSAGES,
  GREETING_MESSAGES,
} from './constants';

type RooivalkResponseType = 'error' | 'greeting' | 'discordLimit';

export const getRooivalkResponse = (type: RooivalkResponseType): string => {
  let arrayToUse = [];

  switch (type) {
    case 'error':
      arrayToUse = ERROR_MESSAGES;
      break;
    case 'greeting':
      arrayToUse = GREETING_MESSAGES;
      break;
    case 'discordLimit':
      arrayToUse = EXCEEDED_DISCORD_LIMIT_MESSAGES;
      break;
    default:
      throw new Error('Invalid response type');
  }

  const index = Math.floor(Math.random() * arrayToUse.length);
  return arrayToUse[index]!;
};

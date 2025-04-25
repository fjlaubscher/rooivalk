import { ROOIVALK_ERRORS } from '../constants.js';

export const getRooivalkError = (): string => {
  const index = Math.floor(Math.random() * ROOIVALK_ERRORS.length);
  return ROOIVALK_ERRORS[index]!;
};

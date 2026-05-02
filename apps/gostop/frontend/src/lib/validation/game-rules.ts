import { GAME_ERRORS } from '../constants/errors';
import { NUSDC_UNIT_NUMBER } from '../constants/assets';

export interface ValidationResult {
  isValid: boolean;
  message?: string;
}

export const validateBetAmount = (
  amount: bigint,
  min: bigint,
  max: bigint
): ValidationResult => {
  if (amount < min) {
    return {
      isValid: false,
      message: GAME_ERRORS.MIN_BET((Number(min) / NUSDC_UNIT_NUMBER).toString()),
    };
  }
  if (amount > max) {
    return {
      isValid: false,
      message: GAME_ERRORS.MAX_BET((Number(max) / NUSDC_UNIT_NUMBER).toString()),
    };
  }
  return { isValid: true };
};

export const validateLotteryPicks = (
  picks: number[],
  maxPicks: number,
  maxNumber: number
): ValidationResult => {
  if (picks.length !== maxPicks) {
    return { isValid: false, message: `Please pick exactly ${maxPicks} numbers.` };
  }
  if (new Set(picks).size !== picks.length) {
    return { isValid: false, message: 'Duplicate numbers are not allowed.' };
  }
  if (picks.some((n) => n < 1 || n > maxNumber)) {
    return { isValid: false, message: `Numbers must be between 1 and ${maxNumber}.` };
  }
  return { isValid: true };
};

export const validateMinesConfig = (
  mineCount: number,
  minMines: number,
  maxMines: number
): ValidationResult => {
  if (!Number.isInteger(mineCount)) {
    return { isValid: false, message: 'Mine count must be a whole number.' };
  }
  if (mineCount < minMines || mineCount > maxMines) {
    return { isValid: false, message: `Mine count must be between ${minMines} and ${maxMines}.` };
  }
  return { isValid: true };
};

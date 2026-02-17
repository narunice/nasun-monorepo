/**
 * CORS Allowed Origins — Single Source of Truth
 *
 * All CDK stacks and Lambda functions must use this module
 * instead of hardcoding their own origin lists.
 */

const PRODUCTION_ORIGINS = [
  'https://nasun.io',
  'https://www.nasun.io',
  'https://staging.nasun.io',
  'https://gensol.io',
  'https://www.gensol.io',
  'https://gensol.nasun.io',
  'https://staging.gensol.io',
  'https://pado.finance',
  'https://staging.pado.finance',
];

const DEV_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5175',
  'http://localhost:5176',
  'http://localhost:5177',
];

// Include DEV_ORIGINS only in non-production environments
const isDev = process.env.NODE_ENV !== 'production';
export const ALLOWED_ORIGINS = [
  ...PRODUCTION_ORIGINS,
  ...(isDev ? DEV_ORIGINS : []),
];

/** Comma-separated string for passing to Lambda environment variables */
export const ALLOWED_ORIGINS_ENV = ALLOWED_ORIGINS.join(',');

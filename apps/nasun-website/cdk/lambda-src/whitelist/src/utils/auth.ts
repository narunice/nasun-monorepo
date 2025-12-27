/**
 * Admin API 인증 유틸리티
 */

export function validateAdminApiKey(apiKey: string | undefined): boolean {
  const validApiKey = process.env.ADMIN_API_KEY;

  if (!validApiKey) {
    console.error('ADMIN_API_KEY not configured in environment variables');
    return false;
  }

  if (!apiKey) {
    console.warn('API Key not provided in request headers');
    return false;
  }

  return apiKey === validApiKey;
}

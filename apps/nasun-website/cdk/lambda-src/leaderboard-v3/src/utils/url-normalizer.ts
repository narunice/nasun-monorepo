/**
 * URL Normalizer for Leaderboard V3
 *
 * Normalizes social media URLs to ensure consistent deduplication.
 * Currently supports Twitter/X URLs.
 */

import { Platform } from '../types';

export interface NormalizedUrl {
  normalizedUrl: string;
  platform: Platform;
  username: string; // lowercase for consistent lookups
  originalUsername: string; // original casing for display
  postId: string;
  isValid: boolean;
  error?: string;
}

// Twitter/X URL patterns
const TWITTER_PATTERNS = {
  // Match: twitter.com, x.com, mobile.twitter.com, mobile.x.com
  HOST: /^(?:(?:mobile\.)?(?:twitter|x)\.com)$/i,
  // Match: /{username}/status/{postId}
  PATH: /^\/([a-zA-Z0-9_]{1,15})\/status\/(\d+)/,
};

// Query parameters to strip (tracking params)
const TRACKING_PARAMS = [
  's', // share source
  't', // timestamp
  'ref_src',
  'ref_url',
  'src',
  'cxt',
  'vertical',
  'mx',
];

/**
 * Normalizes a URL for consistent storage and deduplication
 *
 * Rules:
 * 1. Protocol: Always https://
 * 2. Domain: twitter.com, mobile.twitter.com, mobile.x.com -> x.com
 * 3. Path: Keep only /{username}/status/{postId}
 * 4. Query params: Strip all tracking parameters
 * 5. Fragment: Remove
 */
export function normalizeUrl(rawUrl: string): NormalizedUrl {
  const result: NormalizedUrl = {
    normalizedUrl: '',
    platform: 'twitter',
    username: '',
    originalUsername: '',
    postId: '',
    isValid: false,
  };

  try {
    // Handle empty or invalid input
    if (!rawUrl || typeof rawUrl !== 'string') {
      result.error = 'URL is required';
      return result;
    }

    // Trim whitespace
    const trimmedUrl = rawUrl.trim();

    // Parse URL
    let url: URL;
    try {
      // Add protocol if missing
      const urlWithProtocol = trimmedUrl.startsWith('http')
        ? trimmedUrl
        : `https://${trimmedUrl}`;
      url = new URL(urlWithProtocol);
    } catch {
      result.error = 'Invalid URL format';
      return result;
    }

    // Check if it's a Twitter/X URL
    if (!TWITTER_PATTERNS.HOST.test(url.hostname)) {
      result.error = `Unsupported platform: ${url.hostname}. Currently only Twitter/X is supported.`;
      return result;
    }

    // Extract username and post ID from path
    const pathMatch = url.pathname.match(TWITTER_PATTERNS.PATH);
    if (!pathMatch) {
      result.error =
        'Invalid Twitter/X URL format. Expected: https://x.com/{username}/status/{postId}';
      return result;
    }

    const [, username, postId] = pathMatch;

    // Validate username
    if (!username || username.length > 15) {
      result.error = 'Invalid Twitter username';
      return result;
    }

    // Validate post ID (should be numeric)
    if (!postId || !/^\d+$/.test(postId)) {
      result.error = 'Invalid Twitter post ID';
      return result;
    }

    // Build normalized URL
    // Always use x.com as the canonical domain
    result.normalizedUrl = `https://x.com/${username.toLowerCase()}/status/${postId}`;
    result.platform = 'twitter';
    result.username = username.toLowerCase();
    result.originalUsername = username; // Preserve original casing
    result.postId = postId;
    result.isValid = true;

    return result;
  } catch (error) {
    result.error = `URL normalization failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
    return result;
  }
}

/**
 * Extract username from a normalized Twitter/X URL
 */
export function extractUsername(normalizedUrl: string): string | null {
  try {
    const url = new URL(normalizedUrl);
    const pathMatch = url.pathname.match(TWITTER_PATTERNS.PATH);
    return pathMatch ? pathMatch[1].toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Check if two URLs point to the same post
 */
export function isSamePost(url1: string, url2: string): boolean {
  const normalized1 = normalizeUrl(url1);
  const normalized2 = normalizeUrl(url2);

  if (!normalized1.isValid || !normalized2.isValid) {
    return false;
  }

  return normalized1.normalizedUrl === normalized2.normalizedUrl;
}

/**
 * Validate URL without full normalization (quick check)
 */
export function isValidTwitterUrl(url: string): boolean {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return (
      TWITTER_PATTERNS.HOST.test(urlObj.hostname) &&
      TWITTER_PATTERNS.PATH.test(urlObj.pathname)
    );
  } catch {
    return false;
  }
}

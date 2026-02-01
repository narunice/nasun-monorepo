/**
 * SocialLoginButtons Component
 *
 * Displays social login buttons for zkLogin authentication.
 * Supports Google, Apple, and other OAuth providers.
 */

import React from 'react';
import type { ZkLoginProvider } from '@nasun/wallet';

export interface SocialLoginButtonsProps {
  /** Callback when a provider is selected */
  onLogin: (provider: ZkLoginProvider) => void;
  /** Whether login is in progress */
  isLoading?: boolean;
  /** Currently loading provider */
  loadingProvider?: ZkLoginProvider | null;
  /** Providers to show (defaults to ['google']) */
  providers?: ZkLoginProvider[];
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Show "Continue with" text */
  showText?: boolean;
  /** Additional class name */
  className?: string;
}

const providerConfig: Record<ZkLoginProvider, {
  name: string;
  bgColor: string;
  textColor: string;
  hoverBg: string;
  icon: React.ReactNode;
}> = {
  google: {
    name: 'Google',
    bgColor: 'bg-white dark:bg-zinc-800',
    textColor: 'text-gray-700 dark:text-gray-200',
    hoverBg: 'hover:bg-gray-50 dark:hover:bg-zinc-700',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24">
        <path
          fill="#4285F4"
          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        />
        <path
          fill="#34A853"
          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        />
        <path
          fill="#FBBC05"
          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        />
        <path
          fill="#EA4335"
          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        />
      </svg>
    ),
  },
  apple: {
    name: 'Apple',
    bgColor: 'bg-black dark:bg-white',
    textColor: 'text-white dark:text-black',
    hoverBg: 'hover:bg-gray-900 dark:hover:bg-gray-100',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
      </svg>
    ),
  },
  twitch: {
    name: 'Twitch',
    bgColor: 'bg-[#9146FF]',
    textColor: 'text-white',
    hoverBg: 'hover:bg-[#7c3aed]',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
      </svg>
    ),
  },
  facebook: {
    name: 'Facebook',
    bgColor: 'bg-[#1877F2]',
    textColor: 'text-white',
    hoverBg: 'hover:bg-[#166fe5]',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
  },
  kakao: {
    name: 'Kakao',
    bgColor: 'bg-[#FEE500]',
    textColor: 'text-[#191919]',
    hoverBg: 'hover:bg-[#f5dc00]',
    icon: (
      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3c5.799 0 10.5 3.664 10.5 8.185 0 4.52-4.701 8.184-10.5 8.184a13.5 13.5 0 0 1-1.727-.11l-4.408 2.883c-.501.265-.678.236-.472-.413l.892-3.678c-2.88-1.46-4.785-3.99-4.785-6.866C1.5 6.665 6.201 3 12 3z" />
      </svg>
    ),
  },
};

const sizeClasses = {
  sm: 'h-9 text-sm xl:text-base px-3',
  md: 'h-11 text-base xl:text-lg px-4',
  lg: 'h-12 text-lg xl:text-xl px-5',
};

export function SocialLoginButtons({
  onLogin,
  isLoading = false,
  loadingProvider = null,
  providers = ['google'],
  size = 'md',
  showText = true,
  className = '',
}: SocialLoginButtonsProps) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {providers.map((provider) => {
        const config = providerConfig[provider];
        const isThisLoading = isLoading && loadingProvider === provider;

        return (
          <button
            key={provider}
            onClick={() => onLogin(provider)}
            disabled={isLoading}
            className={`
              flex items-center justify-center gap-3 w-full rounded-lg
              border border-gray-200 dark:border-zinc-700
              font-medium transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${config.bgColor} ${config.textColor} ${config.hoverBg}
              ${sizeClasses[size]}
            `}
          >
            {isThisLoading ? (
              <svg
                className="animate-spin w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              config.icon
            )}
            {showText && (
              <span>
                {isThisLoading ? 'Connecting...' : `Continue with ${config.name}`}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Compact version showing only icons
 */
export function SocialLoginIconButtons({
  onLogin,
  isLoading = false,
  loadingProvider = null,
  providers = ['google'],
  className = '',
}: Omit<SocialLoginButtonsProps, 'size' | 'showText'>) {
  return (
    <div className={`flex gap-3 justify-center ${className}`}>
      {providers.map((provider) => {
        const config = providerConfig[provider];
        const isThisLoading = isLoading && loadingProvider === provider;

        return (
          <button
            key={provider}
            onClick={() => onLogin(provider)}
            disabled={isLoading}
            title={`Continue with ${config.name}`}
            className={`
              flex items-center justify-center w-12 h-12 rounded-full
              border border-gray-200 dark:border-zinc-700
              transition-all duration-200
              disabled:opacity-50 disabled:cursor-not-allowed
              ${config.bgColor} ${config.textColor} ${config.hoverBg}
            `}
          >
            {isThisLoading ? (
              <svg
                className="animate-spin w-5 h-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
            ) : (
              config.icon
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * ZkLoginCallback Component
 *
 * Handles OAuth callback and displays ZK proof generation progress.
 * Place this component on your /auth/callback route.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  useZkLogin,
  useZkLoginCallback,
  type ZkLoginState,
} from '@nasun/wallet';

export interface ZkLoginCallbackProps {
  /** Callback when login succeeds */
  onSuccess?: (state: ZkLoginState) => void;
  /** Callback when login fails */
  onError?: (error: Error) => void;
  /** URL to redirect after success (if onSuccess not provided) */
  redirectUrl?: string;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** Custom error component */
  errorComponent?: (error: string, retry: () => void) => React.ReactNode;
}

type Step = 'verifying' | 'fetching_salt' | 'generating_proof' | 'complete' | 'error';

const stepLabels: Record<Step, string> = {
  verifying: 'Verifying login...',
  fetching_salt: 'Creating your address...',
  generating_proof: 'Generating secure proof...',
  complete: 'Success!',
  error: 'Something went wrong',
};

const stepProgress: Record<Step, number> = {
  verifying: 20,
  fetching_salt: 40,
  generating_proof: 70,
  complete: 100,
  error: 0,
};

export function ZkLoginCallback({
  onSuccess,
  onError,
  redirectUrl = '/',
  loadingComponent,
  errorComponent,
}: ZkLoginCallbackProps) {
  const { handleCallback } = useZkLogin();
  const { isCallback, jwt, error: callbackError } = useZkLoginCallback();

  const [step, setStep] = useState<Step>('verifying');
  const [error, setError] = useState<string | null>(null);
  const isProcessingRef = useRef(false);

  const processCallback = async () => {
    if (!jwt || isProcessingRef.current) return;

    isProcessingRef.current = true;
    setError(null);
    setStep('verifying');

    try {
      // Step 1: Verify JWT
      setStep('fetching_salt');
      await new Promise((r) => setTimeout(r, 500)); // Brief delay for UX

      // Step 2: Generate proof (this includes fetching salt)
      setStep('generating_proof');

      const state = await handleCallback(jwt);

      // Step 3: Complete
      setStep('complete');
      await new Promise((r) => setTimeout(r, 1000)); // Show success briefly

      if (onSuccess) {
        onSuccess(state);
      } else if (redirectUrl) {
        // Clear URL hash/params before redirect
        window.history.replaceState({}, '', window.location.pathname);
        window.location.href = redirectUrl;
      }
    } catch (err) {
      setStep('error');
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      onError?.(err instanceof Error ? err : new Error(message));
    } finally {
      isProcessingRef.current = false;
    }
  };

  useEffect(() => {
    if (isCallback && jwt && !isProcessingRef.current) {
      processCallback();
    } else if (isCallback && callbackError) {
      setStep('error');
      setError(callbackError);
      onError?.(new Error(callbackError));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCallback, jwt, callbackError]);

  // Not a callback URL (skip if already processing or completed)
  // After successful login, state.proof is set and isCallback becomes false
  if (!isCallback && !isProcessingRef.current && step === 'verifying') {
    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full p-6">
        <p className="text-gray-500 dark:text-gray-400">
          Invalid callback URL
        </p>
      </div>
    );
  }

  // Custom loading component
  if (loadingComponent && step !== 'error' && step !== 'complete') {
    return <>{loadingComponent}</>;
  }

  // Error state
  if (step === 'error' && error) {
    if (errorComponent) {
      return <>{errorComponent(error, processCallback)}</>;
    }

    return (
      <div className="flex flex-col items-center justify-center flex-1 h-full p-6">
        <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-4">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
        <h2 className="text-xl xl:text-2xl font-semibold text-gray-900 dark:text-white mb-2">
          Login Failed
        </h2>
        <p className="text-gray-500 dark:text-gray-400 text-center mb-6 max-w-sm">
          {error}
        </p>
        <button
          onClick={processCallback}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Loading/Progress state
  return (
    <div className="flex flex-col items-center justify-center flex-1 h-full p-6">
      {/* Progress circle */}
      <div className="relative w-20 h-20 mb-6">
        <svg className="w-20 h-20 transform -rotate-90">
          <circle
            cx="40"
            cy="40"
            r="36"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            className="text-gray-200 dark:text-zinc-700"
          />
          <circle
            cx="40"
            cy="40"
            r="36"
            stroke="currentColor"
            strokeWidth="4"
            fill="none"
            strokeDasharray={226}
            strokeDashoffset={226 - (226 * stepProgress[step]) / 100}
            className="text-blue-500 transition-all duration-500"
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {step === 'complete' ? (
            <svg
              className="w-8 h-8 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <span className="text-lg xl:text-xl font-semibold text-gray-700 dark:text-gray-300">
              {stepProgress[step]}%
            </span>
          )}
        </div>
      </div>

      {/* Status text */}
      <h2 className="text-xl xl:text-2xl font-semibold text-gray-900 dark:text-white mb-2">
        {step === 'complete' ? 'Welcome!' : 'Setting up your wallet...'}
      </h2>
      <p className="text-gray-500 dark:text-gray-400 text-center">
        {stepLabels[step]}
      </p>

      {/* Step indicators */}
      <div className="flex flex-col gap-2 mt-6 text-sm xl:text-base">
        <StepIndicator
          label="Login verified"
          status={getStepStatus('verifying', step)}
        />
        <StepIndicator
          label="Creating your unique address"
          status={getStepStatus('fetching_salt', step)}
        />
        <StepIndicator
          label="Generating zero-knowledge proof"
          status={getStepStatus('generating_proof', step)}
        />
      </div>

      {/* Time estimate */}
      {step === 'generating_proof' && (
        <p className="text-xs xl:text-sm text-gray-400 dark:text-gray-500 mt-4">
          This may take 15-30 seconds
        </p>
      )}
    </div>
  );
}

type StepStatus = 'pending' | 'active' | 'complete';

function getStepStatus(targetStep: Step, currentStep: Step): StepStatus {
  const order: Step[] = ['verifying', 'fetching_salt', 'generating_proof', 'complete'];
  const targetIndex = order.indexOf(targetStep);
  const currentIndex = order.indexOf(currentStep);

  if (currentIndex > targetIndex) return 'complete';
  if (currentIndex === targetIndex) return 'active';
  return 'pending';
}

function StepIndicator({ label, status }: { label: string; status: StepStatus }) {
  return (
    <div className="flex items-center gap-2">
      {status === 'complete' ? (
        <svg
          className="w-4 h-4 text-green-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M5 13l4 4L19 7"
          />
        </svg>
      ) : status === 'active' ? (
        <svg
          className="w-4 h-4 text-blue-500 animate-spin"
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
        <div className="w-4 h-4 rounded-full border-2 border-gray-300 dark:border-zinc-600" />
      )}
      <span
        className={
          status === 'complete'
            ? 'text-green-600 dark:text-green-400'
            : status === 'active'
            ? 'text-blue-600 dark:text-blue-400'
            : 'text-gray-400 dark:text-gray-500'
        }
      >
        {label}
      </span>
    </div>
  );
}

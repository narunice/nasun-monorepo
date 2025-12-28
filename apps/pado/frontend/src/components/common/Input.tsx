import { forwardRef } from 'react';
import type { InputHTMLAttributes, TextareaHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const baseInputStyles = 'w-full px-4 py-2 bg-theme-bg-tertiary rounded focus:outline-none focus:ring-2 focus:ring-blue-500 text-theme-text-primary placeholder-theme-text-muted';

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm text-theme-text-muted mb-1">{label}</label>
        )}
        <input
          ref={ref}
          className={`${baseInputStyles} ${error ? 'ring-2 ring-red-500' : ''} ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm text-theme-text-muted mb-1">{label}</label>
        )}
        <textarea
          ref={ref}
          className={`${baseInputStyles} resize-none font-mono text-sm ${error ? 'ring-2 ring-red-500' : ''} ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-red-400">{error}</p>
        )}
      </div>
    );
  }
);

Textarea.displayName = 'Textarea';

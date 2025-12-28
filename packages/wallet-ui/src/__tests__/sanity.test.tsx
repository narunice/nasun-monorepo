import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

describe('wallet-ui Test Infrastructure', () => {
  it('should run tests successfully', () => {
    expect(1 + 1).toBe(2);
  });

  it('should render React components', () => {
    render(<div data-testid="test-div">Hello Test</div>);
    expect(screen.getByTestId('test-div')).toHaveTextContent('Hello Test');
  });

  it('should have jest-dom matchers', () => {
    render(<button disabled>Click me</button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

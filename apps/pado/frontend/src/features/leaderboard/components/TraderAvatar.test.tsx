/**
 * TraderAvatar Tests
 * Renders an <img> when a profileImageUrl fallback is provided, else falls
 * back to a boring-avatars beam identicon (consistent across the ecosystem).
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactElement } from 'react';
import { TraderAvatar } from './TraderAvatar';

const ADDR_A = '0x' + 'aa'.repeat(32);
const ADDR_B = '0x' + 'bb'.repeat(32);

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe('TraderAvatar', () => {
  describe('image fallback', () => {
    it('renders an <img> when profileImageUrl is provided', () => {
      const { container } = renderWithClient(
        <TraderAvatar walletAddress={ADDR_A} profileImageUrl="https://example.com/a.png" />,
      );
      const img = container.querySelector('img');
      expect(img).toBeTruthy();
      expect(img!.getAttribute('src')).toBe('https://example.com/a.png');
    });
  });

  describe('identicon fallback', () => {
    it('renders an SVG identicon when no image is available', () => {
      const { container } = renderWithClient(<TraderAvatar walletAddress={ADDR_A} />);
      expect(container.querySelector('svg')).toBeTruthy();
      expect(container.querySelector('img')).toBeFalsy();
    });

    it('respects custom size on the wrapper', () => {
      const { container } = renderWithClient(
        <TraderAvatar walletAddress={ADDR_A} size={48} />,
      );
      const wrapper = container.firstChild as HTMLElement;
      expect(wrapper.style.width).toBe('48px');
      expect(wrapper.style.height).toBe('48px');
    });

    it('different addresses produce different identicons', () => {
      const { container: c1 } = renderWithClient(<TraderAvatar walletAddress={ADDR_A} />);
      const { container: c2 } = renderWithClient(<TraderAvatar walletAddress={ADDR_B} />);
      expect(c1.innerHTML).not.toBe(c2.innerHTML);
    });

    it('handles empty address without crashing', () => {
      const { container } = renderWithClient(<TraderAvatar walletAddress="" />);
      expect(container.querySelector('svg')).toBeTruthy();
    });
  });
});

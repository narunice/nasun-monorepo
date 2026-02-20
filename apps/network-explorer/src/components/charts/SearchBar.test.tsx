import { screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SearchBar } from './SearchBar';
import { renderWithRouter } from '../../test/test-utils';

// Mock sui-client to avoid real RPC calls
vi.mock('../../lib/sui-client', () => ({
  getObject: vi.fn().mockResolvedValue(null),
}));

describe('SearchBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should render the search input and button', () => {
    renderWithRouter(<SearchBar />);
    expect(screen.getByPlaceholderText(/Search by Tx Digest/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search/ })).toBeInTheDocument();
  });

  it('should show TX type badge for base58 digest input', () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    // 44 char base58 string (no 0, O, I, l)
    fireEvent.change(input, { target: { value: 'A1b2C3d4E5f6G7h8a9j1K2m3N4p5Q6r7S8t9U1V2W3x' } });
    expect(screen.getByText('TX')).toBeInTheDocument();
  });

  it('should show Address type badge for full hex ID', () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    const fullHexId = '0x' + 'a'.repeat(64);
    fireEvent.change(input, { target: { value: fullHexId } });
    expect(screen.getByText('Address')).toBeInTheDocument();
  });

  it('should show Object type badge for partial hex ID', () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    fireEvent.change(input, { target: { value: '0x1234abcd' } });
    expect(screen.getByText('Object')).toBeInTheDocument();
  });

  it('should not show type badge for empty input', () => {
    renderWithRouter(<SearchBar />);
    expect(screen.queryByText('TX')).not.toBeInTheDocument();
    expect(screen.queryByText('Object')).not.toBeInTheDocument();
    expect(screen.queryByText('Address')).not.toBeInTheDocument();
  });

  it('should not show type badge for invalid input', () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    fireEvent.change(input, { target: { value: 'invalid query' } });
    expect(screen.queryByText('TX')).not.toBeInTheDocument();
    expect(screen.queryByText('Object')).not.toBeInTheDocument();
    expect(screen.queryByText('Address')).not.toBeInTheDocument();
  });

  it('should show error for unrecognized input on submit', async () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    const form = input.closest('form')!;

    fireEvent.change(input, { target: { value: 'invalid query' } });
    fireEvent.submit(form);

    expect(await screen.findByText(/Enter a valid Transaction Digest/)).toBeInTheDocument();
  });

  it('should focus on "/" key press', () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    fireEvent.keyDown(document, { key: '/' });
    expect(document.activeElement).toBe(input);
  });

  it('should not focus on "/" key when already in an input', () => {
    renderWithRouter(
      <div>
        <input data-testid="other-input" />
        <SearchBar />
      </div>,
    );
    const otherInput = screen.getByTestId('other-input');
    otherInput.focus();
    fireEvent.keyDown(document, { key: '/' });
    // Should NOT focus the search bar because another input is focused
    expect(document.activeElement).toBe(otherInput);
  });

  it('should not submit when input is empty', () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    const form = input.closest('form')!;

    fireEvent.submit(form);
    // No error message should appear for empty submit
    expect(screen.queryByText(/Enter a valid/)).not.toBeInTheDocument();
  });

  it('should clear error when input changes', async () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    const form = input.closest('form')!;

    // Trigger error
    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.submit(form);
    expect(await screen.findByText(/Enter a valid/)).toBeInTheDocument();

    // Change input should clear error
    fireEvent.change(input, { target: { value: '0xabc' } });
    expect(screen.queryByText(/Enter a valid/)).not.toBeInTheDocument();
  });

  it('should have error styling on input when error is shown', async () => {
    renderWithRouter(<SearchBar />);
    const input = screen.getByPlaceholderText(/Search by Tx Digest/);
    const form = input.closest('form')!;

    fireEvent.change(input, { target: { value: 'invalid' } });
    fireEvent.submit(form);
    await screen.findByText(/Enter a valid/);

    expect(input.className).toContain('border-destructive');
  });

  describe('type detection edge cases', () => {
    it('should not match hex without 0x prefix', () => {
      renderWithRouter(<SearchBar />);
      const input = screen.getByPlaceholderText(/Search by Tx Digest/);
      fireEvent.change(input, { target: { value: 'abcdef1234' } });
      expect(screen.queryByText('Object')).not.toBeInTheDocument();
    });

    it('should match 0x followed by single hex char as Object', () => {
      renderWithRouter(<SearchBar />);
      const input = screen.getByPlaceholderText(/Search by Tx Digest/);
      fireEvent.change(input, { target: { value: '0x6' } });
      expect(screen.getByText('Object')).toBeInTheDocument();
    });

    it('should not match 0x with non-hex chars', () => {
      renderWithRouter(<SearchBar />);
      const input = screen.getByPlaceholderText(/Search by Tx Digest/);
      fireEvent.change(input, { target: { value: '0xZZZZ' } });
      expect(screen.queryByText('Object')).not.toBeInTheDocument();
    });
  });
});

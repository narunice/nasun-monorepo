import { describe, it, expect } from 'vitest';

describe('Test infrastructure', () => {
  it('should run tests successfully', () => {
    expect(1 + 1).toBe(2);
  });

  it('should have localStorage mock', () => {
    localStorage.setItem('test', 'value');
    expect(localStorage.getItem('test')).toBe('value');
  });

  it('should have crypto mock', () => {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    expect(arr.some((v) => v !== 0)).toBe(true);
  });
});

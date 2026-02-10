import { expect, vi, afterEach, beforeEach } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';

// Extend Vitest's expect with jest-dom matchers
expect.extend(matchers);

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock AudioContext for sound tests
class AudioContextMock {
  createOscillator() {
    return {
      type: 'sine',
      frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    };
  }
  get destination() { return {}; }
  get currentTime() { return 0; }
}
Object.defineProperty(window, 'AudioContext', { value: AudioContextMock });

// Mock Notification API
Object.defineProperty(window, 'Notification', {
  value: class NotificationMock {
    static permission = 'granted';
    static requestPermission = vi.fn().mockResolvedValue('granted');
    title: string;
    options?: NotificationOptions;
    onclick: (() => void) | null = null;
    close = vi.fn();
    constructor(title: string, options?: NotificationOptions) {
      this.title = title;
      this.options = options;
    }
  },
});

// Mock Canvas 2D context (jsdom doesn't support Canvas API)
function createMockCanvasContext(): Record<string, unknown> {
  const mockGradient = {
    addColorStop: vi.fn(),
  };
  return {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
    fillRect: vi.fn(),
    strokeRect: vi.fn(),
    clearRect: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
    beginPath: vi.fn(),
    closePath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    arcTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    bezierCurveTo: vi.fn(),
    rect: vi.fn(),
    fillText: vi.fn(),
    strokeText: vi.fn(),
    measureText: vi.fn(() => ({ width: 50 })),
    createLinearGradient: vi.fn(() => mockGradient),
    createRadialGradient: vi.fn(() => mockGradient),
    save: vi.fn(),
    restore: vi.fn(),
    scale: vi.fn(),
    rotate: vi.fn(),
    translate: vi.fn(),
    setTransform: vi.fn(),
    drawImage: vi.fn(),
    clip: vi.fn(),
    getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: vi.fn(),
  };
}

const originalGetContext = HTMLCanvasElement.prototype.getContext;
HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
  if (contextId === '2d') {
    return createMockCanvasContext() as unknown as CanvasRenderingContext2D;
  }
  return originalGetContext.call(this, contextId, ...args) as null;
} as typeof HTMLCanvasElement.prototype.getContext;

// Mock canvas.toBlob (jsdom doesn't support it)
HTMLCanvasElement.prototype.toBlob = function (
  callback: BlobCallback,
  type?: string,
) {
  const blob = new Blob(['mock-canvas-data'], { type: type || 'image/png' });
  callback(blob);
};

// Mock canvas.toDataURL
HTMLCanvasElement.prototype.toDataURL = function () {
  return 'data:image/png;base64,mockdata';
};

// Clear localStorage and mocks between tests
beforeEach(() => {
  localStorageMock.clear();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

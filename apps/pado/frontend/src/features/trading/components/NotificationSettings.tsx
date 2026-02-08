/**
 * NotificationSettings
 *
 * Popover for managing notification preferences (sounds, browser alerts).
 * Accessed via speaker icon in ChartHeader.
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  getNotificationPrefs,
  setNotificationPrefs,
  type NotificationPreferences,
} from '../../../lib/notification-preferences';
import {
  isBrowserNotifySupported,
  getBrowserNotifyPermission,
  requestNotificationPermission,
} from '../../../lib/browser-notify';
import { playSound } from '../../../lib/sounds';

export function NotificationSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>(getNotificationPrefs);
  const [browserPermission, setBrowserPermission] = useState<NotificationPermission>(
    getBrowserNotifyPermission
  );
  const popoverRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      setIsOpen(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  const updatePref = (partial: Partial<NotificationPreferences>) => {
    setNotificationPrefs(partial);
    setPrefs(getNotificationPrefs());
  };

  const handleBrowserToggle = async () => {
    if (prefs.browserNotifyEnabled) {
      updatePref({ browserNotifyEnabled: false });
      return;
    }

    // Request permission if not yet granted
    if (browserPermission !== 'granted') {
      const result = await requestNotificationPermission();
      setBrowserPermission(result);
      if (result !== 'granted') return;
    }

    updatePref({ browserNotifyEnabled: true });
  };

  const handleTestSound = () => {
    playSound('orderFilled');
  };

  return (
    <div className="relative" ref={popoverRef}>
      {/* Speaker Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`px-2 py-1 text-xs xl:text-sm rounded transition-colors ${
          isOpen
            ? 'bg-pd1 text-white'
            : 'text-theme-text-muted hover:text-theme-text-primary hover:bg-theme-bg-tertiary'
        }`}
        title="Notification Settings"
        aria-label="Notification Settings"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {prefs.soundEnabled ? (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </>
          ) : (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          )}
        </svg>
      </button>

      {/* Settings Popover */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-64 bg-theme-bg-secondary border border-theme-border rounded-lg shadow-lg z-50 p-3">
          <p className="text-xs font-medium text-theme-text-muted mb-3">Notification Settings</p>

          {/* Sound Toggle */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-theme-text-primary">Trading Sounds</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleTestSound}
                className="text-[10px] text-theme-text-muted hover:text-theme-text-secondary transition-colors"
                title="Test sound"
              >
                Test
              </button>
              <button
                onClick={() => updatePref({ soundEnabled: !prefs.soundEnabled })}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  prefs.soundEnabled ? 'bg-green-600' : 'bg-theme-border'
                }`}
                role="switch"
                aria-checked={prefs.soundEnabled}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                    prefs.soundEnabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Volume Slider */}
          {prefs.soundEnabled && (
            <div className="flex items-center gap-2 mb-3 pl-2">
              <span className="text-[10px] text-theme-text-muted w-10">Vol</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={prefs.soundVolume}
                onChange={(e) => updatePref({ soundVolume: parseFloat(e.target.value) })}
                className="flex-1 h-1 accent-pd3"
              />
              <span className="text-[10px] text-theme-text-muted w-6 text-right">
                {Math.round(prefs.soundVolume * 100)}%
              </span>
            </div>
          )}

          {/* Browser Notifications Toggle */}
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-theme-text-primary">Browser Alerts</span>
            <button
              onClick={handleBrowserToggle}
              disabled={!isBrowserNotifySupported() || browserPermission === 'denied'}
              className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-40 ${
                prefs.browserNotifyEnabled ? 'bg-green-600' : 'bg-theme-border'
              }`}
              role="switch"
              aria-checked={prefs.browserNotifyEnabled}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  prefs.browserNotifyEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
          {browserPermission === 'denied' && (
            <p className="text-[10px] text-red-400 mb-3">
              Notifications blocked. Enable in browser settings.
            </p>
          )}
          {browserPermission === 'default' && !prefs.browserNotifyEnabled && (
            <p className="text-[10px] text-theme-text-muted mb-3">
              Permission will be requested when enabled.
            </p>
          )}

          {/* Price Alerts Toggle */}
          <div className="flex items-center justify-between pt-2 border-t border-theme-border">
            <span className="text-xs text-theme-text-primary">Price Alerts</span>
            <button
              onClick={() => updatePref({ priceAlertEnabled: !prefs.priceAlertEnabled })}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                prefs.priceAlertEnabled ? 'bg-green-600' : 'bg-theme-border'
              }`}
              role="switch"
              aria-checked={prefs.priceAlertEnabled}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  prefs.priceAlertEnabled ? 'translate-x-4' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

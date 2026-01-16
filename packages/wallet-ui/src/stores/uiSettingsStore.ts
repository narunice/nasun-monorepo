/**
 * UI Settings Store
 *
 * Manages user interface preferences including:
 * - Simple/Advanced mode toggle
 * - User purpose selection
 * - Navigation state
 *
 * Persisted to localStorage for consistent experience across sessions.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Section,
  View,
  NavigationState,
  UserPurpose,
} from '../types/navigation';
import { DEFAULT_VIEWS } from '../types/navigation';

/**
 * UI Settings state interface
 */
interface UISettingsState {
  /** Whether advanced mode is enabled (shows technical details) */
  isAdvancedMode: boolean;
  /** User's primary purpose (affects default views and shortcuts) */
  userPurpose: UserPurpose;
  /** Whether onboarding has been completed */
  hasCompletedOnboarding: boolean;
  /** Current navigation state */
  navigation: NavigationState;
}

/**
 * UI Settings actions interface
 */
interface UISettingsActions {
  /** Toggle advanced mode on/off */
  toggleAdvancedMode: () => void;
  /** Set advanced mode explicitly */
  setAdvancedMode: (enabled: boolean) => void;
  /** Set user purpose */
  setUserPurpose: (purpose: UserPurpose) => void;
  /** Mark onboarding as completed */
  completeOnboarding: () => void;
  /** Navigate to a section (uses default view for that section) */
  navigateToSection: (section: Section) => void;
  /** Navigate to a specific view within a section */
  navigateToView: (section: Section, view: View, params?: Record<string, string>) => void;
  /** Go back to home */
  goHome: () => void;
  /** Reset all settings to defaults */
  resetSettings: () => void;
}

type UISettingsStore = UISettingsState & UISettingsActions;

/**
 * Default state values
 */
const DEFAULT_STATE: UISettingsState = {
  isAdvancedMode: false,
  userPurpose: 'all',
  hasCompletedOnboarding: false,
  navigation: {
    section: 'home',
    view: 'dashboard',
  },
};

/**
 * Zustand store for UI settings with localStorage persistence
 */
export const useUISettingsStore = create<UISettingsStore>()(
  persist(
    (set) => ({
      // Initial state
      ...DEFAULT_STATE,

      // Actions
      toggleAdvancedMode: () => {
        set((state) => ({ isAdvancedMode: !state.isAdvancedMode }));
      },

      setAdvancedMode: (enabled: boolean) => {
        set({ isAdvancedMode: enabled });
      },

      setUserPurpose: (purpose: UserPurpose) => {
        set({ userPurpose: purpose });
      },

      completeOnboarding: () => {
        set({ hasCompletedOnboarding: true });
      },

      navigateToSection: (section: Section) => {
        const view = DEFAULT_VIEWS[section];
        set({
          navigation: { section, view },
        });
      },

      navigateToView: (section: Section, view: View, params?: Record<string, string>) => {
        set({
          navigation: { section, view, params },
        });
      },

      goHome: () => {
        set({
          navigation: { section: 'home', view: 'dashboard' },
        });
      },

      resetSettings: () => {
        set(DEFAULT_STATE);
      },
    }),
    {
      name: 'nasun-wallet-ui-settings',
      // Only persist certain fields (not navigation state)
      partialize: (state) => ({
        isAdvancedMode: state.isAdvancedMode,
        userPurpose: state.userPurpose,
        hasCompletedOnboarding: state.hasCompletedOnboarding,
      }),
    }
  )
);

/**
 * Hook to get current advanced mode setting
 */
export function useAdvancedMode(): boolean {
  return useUISettingsStore((state) => state.isAdvancedMode);
}

/**
 * Hook to get advanced mode toggle function
 */
export function useToggleAdvancedMode(): () => void {
  return useUISettingsStore((state) => state.toggleAdvancedMode);
}

/**
 * Hook to get user purpose
 */
export function useUserPurpose(): UserPurpose {
  return useUISettingsStore((state) => state.userPurpose);
}

/**
 * Hook to check if onboarding is completed
 */
export function useHasCompletedOnboarding(): boolean {
  return useUISettingsStore((state) => state.hasCompletedOnboarding);
}

/**
 * Hook to get current navigation state
 */
export function useNavigation(): NavigationState {
  return useUISettingsStore((state) => state.navigation);
}

/**
 * Hook to get current section
 */
export function useCurrentSection(): Section {
  return useUISettingsStore((state) => state.navigation.section);
}

/**
 * Hook to get current view
 */
export function useCurrentView(): View {
  return useUISettingsStore((state) => state.navigation.view);
}

/**
 * Composite hook for UI settings (convenience)
 */
export interface UseUISettingsResult {
  isAdvancedMode: boolean;
  userPurpose: UserPurpose;
  hasCompletedOnboarding: boolean;
  navigation: NavigationState;
  toggleAdvancedMode: () => void;
  setAdvancedMode: (enabled: boolean) => void;
  setUserPurpose: (purpose: UserPurpose) => void;
  completeOnboarding: () => void;
  navigateToSection: (section: Section) => void;
  navigateToView: (section: Section, view: View, params?: Record<string, string>) => void;
  goHome: () => void;
}

export function useUISettings(): UseUISettingsResult {
  const store = useUISettingsStore();

  return {
    isAdvancedMode: store.isAdvancedMode,
    userPurpose: store.userPurpose,
    hasCompletedOnboarding: store.hasCompletedOnboarding,
    navigation: store.navigation,
    toggleAdvancedMode: store.toggleAdvancedMode,
    setAdvancedMode: store.setAdvancedMode,
    setUserPurpose: store.setUserPurpose,
    completeOnboarding: store.completeOnboarding,
    navigateToSection: store.navigateToSection,
    navigateToView: store.navigateToView,
    goHome: store.goHome,
  };
}

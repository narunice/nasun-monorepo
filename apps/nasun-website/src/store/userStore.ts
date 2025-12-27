import { create } from 'zustand';
import logger from '../lib/logger';

// Linked account information
export interface LinkedAccount {
  identityId: string;
  username: string;
  linkedAt: string;
  profileImageUrl?: string;
  // Twitter-specific
  twitterHandle?: string;
  twitterId?: string;
  // Google-specific
  email?: string;
  // MetaMask-specific
  walletAddress?: string;
}

// Simplified UserData interface for Identity Pool logins
export interface UserData {
  identityId: string;
  provider: 'Google' | 'Twitter' | 'MetaMask';
  username: string; // name from the social provider
  email?: string; // email from Google
  // Twitter-specific fields
  twitterHandle?: string;
  twitterId?: string;
  profileImageUrl?: string;
  // MetaMask-specific fields
  walletAddress?: string;
  // Linked accounts
  linkedAccounts?: {
    google?: LinkedAccount;
    twitter?: LinkedAccount;
    metamask?: LinkedAccount;
  };
}

interface UserState {
  user: UserData | null;
  isLoading: boolean;
  error: string | null;
  setUser: (userData: UserData | null) => void;
  clearUser: () => void;
  setIsLoading: (loading: boolean) => void;
  updateUserProfile: (updatedData: Partial<UserData>) => void;
}

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  setUser: (userData) => {
    logger.log('Setting user:', userData);
    set({ user: userData, isLoading: false, error: null });
  },

  clearUser: () => {
    logger.log('Clearing user');
    set({ user: null, isLoading: false, error: null });
  },

  setIsLoading: (loading) => {
    set({ isLoading: loading });
  },

  updateUserProfile: (updatedData) => {
    set((state) => {
      if (state.user) {
        // If updatedData is a complete user object (has identityId), replace entirely
        const isCompleteProfile = 'identityId' in updatedData;
        const updatedUser = isCompleteProfile
          ? updatedData as UserData  // Complete replacement
          : { ...state.user, ...updatedData };  // Partial update

        localStorage.setItem('nasun_user_profile', JSON.stringify(updatedUser));
        logger.log('Updating user profile:', updatedUser);
        return { user: updatedUser };
      }
      return state;
    });
  },
}));
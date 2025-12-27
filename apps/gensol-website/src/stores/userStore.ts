import { create } from 'zustand'

// Linked account information
export interface LinkedAccount {
  identityId: string
  username: string
  linkedAt: string
  profileImageUrl?: string
  // Twitter-specific
  twitterHandle?: string
  twitterId?: string
  // Google-specific
  email?: string
  // MetaMask-specific
  walletAddress?: string
}

// Simplified UserData interface for Identity Pool logins
export interface UserData {
  identityId: string
  provider: 'Google' | 'Twitter' | 'MetaMask'
  username: string // name from the social provider
  email?: string // email from Google
  // Twitter-specific fields
  twitterHandle?: string
  twitterId?: string
  profileImageUrl?: string
  // MetaMask-specific fields
  walletAddress?: string
  // Linked accounts
  linkedAccounts?: {
    google?: LinkedAccount
    twitter?: LinkedAccount
    metamask?: LinkedAccount
  }
}

interface UserState {
  user: UserData | null
  isLoading: boolean
  error: string | null
  setUser: (userData: UserData | null) => void
  clearUser: () => void
  setIsLoading: (loading: boolean) => void
  updateUserProfile: (updatedData: Partial<UserData>) => void
}

const STORAGE_KEY = 'gensol_user_profile'

export const useUserStore = create<UserState>((set) => ({
  user: null,
  isLoading: true,
  error: null,

  setUser: (userData) => {
    console.log('[userStore] Setting user:', userData)
    if (userData) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData))
    } else {
      localStorage.removeItem(STORAGE_KEY)
    }
    set({ user: userData, isLoading: false, error: null })
  },

  clearUser: () => {
    console.log('[userStore] Clearing user')
    localStorage.removeItem(STORAGE_KEY)
    set({ user: null, isLoading: false, error: null })
  },

  setIsLoading: (loading) => {
    set({ isLoading: loading })
  },

  updateUserProfile: (updatedData) => {
    set((state) => {
      if (state.user) {
        // If updatedData is a complete user object (has identityId), replace entirely
        const isCompleteProfile = 'identityId' in updatedData
        const updatedUser = isCompleteProfile
          ? (updatedData as UserData) // Complete replacement
          : { ...state.user, ...updatedData } // Partial update

        localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedUser))
        console.log('[userStore] Updating user profile:', updatedUser)
        return { user: updatedUser }
      }
      return state
    })
  },
}))

// Initialize from localStorage on module load
const initializeFromStorage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const userData = JSON.parse(stored) as UserData
      useUserStore.getState().setUser(userData)
    } else {
      useUserStore.getState().setIsLoading(false)
    }
  } catch (error) {
    console.error('[userStore] Failed to initialize from storage:', error)
    useUserStore.getState().setIsLoading(false)
  }
}

// Only initialize in browser environment
if (typeof window !== 'undefined') {
  initializeFromStorage()
}

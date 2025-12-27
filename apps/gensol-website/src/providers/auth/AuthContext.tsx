import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { Amplify } from 'aws-amplify'
import { fetchAuthSession } from 'aws-amplify/auth'
import { CognitoIdentityClient, GetIdCommand } from '@aws-sdk/client-cognito-identity'
import awsConfig from '../../config/awsConfig'
import { useUserStore } from '../../stores/userStore'
import type { UserData } from '../../stores/userStore'
import { generateCodeVerifier, parseJwt } from '../../utils/authUtils'

interface AuthContextType {
  user: UserData | null
  isLoading: boolean
  isAuthenticated: boolean
  error: Error | null
  signInWithGoogle: () => Promise<void>
  signInWithTwitter: () => Promise<void>
  signInWithMetaMask: (identityId: string, token: string, walletAddress: string) => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

const STORAGE_KEY = 'gensol_user_profile'

const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isLoading, setUser, clearUser, setIsLoading } = useUserStore()
  const [error, setError] = useState<Error | null>(null)

  const clearError = () => setError(null)

  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true)
    clearError()
    try {
      const cachedUser = localStorage.getItem(STORAGE_KEY)
      if (cachedUser) {
        setUser(JSON.parse(cachedUser))
      } else {
        await fetchAuthSession()
      }
    } catch {
      console.debug('[AuthContext] No active session found on startup.')
      clearUser()
    } finally {
      setIsLoading(false)
    }
  }, [setIsLoading, setUser, clearUser])

  const handleOAuthRedirect = useCallback(async (): Promise<boolean> => {
    const provider = localStorage.getItem('auth_provider_preference')
    const url = new URL(window.location.href)

    const isGoogleRedirect = provider === 'Google' && url.hash.includes('id_token')
    const isTwitterRedirect = provider === 'Twitter' && url.searchParams.has('code')

    if (!isGoogleRedirect && !isTwitterRedirect) {
      return false
    }

    setIsLoading(true)
    clearError()
    window.history.replaceState({}, document.title, window.location.pathname)

    try {
      console.debug(`[AuthContext] OAuth Redirect Debug: provider=${provider}`)

      let identityId: string | undefined
      let userInfo: { name: string; email?: string } | undefined
      let twitterUserData: {
        identityId: string
        username: string
        twitterHandle?: string
        twitterId?: string
        profileImageUrl?: string
      } | null = null

      if (provider === 'Google') {
        const idToken = new URLSearchParams(url.hash.substring(1)).get('id_token')
        console.debug('[AuthContext] Google ID token extracted:', idToken ? `${idToken.substring(0, 50)}...` : 'null')

        if (!idToken) throw new Error('Google ID token not found in redirect')

        const googlePayload = parseJwt(idToken)
        console.debug('[AuthContext] Parsed Google payload:', googlePayload)

        if (!googlePayload) throw new Error('Failed to parse Google ID token')

        userInfo = { name: googlePayload.name as string, email: googlePayload.email as string }
        identityId = await getCognitoIdentityId('Google', idToken)
      } else if (provider === 'Twitter') {
        const code = url.searchParams.get('code')
        const state = url.searchParams.get('state')
        const sessionId = localStorage.getItem('twitter_oauth_session')

        if (!code || !state || !sessionId) {
          throw new Error('Missing Twitter OAuth parameters')
        }

        twitterUserData = await handleTwitterCallback(code, state, sessionId)
        userInfo = { name: twitterUserData?.username || 'Twitter User' }
        identityId = twitterUserData?.identityId
      }

      if (identityId && userInfo) {
        const finalUserData: UserData = {
          identityId,
          provider: provider as 'Google' | 'Twitter',
          username: userInfo.name,
          email: userInfo.email,
        }

        // Add Twitter-specific data if available
        if (provider === 'Twitter' && twitterUserData) {
          finalUserData.twitterHandle = twitterUserData.twitterHandle
          finalUserData.twitterId = twitterUserData.twitterId
          finalUserData.profileImageUrl = twitterUserData.profileImageUrl
        }

        // Ensure user profile exists in DynamoDB
        console.log('[AuthContext] Ensuring user profile exists in DynamoDB...')
        const dbProfile = await ensureUserProfile(finalUserData)
        const userDataToStore = dbProfile || finalUserData

        localStorage.setItem(STORAGE_KEY, JSON.stringify(userDataToStore))
        setUser(userDataToStore)
      } else {
        throw new Error('Could not establish user identity after redirect.')
      }
    } catch (e) {
      const err = e as Error
      console.error(`[AuthContext] Error handling ${provider} redirect:`, err)
      setError(err)
      clearUser()
    } finally {
      localStorage.removeItem('auth_provider_preference')
      localStorage.removeItem('twitter_oauth_session')
      setIsLoading(false)
    }
    return true
  }, [setIsLoading, setUser, clearUser])

  useEffect(() => {
    Amplify.configure(awsConfig)

    const initializeAuth = async () => {
      const redirectHandled = await handleOAuthRedirect()
      if (!redirectHandled) {
        await checkAuthStatus()
      }
    }

    initializeAuth()
  }, [checkAuthStatus, handleOAuthRedirect])

  const handleTwitterCallback = async (code: string, state: string, sessionId: string) => {
    const response = await fetch(`${import.meta.env.VITE_TWITTER_AUTH_API}/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code, state, sessionId }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      throw new Error(errorData.message || 'Twitter OAuth callback failed')
    }

    return await response.json()
  }

  const createUserProfile = async (userData: UserData): Promise<void> => {
    try {
      const payload = JSON.stringify(userData)
      console.log('[AuthContext] Creating user profile with payload:', payload)

      const response = await fetch(`${import.meta.env.VITE_USER_PROFILE_API}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[AuthContext] POST failed with status:', response.status, 'Body:', errorText)
        throw new Error(`Failed to create user profile: ${response.status} - ${errorText}`)
      }

      console.log('[AuthContext] User profile created successfully:', userData.identityId)
    } catch (error) {
      console.error('[AuthContext] Error creating user profile:', error)
      throw error
    }
  }

  const fetchUserProfile = async (identityId: string): Promise<UserData | null> => {
    try {
      const response = await fetch(`${import.meta.env.VITE_USER_PROFILE_API}?identityId=${identityId}`)

      if (!response.ok) {
        throw new Error('Failed to fetch user profile')
      }

      return await response.json()
    } catch (error) {
      console.error('[AuthContext] Error fetching user profile:', error)
      return null
    }
  }

  const ensureUserProfile = async (userData: UserData): Promise<UserData | null> => {
    try {
      // 1. Check if profile exists
      let profile = await fetchUserProfile(userData.identityId)

      // 2. If not, create it
      if (!profile) {
        console.log('[AuthContext] User profile not found, creating...', userData.identityId)
        await createUserProfile(userData)
        profile = await fetchUserProfile(userData.identityId)
      }

      return profile
    } catch (error) {
      console.error('[AuthContext] Error ensuring user profile:', error)
      return null
    }
  }

  const getCognitoIdentityId = async (provider: 'Google', token: string): Promise<string | undefined> => {
    console.debug(`[AuthContext] Attempting to get Cognito Identity ID for provider: ${provider}`)
    const identityPoolId = import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID
    const region = import.meta.env.VITE_AWS_REGION

    if (provider === 'Google') {
      const cognitoIdentity = new CognitoIdentityClient({ region })
      const loginKey = 'accounts.google.com'
      const getIdCommand = new GetIdCommand({ IdentityPoolId: identityPoolId, Logins: { [loginKey]: token } })
      try {
        const result = await cognitoIdentity.send(getIdCommand)
        return result.IdentityId
      } catch (error) {
        console.error('[AuthContext] Failed to get Cognito Identity ID for Google.', error)
        throw error
      }
    }
  }

  const signInWithGoogle = async () => {
    clearError()
    setIsLoading(true)
    localStorage.setItem('auth_provider_preference', 'Google')
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    const redirectUri = `${window.location.origin}/callback`
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth')
    authUrl.searchParams.append('client_id', googleClientId)
    authUrl.searchParams.append('redirect_uri', redirectUri)
    authUrl.searchParams.append('response_type', 'id_token')
    authUrl.searchParams.append('scope', 'openid email profile')
    authUrl.searchParams.append('nonce', generateCodeVerifier(16))
    authUrl.searchParams.append('prompt', 'select_account')
    window.location.href = authUrl.toString()
  }

  const signInWithTwitter = async () => {
    clearError()
    setIsLoading(true)
    localStorage.setItem('auth_provider_preference', 'Twitter')

    try {
      const response = await fetch(`${import.meta.env.VITE_TWITTER_AUTH_API}/login`)
      const { authUrl, sessionId } = await response.json()

      localStorage.setItem('twitter_oauth_session', sessionId)
      window.location.href = authUrl
    } catch (error) {
      setError(error as Error)
      setIsLoading(false)
    }
  }

  const signInWithMetaMask = async (identityId: string, _token: string, walletAddress: string) => {
    clearError()
    setIsLoading(true)
    localStorage.setItem('auth_provider_preference', 'MetaMask')

    try {
      console.debug('[AuthContext] MetaMask authentication successful', { identityId, walletAddress })

      // Fetch user profile from backend
      const profileResponse = await fetch(`${import.meta.env.VITE_USER_PROFILE_API}?identityId=${identityId}`)

      if (!profileResponse.ok) {
        throw new Error('Failed to fetch user profile')
      }

      const profileData = await profileResponse.json()

      const userData: UserData = {
        identityId,
        username: profileData.username || `${walletAddress.substring(0, 6)}...${walletAddress.substring(38)}`,
        provider: 'MetaMask',
        walletAddress: walletAddress.toLowerCase(),
        profileImageUrl: profileData.profileImageUrl,
        linkedAccounts: profileData.linkedAccounts || {},
      }

      // Save to localStorage and state
      localStorage.setItem(STORAGE_KEY, JSON.stringify(userData))
      setUser(userData)

      console.log('[AuthContext] MetaMask sign-in successful:', { identityId, walletAddress })
    } catch (error) {
      console.error('[AuthContext] MetaMask sign-in failed', error)
      setError(error as Error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    try {
      // Clear local storage and state
      localStorage.removeItem(STORAGE_KEY)
      localStorage.removeItem('auth_provider_preference')
      sessionStorage.clear() // Clear any session data
      clearUser()
      console.log('[AuthContext] User logged out successfully')
    } catch (error) {
      console.error('[AuthContext] Logout failed', error)
    } finally {
      setIsLoading(false)
    }
  }

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    error,
    signInWithGoogle,
    signInWithTwitter,
    signInWithMetaMask,
    logout,
    clearError,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export default AuthProvider

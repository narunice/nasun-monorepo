import { useState, useEffect, useCallback } from "react"
import { useCurrentAccount } from "@mysten/dapp-kit"
import { getCurrentUser, fetchUserAttributes, fetchAuthSession } from "aws-amplify/auth"

const API_ENDPOINT = import.meta.env.VITE_WALLET_API_ENDPOINT

interface UserData {
  id: string
  username: string
  email: string
  suiWalletAddress?: string
}

export const useUserWallet = () => {
  const [user, setUser] = useState<UserData | null>(null)
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [loading, setLoading] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const currentAccount = useCurrentAccount()

  // 사용자 정보 및 지갑 주소 가져오기
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const currentUser = await getCurrentUser()
        const attributes = await fetchUserAttributes()
        const userId = attributes.sub ?? ""

        if (!userId) throw new Error("User ID not found")

        const res = await fetch(`${API_ENDPOINT}/wallet?userId=${userId}`)
        if (!res.ok) throw new Error("Failed to fetch wallet address")

        const { suiWalletAddress } = await res.json()

        setWalletAddress(suiWalletAddress || "")
        setUser({
          id: userId,
          username: currentUser.username,
          email: attributes?.email ?? currentUser.signInDetails?.loginId ?? "No email",
          suiWalletAddress: suiWalletAddress || undefined,
        })
      } catch (err) {
        console.error("Error fetching user data:", err)
        setError(err instanceof Error ? err.message : "Unknown error occurred")
      }
    }

    fetchUserData()
  }, [])

  // 지갑 주소 저장/업데이트
  const handleWalletAction = useCallback(async () => {
    if (!user?.id || !currentAccount?.address) return

    setLoading(true)
    setError(null)

    try {
      const session = await fetchAuthSession()
      const idToken = session.tokens?.idToken?.toString()

      if (!idToken) throw new Error("ID Token not found")

      const response = await fetch(`${API_ENDPOINT}/wallet`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          userId: user.id,
          suiWalletAddress: currentAccount.address,
        }),
      })

      if (!response.ok) throw new Error("Failed to save wallet address")

      setWalletAddress(currentAccount.address)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process wallet action")
    } finally {
      setLoading(false)
    }
  }, [currentAccount?.address, user?.id])

  // 지갑 주소 삭제
  const handleDeleteWallet = useCallback(async () => {
    if (!user?.id) return

    setDeleteLoading(true)
    setError(null)

    try {
      const session = await fetchAuthSession()
      const idToken = session.tokens?.idToken?.toString()

      if (!idToken) throw new Error("ID Token not found")

      const response = await fetch(`${API_ENDPOINT}/wallet`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ userId: user.id }),
      })

      if (!response.ok) throw new Error("Failed to delete wallet address")

      setWalletAddress("")
      setUser((prev) => (prev ? { ...prev, suiWalletAddress: undefined } : null))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error deleting wallet address")
    } finally {
      setDeleteLoading(false)
    }
  }, [user?.id])

  return {
    user,
    walletAddress,
    loading,
    deleteLoading,
    error,
    currentAccount,
    handleWalletAction,
    handleDeleteWallet,
  }
}

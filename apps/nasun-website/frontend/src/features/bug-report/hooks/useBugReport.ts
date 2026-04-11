import { useMutation, useQuery } from '@tanstack/react-query';
import { useUserStore } from '../../../store/userStore';
import type { BugReportData, BugReportResponse, BugReport, PresignedPostData } from '../types';

const BUG_REPORT_API_URL = import.meta.env.VITE_BUG_REPORT_API_URL;

// ============================================
// Resolve wallet address from user store (nasun wallet login)
// ============================================

function getWalletAddress(user: ReturnType<typeof useUserStore.getState>['user']): string | undefined {
  if (!user) return undefined;
  // Primary: nasun wallet linked account
  const nasunWallet = user.linkedAccounts?.['nasun wallet']?.walletAddress;
  if (nasunWallet) return nasunWallet;
  // Fallback: direct walletAddress on user object
  return user.walletAddress;
}

// ============================================
// Submit bug report
// ============================================

async function submitBugReport(
  data: BugReportData,
  token: string
): Promise<BugReportResponse> {
  const res = await fetch(`${BUG_REPORT_API_URL}/bug-report`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export function useBugReport() {
  const user = useUserStore((s) => s.user);
  const walletAddress = getWalletAddress(user);
  const walletConnected = !!walletAddress;

  const mutation = useMutation({
    mutationFn: (data: Omit<BugReportData, 'displayName' | 'walletAddress'>) => {
      if (!user?.cognitoToken) {
        throw new Error('Not authenticated');
      }
      if (!walletAddress) {
        throw new Error('Wallet not connected');
      }
      return submitBugReport(
        {
          ...data,
          displayName: user.customDisplayName || user.username,
          walletAddress,
        },
        user.cognitoToken
      );
    },
  });

  return { ...mutation, walletConnected };
}

// ============================================
// Get my reports
// ============================================

async function fetchMyReports(token: string): Promise<BugReport[]> {
  const res = await fetch(`${BUG_REPORT_API_URL}/bug-report/my-reports`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  return data.reports || [];
}

export function useMyBugReports() {
  const user = useUserStore((s) => s.user);

  return useQuery({
    queryKey: ['bug-reports', 'my-reports'],
    queryFn: () => fetchMyReports(user!.cognitoToken!),
    enabled: !!user?.cognitoToken,
    staleTime: 60_000,
  });
}

// ============================================
// Get presigned upload URL
// ============================================

async function getUploadUrl(
  contentType: string,
  token: string
): Promise<PresignedPostData> {
  const res = await fetch(
    `${BUG_REPORT_API_URL}/bug-report/upload-url?contentType=${encodeURIComponent(contentType)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function uploadScreenshot(
  file: File,
  token: string,
): Promise<string> {
  const presigned = await getUploadUrl(file.type, token);

  // Upload to S3 using presigned POST
  const formData = new FormData();
  Object.entries(presigned.fields).forEach(([key, value]) => {
    formData.append(key, value);
  });
  formData.append('file', file);

  const uploadRes = await fetch(presigned.url, {
    method: 'POST',
    body: formData,
  });

  if (!uploadRes.ok) {
    throw new Error('Screenshot upload failed');
  }

  return presigned.key;
}

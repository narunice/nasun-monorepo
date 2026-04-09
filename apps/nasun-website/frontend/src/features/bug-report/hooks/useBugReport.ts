import { useMutation } from '@tanstack/react-query';
import { useUserStore } from '../../../store/userStore';
import type { BugReportData, BugReportResponse } from '../types';

const BUG_REPORT_API_URL = import.meta.env.VITE_BUG_REPORT_API_URL;

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

  return useMutation({
    mutationFn: (data: Omit<BugReportData, 'displayName'>) => {
      if (!user?.cognitoToken) {
        throw new Error('Not authenticated');
      }
      return submitBugReport(
        { ...data, displayName: user.customDisplayName || user.username },
        user.cognitoToken
      );
    },
  });
}

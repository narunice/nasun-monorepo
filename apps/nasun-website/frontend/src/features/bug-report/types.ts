export interface BugReportData {
  title: string;
  category: string;
  description: string;
  reproSteps?: string;
  displayName?: string;
}

export interface BugReportResponse {
  reportId: string;
  message: string;
}

export const BUG_CATEGORIES = ['UI Bug', 'Wallet Issue', 'Feature Request', 'Other'] as const;
export type BugCategory = typeof BUG_CATEGORIES[number];

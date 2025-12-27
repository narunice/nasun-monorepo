// src/types/grants.ts
export interface HistoryItem {
  date: string;
  event_name: string;
  prize: string;
  amount: string;
  project: string;
  host: string[];
  logos: {
    dark: string[];
  };
}

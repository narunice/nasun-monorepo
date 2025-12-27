// Roadmap Type Definitions

export type RoadmapStatus = "completed" | "in-progress" | "upcoming";

export interface RoadmapItem {
  id: string;
  title: string;
  description?: string;
  status: RoadmapStatus;
  progress?: number; // 0-100 (for in-progress items)
  link?: string; // External link (for completed items)
  expectedDate?: string; // Expected completion date (for upcoming items)
}

export interface RoadmapYear {
  year: string;
  description: string;
  web3: RoadmapItem[];
  content: RoadmapItem[];
}

export interface RoadmapMetrics {
  awards: number;
  years: number;
  community: number;
}

export interface RoadmapTrack {
  title: string;
  color: "c3" | "c5";
}

export interface RoadmapTracks {
  web3: RoadmapTrack;
  content: RoadmapTrack;
}

// TPS history data point for chart
export interface TPSDataPoint {
  time: string;
  tps: number;
}

// Max history points to keep
export const MAX_TPS_HISTORY = 30;
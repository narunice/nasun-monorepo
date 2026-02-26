// Token distribution data for the pie chart
export interface DistributionSubItem {
  name: string;
  percentage: number;
  amount: number;
}

export interface DistributionItem {
  name: string;
  value: number;
  amount: number;
  subItems?: DistributionSubItem[];
}

export const distributionData: DistributionItem[] = [
  {
    name: "Community & Ecosystem",
    value: 40,
    amount: 4000000000,
  },
  {
    name: "Team & Advisors",
    value: 17,
    amount: 1700000000,
  },
  {
    name: "Public & Private Investors (all rounds)",
    value: 16,
    amount: 1600000000,
  },
  {
    name: "Treasury Reserve",
    value: 12,
    amount: 1200000000,
  },
  {
    name: "Foundation",
    value: 7,
    amount: 700000000,
  },
  {
    name: "Early Contributors",
    value: 4,
    amount: 400000000,
  },
  {
    name: "Ecosystem Liquidity & Market Making",
    value: 4,
    amount: 400000000,
  },
];

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
    value: 50,
    amount: 5000000000,
  },
  {
    name: "Team & Advisors",
    value: 17,
    amount: 1700000000,
  },
  {
    name: "Public Sale & Liquidity",
    value: 15,
    amount: 1500000000,
  },
  {
    name: "Early Contributors",
    value: 10,
    amount: 1000000000,
  },
  {
    name: "Strategic Partners",
    value: 5,
    amount: 500000000,
  },
  {
    name: "Foundation",
    value: 3,
    amount: 300000000,
  },
];

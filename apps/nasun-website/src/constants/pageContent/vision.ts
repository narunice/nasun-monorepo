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
    name: "Community Treasury & Ecosystem",
    value: 40,
    amount: 4000000000,
  },
  {
    name: "Team and Advisors",
    value: 20,
    amount: 2000000000,
  },
  {
    name: "Public Sales and Liquidity",
    value: 15,
    amount: 1500000000,
  },
  {
    name: "Early Contributors, Testers & Campaigns",
    value: 10,
    amount: 1000000000,
  },
  {
    name: "Strategic Partners",
    value: 10,
    amount: 1000000000,
  },
  {
    name: "Foundation",
    value: 5,
    amount: 500000000,
  },
];

export interface FinnhubProfile2 {
  name: string;
  ticker: string;
  marketCapitalization: number;
  logo: string;
  finnhubIndustry: string;
  weburl: string;
  country: string;
  currency: string;
}

export interface FinnhubMetric {
  metric: {
    peBasicExclExtraTTM: number | null;
    '52WeekHigh': number;
    '52WeekLow': number;
    dividendYieldIndicatedAnnual: number | null;
    beta: number | null;
  };
}

export interface FinnhubNewsItem {
  headline: string;
  url: string;
  datetime: number;
  source: string;
  summary: string;
}

export interface CompanyProfile {
  name: string;
  ticker: string;
  marketCap: number;
  logo: string;
  industry: string;
  currency: string;
}

export interface CompanyMetrics {
  pe: number | null;
  weekHigh52: number;
  weekLow52: number;
  dividendYield: number | null;
  beta: number | null;
}

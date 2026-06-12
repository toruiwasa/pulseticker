export interface CandlePoint {
  time: number;
  value: number;
}

export type ChartRange = '1D' | '1Y';

export const SUPPORTED_RANGES: readonly ChartRange[] = ['1D', '1Y'];

export const RESERVED_RANGES = ['1W', '1M', '3M', '6M', '5Y', 'MAX'] as const;

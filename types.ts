
export interface Asset {
  symbol: string;
  weight: number;
  expectedReturn: number;
  volatility: number;
  sector: string;
  dividendYield: number; // Annual dividend yield (%)
  currentPrice: number;  // Latest market price
  isSimulated?: boolean;
}

export interface YearlyMetric {
  year: number;
  return: number;
  benchmarkReturn: number;
  alpha: number;
  beta: number;
}

export interface PortfolioMetrics {
  expectedReturn: number;
  volatility: number;
  sharpeRatio: number;
  sortinoRatio: number;
  beta: number;
  alpha: number;
  maxDrawdown: number;
  calmarRatio: number;
  var95: number;
  cvar95: number;
  // Professional Grade Metrics
  downsideDeviation: number;
  avgDrawdown: number;
  maxDrawdownDuration: number;
  avgDrawdownDuration: number;
  trackingError: number;
  informationRatio: number;
  avgCorrelation: number;
  skewness: number;
  riskContributions: Record<string, number>;
}

export interface HistoricalPoint {
  date: string;
  value: number;
  benchmarkValue: number;
}

export interface SimulationPath {
  year: number;
  value: number;
}

export type OptimizationStrategy = 'sharpe' | 'min_var' | 'diversification' | 'sortino';

export interface OptimizationConstraints {
  minAssetWeight: number;
  maxAssetWeight: number;
  assetLimits?: Record<string, { min: number; max: number }>;
  sectorLimits: Record<string, { min: number; max: number }>;
  startDate?: string;
  endDate?: string;
  initialBalance?: number;
  contributionAmount?: number;
  contributionFrequency?: 'weekly' | 'fortnightly' | 'monthly';
  simulationYears?: number;
  benchmark?: string;
  betaFrequency?: 'daily' | 'annual';
  useBayesianShrinkage?: boolean;
}

export interface OptimizationResult {
  assets: Asset[];
  metrics: PortfolioMetrics;
  history: HistoricalPoint[];
  monteCarlo: number[][];
  yearlyMetrics: YearlyMetric[];
  metadata?: {
    actualStartDate: string;
    limitingAsset?: string;
    requestedStartDate: string;
  };
}

export interface User {
  id: string;
  username: string;
}

export interface SavedPortfolio {
  id: string;
  userId: string;
  name: string;
  tickers: string[];
  strategy: OptimizationStrategy;
  constraints: OptimizationConstraints;
  timestamp: number;
}

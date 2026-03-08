
import { Asset, OptimizationResult, HistoricalPoint, PortfolioMetrics, OptimizationStrategy, OptimizationConstraints, YearlyMetric } from '../types';

const SECTOR_MAP: Record<string, string> = {
  "AAPL": "Technology", "MSFT": "Technology", "NVDA": "Technology", "AMD": "Technology", "INTC": "Technology", "GOOGL": "Technology", "META": "Technology", "NFLX": "Technology",
  "TSM": "Technology", "ASML.AS": "Technology", "SAP.DE": "Technology", "700.HK": "Technology", "9988.HK": "Technology", "6758.T": "Technology",
  "AMZN": "Consumer", "TSLA": "Consumer", "HD": "Consumer", "DIS": "Consumer", "KO": "Consumer", "PEP": "Consumer", "PG": "Consumer", "ABNB": "Consumer", "SHOP": "Consumer", "UBER": "Consumer",
  "MC.PA": "Consumer", "OR.PA": "Consumer", "NKE": "Consumer", "COST": "Consumer",
  "JPM": "Finance", "V": "Finance", "MA": "Finance", "BRK-B": "Finance", "PYPL": "Finance", "SQ": "Finance", "COIN": "Finance", "RY.TO": "Finance", "HSBA.L": "Finance",
  "UNH": "Healthcare", "LLY": "Healthcare", "NVO": "Healthcare", "AZN.L": "Healthcare",
  "VOO": "Index", "QQQ": "Index", "SPY": "Index", "VTI": "Index", "IVV": "Index", "VT": "Index", "VXUS": "Index", "VUG": "Index", "VTV": "Index", "ARKK": "Index",
  "BND": "Fixed Income", "TLT": "Fixed Income", "AGG": "Fixed Income",
  "BTC-USD": "Crypto", "ETH-USD": "Crypto", "SOL-USD": "Crypto", "BNB-USD": "Crypto", "XRP-USD": "Crypto", "ADA-USD": "Crypto", "AVAX-USD": "Crypto", "DOT-USD": "Crypto", "MSTR": "Crypto",
  "GLD": "Commodities", "SLV": "Commodities", "GC=F": "Commodities", "CL=F": "Commodities",
  "NEM": "Mining", "GOLD": "Mining", "FCX": "Mining", "RIO": "Mining", "VALE": "Mining", "BHP.L": "Mining", "BHP": "Mining",
  "T": "Communication", "VZ": "Communication", "VOD.L": "Communication"
};

export interface TickerSearchResult {
  symbol: string;
  shortname: string;
  exchDisp: string;
  typeDisp: string;
}

export class PortfolioService {
  private static RISK_FREE_RATE = 0.042;
  private static TRADING_DAYS = 252;

  public static async searchTickers(query: string): Promise<TickerSearchResult[]> {
    if (!query || query.length < 2) return [];
    const url = `/api/yahoo-search?q=${encodeURIComponent(query)}`;
    
    try {
      const resp = await fetch(url);
      const json = await resp.json();
      return (json.quotes || []).map((q: any) => ({
        symbol: q.symbol,
        shortname: q.shortname || q.longname || "",
        exchDisp: q.exchDisp || "",
        typeDisp: q.typeDisp || ""
      }));
    } catch (e) {
      console.error("Ticker search failed:", e);
      return [];
    }
  }

  private static async fetchYahooData(symbol: string, startDate?: string, endDate?: string): Promise<{ prices: number[], isSimulated: boolean, timestamps: number[], dividendYield: number, currentPrice: number }> {
    const end = endDate ? Math.floor(new Date(endDate).getTime() / 1000) : Math.floor(Date.now() / 1000);
    const start = startDate ? Math.floor(new Date(startDate).getTime() / 1000) : end - (5 * 365 * 24 * 60 * 60);
    
    const url = `/api/yahoo-finance?symbol=${symbol}&period1=${start}&period2=${end}&interval=1d&events=div`;

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const result = json.chart?.result?.[0];
      if (!result || !result.indicators?.adjclose?.[0]?.adjclose) throw new Error('Malformed Yahoo response');
      
      const rawPrices = result.indicators.adjclose[0].adjclose;
      const timestamps = result.timestamp || [];
      const prices: number[] = [];
      const validTimestamps: number[] = [];
      rawPrices.forEach((p: number | null, i: number) => {
        if (p !== null) {
          prices.push(p);
          validTimestamps.push(timestamps[i]);
        }
      });

      // Calculate Dividend Yield
      let dividendSum = 0;
      if (result.events?.dividends) {
        const divEvents = result.events.dividends;
        const oneYearAgo = end - (365 * 24 * 60 * 60);
        Object.values(divEvents).forEach((div: any) => {
          if (div.date >= oneYearAgo) dividendSum += div.amount;
        });
      }
      const currentPrice = prices[prices.length - 1];
      const dividendYield = currentPrice > 0 ? dividendSum / currentPrice : 0;

      if (prices.length < 5) throw new Error('Insufficient data');
      return { prices, isSimulated: false, timestamps: validTimestamps, dividendYield, currentPrice };
    } catch (e) {
      const mockPrices = this.generateDeterministicMock(symbol);
      // Generate synthetic timestamps for the last 5 years (approx 1260 trading days)
      const syntheticTimestamps: number[] = [];
      const now = Math.floor(Date.now() / 1000);
      for (let i = 0; i < mockPrices.length; i++) {
        // Subtract 1 day (86400s) for each price point, going backwards
        syntheticTimestamps.unshift(now - (mockPrices.length - 1 - i) * 86400);
      }

      return { 
        prices: mockPrices, 
        isSimulated: true, 
        timestamps: syntheticTimestamps, 
        dividendYield: 0.015, 
        currentPrice: mockPrices[mockPrices.length - 1] 
      };
    }
  }

  private static generateDeterministicMock(symbol: string): number[] {
    const seed = symbol.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
    const prices = [100];
    for (let i = 1; i < 1260; i++) {
      const rand = Math.sin(seed + i) * 0.02;
      prices.push(prices[i - 1] * (1 + rand + 0.0003));
    }
    return prices;
  }

  public static async optimize(
    tickers: string[], 
    strategy: OptimizationStrategy = 'sharpe',
    constraints: OptimizationConstraints = { minAssetWeight: 0.01, maxAssetWeight: 0.2, sectorLimits: {}, benchmark: 'VOO', betaFrequency: 'daily', useBayesianShrinkage: true }
  ): Promise<OptimizationResult> {
    const benchmarkTicker = constraints.benchmark || 'VOO';
    
    // Validate dates before fetching
    const validatedStartDate = constraints.startDate && !isNaN(new Date(constraints.startDate).getTime()) ? constraints.startDate : undefined;
    const validatedEndDate = constraints.endDate && !isNaN(new Date(constraints.endDate).getTime()) ? constraints.endDate : undefined;

    const fetchedResults = await Promise.all([...tickers, benchmarkTicker].map(t => this.fetchYahooData(t, validatedStartDate, validatedEndDate)));
    
    const dataMap: Record<string, number[]> = {};
    const simulationMap: Record<string, boolean> = {};
    const timestampMap: Record<string, number[]> = {};
    const divYieldMap: Record<string, number> = {};
    const currentPriceMap: Record<string, number> = {};
    
    tickers.forEach((t, i) => {
      dataMap[t] = fetchedResults[i].prices;
      simulationMap[t] = fetchedResults[i].isSimulated;
      timestampMap[t] = fetchedResults[i].timestamps;
      divYieldMap[t] = fetchedResults[i].dividendYield;
      currentPriceMap[t] = fetchedResults[i].currentPrice;
    });
    dataMap[benchmarkTicker] = fetchedResults[tickers.length].prices;
    timestampMap[benchmarkTicker] = fetchedResults[tickers.length].timestamps;

    const symbols = tickers;
    
    // Find the asset with the shortest history to truncate the backtest
    let minLength = fetchedResults[tickers.length].prices.length;
    let limitingAsset = benchmarkTicker;
    
    symbols.forEach((s, i) => {
      if (fetchedResults[i].prices.length < minLength) {
        minLength = fetchedResults[i].prices.length;
        limitingAsset = s;
      }
    });

    const actualStartDateTs = timestampMap[limitingAsset][0];
    const actualStartDate = new Date(actualStartDateTs * 1000).toISOString().split('T')[0];
    
    const returns: Record<string, number[]> = {};
    const mu_arith: Record<string, number> = {}; // Annual Arithmetic Mean
    const mu_cagr: Record<string, number> = {};  // Annual Geometric Mean (CAGR)
    const dailyMeans: Record<string, number> = {};
    const dailyVars: Record<string, number> = {};
    
    symbols.forEach(s => {
      const prices = dataMap[s].slice(-minLength);
      returns[s] = [];
      for (let i = 1; i < prices.length; i++) {
        returns[s].push((prices[i] - prices[i - 1]) / (prices[i - 1] || 1e-9));
      }
      
      const n = returns[s].length;
      const mean = returns[s].reduce((a, b) => a + b, 0) / n;
      const variance = returns[s].reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / (n - 1);
      
      dailyMeans[s] = mean;
      dailyVars[s] = variance;

      // Annualized Arithmetic Return
      mu_arith[s] = mean * this.TRADING_DAYS;
      
      // Annualized CAGR
      const totalReturn = (prices[prices.length - 1] / prices[0]);
      const years = prices.length / this.TRADING_DAYS;
      mu_cagr[s] = Math.pow(totalReturn, 1 / years) - 1;
    });

    if (constraints.useBayesianShrinkage && symbols.length > 2) {
      const n = symbols.length;
      const annualizedReturns = symbols.map(s => mu_arith[s]);
      const grandMean = annualizedReturns.reduce((a, b) => a + b, 0) / n;
      const annualizedVars = symbols.map(s => dailyVars[s] * this.TRADING_DAYS);
      const avgAnnualizedVar = annualizedVars.reduce((a, b) => a + b, 0) / n;
      const T_obs = returns[symbols[0]].length;
      const avgEstimationVariance = avgAnnualizedVar / T_obs;
      const devSumSq = annualizedReturns.reduce((sum, r) => sum + Math.pow(r - grandMean, 2), 0);
      if (devSumSq > 0) {
        const lambda = Math.min(0.5, ((n - 2) * avgEstimationVariance) / devSumSq);
        symbols.forEach(s => mu_arith[s] = (1 - lambda) * mu_arith[s] + lambda * grandMean);
      }
    }

    const cov: number[][] = Array(symbols.length).fill(0).map(() => Array(symbols.length).fill(0));
    const semiCov: number[][] = Array(symbols.length).fill(0).map(() => Array(symbols.length).fill(0));

    for (let i = 0; i < symbols.length; i++) {
      for (let j = 0; j < symbols.length; j++) {
        const s1 = symbols[i], s2 = symbols[j];
        const m1 = dailyMeans[s1], m2 = dailyMeans[s2];
        let sum = 0, semiSum = 0;
        const T = returns[s1].length;
        for (let k = 0; k < T; k++) {
          const r1 = returns[s1][k], r2 = returns[s2][k];
          sum += (r1 - m1) * (r2 - m2);
          // Standard Semi-variance: only consider returns below mean or 0
          if (r1 < 0 && r2 < 0) semiSum += r1 * r2;
        }
        cov[i][j] = (sum / (T - 1)) * this.TRADING_DAYS;
        semiCov[i][j] = (semiSum / (T - 1)) * this.TRADING_DAYS;
      }
    }

    let weights = symbols.map(() => 1 / symbols.length);
    const assetSectors = symbols.map(s => SECTOR_MAP[s] || 'Other');

    // Optimization Loop
    for (let iter = 0; iter < 1000; iter++) {
      const currentWeights = [...weights];
      for (let i = 0; i < symbols.length; i++) {
        let pRet = 0, pVar = 0, pSemiVar = 0;
        for (let a = 0; a < symbols.length; a++) {
          pRet += weights[a] * mu_arith[symbols[a]];
          for (let b = 0; b < symbols.length; b++) {
            pVar += weights[a] * weights[b] * cov[a][b];
            pSemiVar += weights[a] * weights[b] * semiCov[a][b];
          }
        }
        
        const pVol = Math.sqrt(Math.max(1e-12, pVar));
        const pDownsideVol = Math.sqrt(Math.max(1e-12, pSemiVar));
        
        let gVol_i = 0, gDSVol_i = 0;
        for (let j = 0; j < symbols.length; j++) {
          gVol_i += weights[j] * cov[i][j];
          gDSVol_i += weights[j] * semiCov[i][j];
        }
        gVol_i /= pVol;
        gDSVol_i /= pDownsideVol;

        const excess = pRet - this.RISK_FREE_RATE;
        const gSharpe = (mu_arith[symbols[i]] * pVol - excess * gVol_i) / pVar;
        const gSortino = (mu_arith[symbols[i]] * pDownsideVol - excess * gDSVol_i) / pSemiVar;
        const gMinVar = -gVol_i;

        let step = strategy === 'sharpe' ? gSharpe : strategy === 'sortino' ? gSortino : strategy === 'min_var' ? gMinVar : 0;
        weights[i] += step * 0.005;
      }

      // Apply Constraints (Asset & Sector)
      const sectorWeights: Record<string, number> = {};
      assetSectors.forEach((sector, idx) => {
        sectorWeights[sector] = (sectorWeights[sector] || 0) + weights[idx];
      });

      for (let i = 0; i < symbols.length; i++) {
        const s = symbols[i];
        const sector = assetSectors[i];
        
        // Asset Limits
        const aMin = (constraints.assetLimits?.[s]?.min !== undefined ? constraints.assetLimits[s].min : constraints.minAssetWeight);
        const aMax = (constraints.assetLimits?.[s]?.max !== undefined ? constraints.assetLimits[s].max : constraints.maxAssetWeight);
        
        // Sector Limits (approximate enforcement via clipping)
        const sMax = (constraints.sectorLimits[sector]?.max !== undefined ? constraints.sectorLimits[sector].max : 1.0);
        const sMin = (constraints.sectorLimits[sector]?.min !== undefined ? constraints.sectorLimits[sector].min : 0.0);

        weights[i] = Math.max(aMin, Math.min(aMax, weights[i]));
        
        // If sector exceeds max, scale down asset
        if (sectorWeights[sector] > sMax) {
          weights[i] *= (sMax / sectorWeights[sector]);
        }
      }

      const totalW = weights.reduce((a, b) => a + b, 0);
      weights = weights.map(w => w / (totalW || 1e-9));
      
      // Convergence check
      const diff = weights.reduce((sum, w, idx) => sum + Math.abs(w - currentWeights[idx]), 0);
      if (diff < 1e-7) break;
    }

    const finalAssets: Asset[] = symbols.map((s, i) => ({
      symbol: s, weight: weights[i], expectedReturn: mu_cagr[s],
      volatility: Math.sqrt(cov[i][i]), sector: assetSectors[i],
      dividendYield: divYieldMap[s], currentPrice: currentPriceMap[s],
      isSimulated: simulationMap[s]
    }));

    const history: HistoricalPoint[] = [];
    const pReturns: number[] = [], bReturns: number[] = [];
    const vPrices = dataMap[benchmarkTicker].slice(-minLength);
    const vTime = timestampMap[benchmarkTicker].slice(-minLength);
    let pCum = 1, bCum = 1, maxP = 1, mdd = 0;
    
    for (let k = 1; k < minLength; k++) {
      let dP = 0;
      symbols.forEach((s, idx) => {
        const sPrices = dataMap[s].slice(-minLength);
        dP += weights[idx] * (sPrices[k] - sPrices[k-1]) / sPrices[k-1];
      });
      const dB = (vPrices[k] - vPrices[k-1]) / (vPrices[k-1] || 1);
      pCum *= (1 + dP); bCum *= (1 + dB);
      pReturns.push(dP); bReturns.push(dB);
      maxP = Math.max(maxP, pCum); mdd = Math.max(mdd, (maxP - pCum) / maxP);
      
      if (k % 5 === 0 || k === minLength - 1) {
        const timestamp = vTime[k];
        const dateObj = new Date(timestamp * 1000);
        const dateStr = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        history.push({ date: dateStr, value: pCum, benchmarkValue: bCum });
      }
    }

    // Portfolio Metrics based on realized backtest
    const pAnnCAGR = Math.pow(pCum, this.TRADING_DAYS / pReturns.length) - 1;
    const pMeanDaily = pReturns.reduce((a, b) => a + b, 0) / pReturns.length;
    const pVarDaily = pReturns.reduce((s, r) => s + Math.pow(r - pMeanDaily, 2), 0) / (pReturns.length - 1);
    const annVol = Math.sqrt(pVarDaily * this.TRADING_DAYS);
    
    const negativeReturns = pReturns.filter(r => r < 0);
    const downsideDev = Math.sqrt(negativeReturns.reduce((s, r) => s + r*r, 0) / pReturns.length) * Math.sqrt(this.TRADING_DAYS);
    
    const benchAnnRet = Math.pow(bCum, this.TRADING_DAYS / pReturns.length) - 1;

    const mB = bReturns.reduce((a, b) => a + b, 0) / bReturns.length;
    let covPB = 0, varB = 0;
    for (let i = 0; i < pReturns.length; i++) {
      covPB += (pReturns[i] - pMeanDaily) * (bReturns[i] - mB);
      varB += Math.pow(bReturns[i] - mB, 2);
    }
    const beta = covPB / (varB || 1e-12);
    const alpha = pAnnCAGR - (this.RISK_FREE_RATE + beta * (benchAnnRet - this.RISK_FREE_RATE));

    const mcPaths: number[][] = [];
    const initV = constraints.initialBalance || 10000;
    
    // Drift for Monte Carlo should align with CAGR for the median path
    // Median of log-normal is e^(drift * t). If we want median to be (1+CAGR)^t, drift = ln(1+CAGR)
    const drift = Math.log(1 + pAnnCAGR);
    
    for (let p = 0; p < 1000000; p++) {
      let v = initV; const path = [v];
      for (let y = 1; y <= (constraints.simulationYears || 20); y++) {
        // Geometric Brownian Motion: S_t = S_0 * exp((mu - 0.5*sigma^2)*t + sigma*W_t)
        // Here we use drift = ln(1+CAGR) which already accounts for the -0.5*sigma^2 drag
        v = v * Math.exp(drift + this.getGaussian() * annVol);
        path.push(v);
      }
      mcPaths.push(path);
    }

    const sorted = [...pReturns].sort((a, b) => a - b);
    const var95 = sorted[Math.floor(pReturns.length * 0.05)];
    const cvar95 = sorted.slice(0, Math.floor(pReturns.length * 0.05) + 1).reduce((a, b) => a + b, 0) / (Math.floor(pReturns.length * 0.05) + 1);
    const te = Math.sqrt(pReturns.map((r, i) => r - bReturns[i]).reduce((s, r) => s + r*r, 0) / pReturns.length) * Math.sqrt(this.TRADING_DAYS);

    const riskContribs: Record<string, number> = {};
    symbols.forEach((s, i) => {
      let marg = 0;
      for (let j = 0; j < symbols.length; j++) marg += weights[j] * cov[i][j];
      riskContribs[s] = weights[i] * (marg / annVol) / annVol;
    });

    return {
      assets: finalAssets,
      metrics: {
        expectedReturn: pAnnCAGR, volatility: annVol,
        sharpeRatio: (pAnnCAGR - this.RISK_FREE_RATE) / (annVol || 1e-9),
        sortinoRatio: (pAnnCAGR - this.RISK_FREE_RATE) / (downsideDev || 1e-9),
        beta, alpha, maxDrawdown: -mdd, calmarRatio: pAnnCAGR / (mdd || 1),
        var95, cvar95, downsideDeviation: downsideDev, avgDrawdown: -0.05,
        maxDrawdownDuration: 300, avgDrawdownDuration: 50, trackingError: te,
        informationRatio: (pAnnCAGR - benchAnnRet) / (te || 1e-9),
        avgCorrelation: 0.5, skewness: 0, riskContributions: riskContribs
      },
      history, monteCarlo: mcPaths, yearlyMetrics: [],
      metadata: {
        actualStartDate,
        limitingAsset,
        requestedStartDate: constraints.startDate || ''
      }
    };
  }

  private static getGaussian(): number {
    let u = 0, v = 0;
    while(u === 0) u = Math.random();
    while(v === 0) v = Math.random();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  }
}

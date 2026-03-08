
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { PortfolioService, TickerSearchResult } from './services/portfolioService';
import { OptimizationResult, OptimizationStrategy, OptimizationConstraints, User, SavedPortfolio } from './types';
import { MetricCard } from './components/MetricCard';
import { PerformanceChart } from './components/PerformanceChart';
import { AssetAllocationChart } from './components/AssetAllocationChart';
import { MonteCarloChart } from './components/MonteCarloChart';
import { GoogleGenAI } from "@google/genai";

const DEFAULT_TICKERS = ["AAPL", "MSFT", "NVDA", "GLD", "VOO", "JPM", "BTC-USD"];

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

type Currency = 'USD' | 'AUD' | 'EUR' | 'GBP';

const CURRENCY_SYMBOLS: Record<Currency, string> = {
  USD: '$',
  AUD: 'A$',
  EUR: '€',
  GBP: '£'
};

// Static exchange rates relative to USD (1 USD = X Currency)
const EXCHANGE_RATES: Record<Currency, number> = {
  USD: 1.0,
  AUD: 1.54,
  EUR: 0.94,
  GBP: 0.79
};

const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'optimize' | 'allocation' | 'risk' | 'simulations' | 'methodology' | 'ai-analysis'>('dashboard');
  const [currency, setCurrency] = useState<Currency>('USD');
  const prevCurrencyRef = useRef<Currency>('USD');
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [newTicker, setNewTicker] = useState('');
  const [strategy, setStrategy] = useState<OptimizationStrategy>('sharpe');
  
  const [searchResults, setSearchResults] = useState<TickerSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);

  const defaultEndDate = new Date().toISOString().split('T')[0];
  const defaultStartDate = new Date(new Date().setFullYear(new Date().getFullYear() - 3)).toISOString().split('T')[0];

  const [constraints, setConstraints] = useState<OptimizationConstraints>({
    minAssetWeight: 0.01,
    maxAssetWeight: 0.30,
    assetLimits: {},
    sectorLimits: {},
    startDate: defaultStartDate,
    endDate: defaultEndDate,
    initialBalance: 10000,
    contributionAmount: 500,
    contributionFrequency: 'monthly',
    simulationYears: 20,
    benchmark: 'VOO',
    betaFrequency: 'daily',
    useBayesianShrinkage: true
  });
  
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Helper to convert values between currencies
  const convertValue = useCallback((val: number, from: Currency, to: Currency) => {
    // Convert from source to USD, then from USD to target
    const valInUSD = val / EXCHANGE_RATES[from];
    return valInUSD * EXCHANGE_RATES[to];
  }, []);

  // Handle currency change: update existing dollar amounts in constraints
  useEffect(() => {
    if (prevCurrencyRef.current !== currency) {
      setConstraints(prev => ({
        ...prev,
        initialBalance: convertValue(prev.initialBalance || 0, prevCurrencyRef.current, currency),
        contributionAmount: convertValue(prev.contributionAmount || 0, prevCurrencyRef.current, currency)
      }));
      prevCurrencyRef.current = currency;
    }
  }, [currency, convertValue]);

  const formatCurrency = (val: number) => {
    return `${CURRENCY_SYMBOLS[currency]}${val.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatCurrencyFull = (val: number) => {
    return `${CURRENCY_SYMBOLS[currency]}${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const availableSectors = useMemo(() => {
    const sectors = new Set<string>();
    tickers.forEach(t => sectors.add(SECTOR_MAP[t] || (t.includes('.') || t.includes('-') || t.includes('=') ? 'Global/Alt' : 'Other')));
    return Array.from(sectors).sort();
  }, [tickers]);

  useEffect(() => {
    setConstraints(prev => {
      const updatedLimits: Record<string, { min: number; max: number }> = {};
      let changed = false;
      availableSectors.forEach(s => {
        if (prev.sectorLimits[s]) updatedLimits[s] = prev.sectorLimits[s];
        else { updatedLimits[s] = { min: 0, max: 1 }; changed = true; }
      });
      if (Object.keys(prev.sectorLimits).length !== availableSectors.length) changed = true;
      return changed ? { ...prev, sectorLimits: updatedLimits } : prev;
    });
  }, [availableSectors]);

  const handleOptimize = useCallback(async (tickerList: string[], currentStrategy: OptimizationStrategy, currentConstraints: OptimizationConstraints) => {
    setLoading(true);
    setAiAnalysis(null);
    try {
      const res = await PortfolioService.optimize(tickerList, currentStrategy, currentConstraints);
      setResult(res);
    } catch (error) {
      console.error("Optimization failed:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    handleOptimize(tickers, strategy, constraints);
  }, [tickers, strategy, constraints.minAssetWeight, constraints.maxAssetWeight, constraints.initialBalance, constraints.contributionAmount, constraints.contributionFrequency, constraints.simulationYears, constraints.startDate, constraints.endDate, constraints.benchmark, constraints.betaFrequency, constraints.useBayesianShrinkage, constraints.sectorLimits, constraints.assetLimits]);

  useEffect(() => {
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    if (newTicker.length >= 2) {
      setIsSearching(true);
      searchTimeoutRef.current = window.setTimeout(async () => {
        const results = await PortfolioService.searchTickers(newTicker);
        setSearchResults(results);
        setIsSearching(false);
      }, 300);
    } else {
      setSearchResults([]);
      setIsSearching(false);
    }
  }, [newTicker]);

  const fetchAiAnalysis = async () => {
    const currentResult = result;
    if (!currentResult || isAiLoading) return;
    setIsAiLoading(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const prompt = `Act as an institutional portfolio analyst. Analyze this portfolio: ${currentResult.assets.map(a => `${a.symbol} (${(Number(a.weight) * 100).toFixed(1)}%)`).join(', ')}. Return: ${(Number(currentResult.metrics.expectedReturn) * 100).toFixed(2)}%. Vol: ${(Number(currentResult.metrics.volatility) * 100).toFixed(2)}%. Sharpe: ${Number(currentResult.metrics.sharpeRatio).toFixed(2)}. Highlight strengths and risks for a non-expert in clear dot points.`;
      const response = await ai.models.generateContent({ 
        model: 'gemini-3-pro-preview', 
        contents: prompt 
      });
      setAiAnalysis(response.text || "No analysis available.");
    } catch (e) {
      setAiAnalysis("AI Synthesis offline.");
    } finally {
      setIsAiLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'ai-analysis' && !aiAnalysis && result) fetchAiAnalysis();
  }, [activeTab, aiAnalysis, result]);

  const addTicker = (symbol?: string) => {
    const s = (symbol || newTicker).trim().toUpperCase();
    if (s && !tickers.includes(s)) {
      setTickers([...tickers, s]);
      setNewTicker('');
      setSearchResults([]);
    }
  };

  const navItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
    { id: 'optimize', icon: 'architecture', label: 'Optimization' },
    { id: 'allocation', icon: 'account_balance_wallet', label: 'Allocation' },
    { id: 'risk', icon: 'security', label: 'Risk Metrics' },
    { id: 'simulations', icon: 'monitoring', label: 'Simulations' },
    { id: 'ai-analysis', icon: 'psychology', label: 'AI Analysis' },
    { id: 'methodology', icon: 'history_edu', label: 'Methodology' },
  ];

  const simStats = useMemo(() => {
    const mc = result?.monteCarlo;
    if (!mc || mc.length === 0) return null;
    const finalValues: number[] = mc.map(path => path[path.length - 1] || 0).sort((a, b) => a - b);
    const count = finalValues.length;
    return {
      best: finalValues[count - 1],
      worst: finalValues[0],
      median: finalValues[Math.floor(count / 2)],
      low95: finalValues[Math.floor(count * 0.05)],
    };
  }, [result?.monteCarlo]);

  return (
    <div className="flex min-h-screen bg-background-light text-text-main font-sans overflow-x-hidden">
      {isSidebarOpen && <div className="fixed inset-0 bg-black/30 z-40 lg:hidden" onClick={() => setIsSidebarOpen(false)}/>}
      <aside className={`fixed lg:sticky lg:translate-x-0 inset-y-0 left-0 w-64 bg-white border-r border-border-light h-screen z-50 transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 space-y-8 overflow-y-auto h-full flex flex-col">
          <div className="flex items-center gap-3">
            <div className="size-10 bg-primary rounded-lg flex items-center justify-center text-white"><span className="material-symbols-outlined text-2xl">query_stats</span></div>
            <div><h1 className="text-sm font-black">Tashakkori</h1><p className="text-primary text-[10px] font-black uppercase tracking-widest">Portfilio Opimisation</p></div>
          </div>
          <nav className="flex flex-col gap-1.5 flex-1">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setActiveTab(item.id as any)} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold text-sm transition-all ${activeTab === item.id ? 'bg-primary/5 text-primary' : 'text-text-muted hover:bg-slate-50'}`}>
                <span className="material-symbols-outlined text-lg">{item.icon}</span>{item.label}
              </button>
            ))}
          </nav>
          <div className="p-4 border-t border-slate-50 text-[9px] text-green-600 font-bold uppercase">Engine Active</div>
        </div>
      </aside>

      <main className="flex-1 min-w-0 flex flex-col">
        <header className="bg-white border-b border-border-light px-4 lg:px-8 py-4 flex justify-between items-center sticky top-0 z-30 shadow-sm">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2 text-text-muted"><span className="material-symbols-outlined">menu</span></button>
            <div className="text-[10px] text-text-muted font-black uppercase hidden sm:block">Asset Management Platform / {activeTab}</div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-100 rounded-lg p-1">
              {(['USD', 'AUD', 'EUR', 'GBP'] as Currency[]).map(curr => (
                <button 
                  key={curr} 
                  onClick={() => setCurrency(curr)}
                  className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${currency === curr ? 'bg-white text-primary shadow-sm' : 'text-text-muted hover:text-text-main'}`}
                >
                  {curr}
                </button>
              ))}
            </div>
            <div className="h-8 w-8 rounded-full bg-slate-200 border overflow-hidden"><img src={`https://api.dicebear.com/7.x/avataaars/svg?seed=Quant`} alt="User" /></div>
          </div>
        </header>

        <div className="p-4 lg:p-8 max-w-7xl mx-auto space-y-8 w-full">
          {result ? (
            <div className="animate-in fade-in duration-500">
              <div className="flex justify-between items-center mb-8">
                <div><h2 className="text-xl sm:text-2xl font-black text-slate-900">Portfolio Analysis</h2><p className="text-text-muted text-xs font-medium mt-1">Institutional Grade Optimization</p></div>
              </div>

              {activeTab === 'dashboard' && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                    <MetricCard 
                      label="Expected Return" 
                      value={`${(Number(result.metrics.expectedReturn) * 100).toFixed(2)}%`} 
                      trend={result.metrics.expectedReturn >= 0 ? 'up' : 'down'} 
                      subValue="Geometric CAGR" 
                    />
                    <MetricCard 
                      label="Volatility" 
                      value={`${(Number(result.metrics.volatility) * 100).toFixed(2)}%`} 
                      trend="neutral"
                      subValue="Annual Std Dev" 
                    />
                    <MetricCard 
                      label="Sharpe Ratio" 
                      value={Number(result.metrics.sharpeRatio).toFixed(2)} 
                      trend={result.metrics.sharpeRatio > 1 ? 'up' : 'neutral'}
                      subValue="Risk-Adjusted Return" 
                    />
                    <MetricCard 
                      label="Sortino Ratio" 
                      value={Number(result.metrics.sortinoRatio).toFixed(2)} 
                      trend={result.metrics.sortinoRatio > 1 ? 'up' : 'neutral'}
                      subValue="Downside Risk Adjusted" 
                    />
                    <MetricCard 
                      label="Max Drawdown" 
                      value={`${(Number(result.metrics.maxDrawdown) * 100).toFixed(1)}%`} 
                      trend="down"
                      subValue="Peak Risk" 
                    />
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <PerformanceChart history={result.history} benchmark={constraints.benchmark} />
                    <AssetAllocationChart assets={result.assets} />
                  </div>
                </div>
              )}

              {activeTab === 'allocation' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                    <div className="lg:col-span-4 space-y-6">
                      <div className="bg-white p-6 rounded-2xl border border-primary/20 bg-primary/[0.02] shadow-soft space-y-6">
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-primary">savings</span>
                          <h3 className="text-sm font-black uppercase tracking-tight">Investment Settings</h3>
                        </div>
                        <div className="space-y-4">
                          <div className="space-y-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase">Target Portfolio Value</label>
                            <div className="relative">
                              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">{CURRENCY_SYMBOLS[currency]}</span>
                              <input 
                                type="number" 
                                value={constraints.initialBalance} 
                                onChange={e => setConstraints({...constraints, initialBalance: Number(e.target.value)})} 
                                className="block w-full pl-10 pr-4 py-3 text-sm font-black rounded-xl border-slate-200 focus:ring-primary focus:border-primary"
                              />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">Recurring Add</label>
                              <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">{CURRENCY_SYMBOLS[currency]}</span>
                                <input 
                                  type="number" 
                                  value={constraints.contributionAmount} 
                                  onChange={e => setConstraints({...constraints, contributionAmount: Number(e.target.value)})} 
                                  className="block w-full pl-10 pr-4 py-3 text-sm font-black rounded-xl border-slate-200 focus:ring-primary focus:border-primary"
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[10px] font-black text-slate-400 uppercase">Frequency</label>
                              <select 
                                value={constraints.contributionFrequency} 
                                onChange={e => setConstraints({...constraints, contributionFrequency: e.target.value as any})}
                                className="block w-full px-4 py-3 text-[10px] font-black rounded-xl border-slate-200 focus:ring-primary focus:border-primary uppercase"
                              >
                                <option value="weekly">Weekly</option>
                                <option value="fortnightly">Fortnightly</option>
                                <option value="monthly">Monthly</option>
                              </select>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                        <h3 className="text-[10px] font-black uppercase text-slate-400">Recurring Buy Distribution</h3>
                        <div className="space-y-3">
                          {result.assets.map(asset => (
                            <div key={asset.symbol} className="flex justify-between items-center">
                              <span className="text-[11px] font-black text-slate-700">{asset.symbol}</span>
                              <span className="text-[11px] font-bold text-primary">{formatCurrencyFull((constraints.contributionAmount || 0) * asset.weight)}</span>
                            </div>
                          ))}
                          <div className="border-t pt-3 flex justify-between items-center">
                            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Period Add</span>
                            <span className="text-xs font-black text-slate-900">{formatCurrencyFull(constraints.contributionAmount || 0)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="lg:col-span-8 space-y-8">
                      <div className="bg-white rounded-2xl border border-border-light shadow-soft overflow-hidden">
                        <div className="p-6 border-b">
                          <h3 className="text-sm font-black uppercase text-slate-800">Target Asset Allocation</h3>
                          <p className="text-[10px] text-text-muted font-bold mt-1 uppercase tracking-tight">Units required to meet optimized weights for a {formatCurrency(constraints.initialBalance || 0)} portfolio</p>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left border-collapse">
                            <thead>
                              <tr className="bg-slate-50/50">
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Asset</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Current Price</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">Target Weight</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Target Value</th>
                                <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-widest text-right">Units to Buy</th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.assets.map(asset => {
                                // Convert Yahoo (USD) price to display currency
                                const currentPriceInSelected = asset.currentPrice * EXCHANGE_RATES[currency];
                                const targetVal = (constraints.initialBalance || 0) * asset.weight;
                                const units = targetVal / currentPriceInSelected;
                                return (
                                  <tr key={asset.symbol} className="border-b last:border-0 hover:bg-slate-50/30 transition-colors">
                                    <td className="px-6 py-4">
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                          <span className="text-sm font-black text-slate-900">{asset.symbol}</span>
                                        </div>
                                        <span className="text-[9px] font-bold uppercase text-slate-400">{asset.sector}</span>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4">
                                      <span className="text-xs font-bold text-slate-600">{formatCurrencyFull(currentPriceInSelected)}</span>
                                    </td>
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs font-black text-primary">{(asset.weight * 100).toFixed(1)}%</span>
                                        <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden">
                                          <div className="h-full bg-primary" style={{ width: `${asset.weight * 100}%` }}></div>
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <span className="text-xs font-black text-slate-900">{formatCurrencyFull(targetVal)}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                      <div className="bg-slate-100 rounded-lg px-3 py-1.5 inline-block border">
                                        <span className="text-sm font-black text-primary">{units.toFixed(4)}</span>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="bg-slate-50/50">
                                <td colSpan={3} className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 text-right">Portfolio Total</td>
                                <td className="px-6 py-4 text-right text-sm font-black text-slate-900">{formatCurrencyFull(constraints.initialBalance || 0)}</td>
                                <td className="px-6 py-4"></td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                           <h3 className="text-xs font-black uppercase flex items-center gap-2">
                             <span className="material-symbols-outlined text-orange-500 text-sm">trending_up</span>
                             Projected Annual Earnings
                           </h3>
                           <div className="flex items-baseline gap-2">
                             <span className="text-2xl font-black text-slate-900">{formatCurrencyFull((constraints.initialBalance || 0) * result.metrics.expectedReturn)}</span>
                             <span className="text-[10px] font-bold text-slate-400">P.A.</span>
                           </div>
                        </div>
                        <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                           <h3 className="text-xs font-black uppercase flex items-center gap-2">
                             <span className="material-symbols-outlined text-green-500 text-sm">payments</span>
                             Estimated Dividend Income
                           </h3>
                           <div className="flex items-baseline gap-2">
                             <span className="text-2xl font-black text-slate-900">
                               {formatCurrencyFull(result.assets.reduce((sum, a) => sum + (a.weight * a.dividendYield * (constraints.initialBalance || 0)), 0))}
                             </span>
                             <span className="text-[10px] font-bold text-slate-400">Annual</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'optimize' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
                      <MetricCard 
                        label="Expected Return" 
                        value={`${(Number(result.metrics.expectedReturn) * 100).toFixed(2)}%`} 
                        trend={result.metrics.expectedReturn >= 0 ? 'up' : 'down'} 
                        subValue="Geometric CAGR" 
                      />
                      <MetricCard 
                        label="Volatility" 
                        value={`${(Number(result.metrics.volatility) * 100).toFixed(2)}%`} 
                        trend="neutral"
                        subValue="Annual Std Dev" 
                      />
                      <MetricCard 
                        label="Sharpe Ratio" 
                        value={Number(result.metrics.sharpeRatio).toFixed(2)} 
                        trend={result.metrics.sharpeRatio > 1 ? 'up' : 'neutral'}
                        subValue="Risk-Adjusted Return" 
                      />
                      <MetricCard 
                        label="Sortino Ratio" 
                        value={Number(result.metrics.sortinoRatio).toFixed(2)} 
                        trend={result.metrics.sortinoRatio > 1 ? 'up' : 'neutral'}
                        subValue="Downside Risk Adjusted" 
                      />
                      <MetricCard 
                        label="Max Drawdown" 
                        value={`${(Number(result.metrics.maxDrawdown) * 100).toFixed(1)}%`} 
                        trend="down"
                        subValue="Peak Risk" 
                      />
                    </div>

                    <div className="grid grid-cols-12 gap-8">
                        <div className="col-span-12 lg:col-span-8 space-y-8">
                          <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                              <h3 className="text-xs font-black uppercase text-slate-800">Backtest Period</h3>
                              <div className="flex flex-wrap gap-4 items-end">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase">Start Date</label>
                                  <input 
                                    type="date" 
                                    value={constraints.startDate} 
                                    onChange={(e) => setConstraints({...constraints, startDate: e.target.value})} 
                                    className="block w-full text-xs rounded-xl border-slate-200 focus:ring-primary focus:border-primary"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase">End Date</label>
                                  <input 
                                    type="date" 
                                    value={constraints.endDate} 
                                    onChange={(e) => setConstraints({...constraints, endDate: e.target.value})} 
                                    className="block w-full text-xs rounded-xl border-slate-200 focus:ring-primary focus:border-primary"
                                  />
                                </div>
                              </div>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                              <h3 className="text-xs font-black uppercase text-slate-800">Benchmark & Risk Settings</h3>
                              <div className="flex flex-wrap gap-6 items-end">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase">Comparison Benchmark</label>
                                  <input 
                                    type="text" 
                                    value={constraints.benchmark} 
                                    onChange={(e) => setConstraints({...constraints, benchmark: e.target.value.toUpperCase()})} 
                                    placeholder="e.g. VOO, SPY..."
                                    className="block w-32 text-xs font-black rounded-xl border-slate-200 focus:ring-primary focus:border-primary uppercase"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-black text-slate-400 uppercase">Beta Frequency</label>
                                  <select 
                                    value={constraints.betaFrequency} 
                                    onChange={(e) => setConstraints({...constraints, betaFrequency: e.target.value as any})}
                                    className="block w-32 text-[10px] font-black rounded-xl border-slate-200 focus:ring-primary focus:border-primary uppercase"
                                  >
                                    <option value="daily">Daily</option>
                                    <option value="weekly">Weekly</option>
                                    <option value="monthly">Monthly</option>
                                  </select>
                                </div>
                              </div>
                          </div>

                          <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-6">
                              <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black uppercase text-slate-800">Asset Selection & Weights</h3>
                                <div className="flex gap-2">
                                  <input type="text" value={newTicker} onChange={(e) => setNewTicker(e.target.value)} placeholder="Ticker (e.g. AAPL)..." className="border-slate-200 rounded-xl px-4 py-1.5 text-xs focus:ring-primary w-40" />
                                  <button onClick={() => addTicker()} className="bg-primary text-white px-4 py-1.5 rounded-xl font-bold text-xs">Add Asset</button>
                                </div>
                              </div>
                              
                              {searchResults.length > 0 && (
                                <div className="bg-white border rounded-xl overflow-hidden shadow-xl absolute z-10 w-72 mt-[-10px]">
                                  {searchResults.map(r => (
                                    <button key={r.symbol} onClick={() => addTicker(r.symbol)} className="w-full px-4 py-2 text-left hover:bg-slate-50 border-b last:border-0 flex flex-col gap-0.5">
                                      <div className="flex justify-between items-center">
                                        <span className="text-[11px] font-black text-primary">{r.symbol}</span>
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded uppercase">{r.typeDisp}</span>
                                      </div>
                                      <div className="text-[10px] text-slate-700 font-bold truncate">{r.shortname}</div>
                                    </button>
                                  ))}
                                </div>
                              )}

                              <div className="overflow-x-auto rounded-xl border border-slate-100">
                                <table className="w-full text-left border-collapse">
                                  <thead>
                                    <tr className="bg-slate-50/50">
                                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">Asset</th>
                                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">Sector</th>
                                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">Weight</th>
                                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">CAGR Return</th>
                                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">Min %</th>
                                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">Max %</th>
                                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-400 tracking-widest border-b">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {result.assets.map((asset) => (
                                      <tr key={asset.symbol} className="hover:bg-slate-50/50 transition-colors border-b last:border-0">
                                        <td className="px-4 py-4">
                                          <div className="flex items-center gap-2">
                                            <div className="size-2 rounded-full bg-primary/20" />
                                            <span className="text-xs font-black text-slate-900">{asset.symbol}</span>
                                          </div>
                                        </td>
                                        <td className="px-4 py-4">
                                          <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-slate-100 text-slate-500 rounded tracking-tight">
                                            {asset.sector}
                                          </span>
                                        </td>
                                        <td className="px-4 py-4">
                                          <div className="flex items-center gap-3">
                                            <span className="text-xs font-black text-primary w-12">{(Number(asset.weight) * 100).toFixed(2)}%</span>
                                            <div className="h-1.5 w-16 bg-slate-100 rounded-full overflow-hidden hidden sm:block">
                                              <div className="h-full bg-primary" style={{ width: `${asset.weight * 100}%` }} />
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-4 py-4">
                                          <span className="text-xs font-black text-green-600">{(Number(asset.expectedReturn) * 100).toFixed(2)}%</span>
                                        </td>
                                        <td className="px-4 py-4">
                                          <input 
                                            type="number" 
                                            min="0" 
                                            max="100"
                                            value={Math.round((constraints.assetLimits?.[asset.symbol]?.min ?? 0) * 100)}
                                            onChange={(e) => {
                                              const val = Number(e.target.value) / 100;
                                              setConstraints({
                                                ...constraints,
                                                assetLimits: {
                                                  ...constraints.assetLimits,
                                                  [asset.symbol]: { 
                                                    min: val, 
                                                    max: constraints.assetLimits?.[asset.symbol]?.max ?? 1 
                                                  }
                                                }
                                              });
                                            }}
                                            className="w-16 px-2 py-1 text-[10px] font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-primary"
                                          />
                                        </td>
                                        <td className="px-4 py-4">
                                          <input 
                                            type="number" 
                                            min="0" 
                                            max="100"
                                            value={Math.round((constraints.assetLimits?.[asset.symbol]?.max ?? 1) * 100)}
                                            onChange={(e) => {
                                              const val = Number(e.target.value) / 100;
                                              setConstraints({
                                                ...constraints,
                                                assetLimits: {
                                                  ...constraints.assetLimits,
                                                  [asset.symbol]: { 
                                                    min: constraints.assetLimits?.[asset.symbol]?.min ?? 0, 
                                                    max: val 
                                                  }
                                                }
                                              });
                                            }}
                                            className="w-16 px-2 py-1 text-[10px] font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-primary"
                                          />
                                        </td>
                                        <td className="px-4 py-4">
                                          <button onClick={() => setTickers(tickers.filter(x => x !== asset.symbol))} className="text-slate-300 hover:text-red-500 transition-colors">
                                            <span className="material-symbols-outlined text-sm">delete</span>
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                           </div>
                        </div>

                        <div className="col-span-12 lg:col-span-4 space-y-6">
                          <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                              <h3 className="text-[10px] font-black uppercase">Optimization Strategy</h3>
                              <div className="flex flex-col gap-2">
                                {[
                                  { id: 'sharpe', label: 'Max Sharpe Ratio', desc: 'Best risk-adjusted returns' },
                                  { id: 'sortino', label: 'Max Sortino Ratio', desc: 'Focus on downside protection' },
                                  { id: 'min_var', label: 'Minimum Variance', desc: 'Lowest possible volatility' }
                                ].map(s => (
                                  <button 
                                    key={s.id} 
                                    onClick={() => setStrategy(s.id as OptimizationStrategy)} 
                                    className={`p-4 rounded-xl border text-left transition ${strategy === s.id ? 'bg-primary/5 border-primary shadow-sm' : 'hover:bg-slate-50 border-slate-100'}`}
                                  >
                                    <div className={`text-[10px] font-black uppercase ${strategy === s.id ? 'text-primary' : 'text-slate-600'}`}>{s.label}</div>
                                    <div className="text-[9px] text-slate-400 font-medium">{s.desc}</div>
                                  </button>
                                ))}
                              </div>
                              <button 
                                onClick={() => handleOptimize(tickers, strategy, constraints)}
                                className="w-full mt-4 flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-xl font-bold text-xs shadow-soft hover:bg-primary/90 transition-all"
                              >
                                <span className="material-symbols-outlined text-sm">refresh</span>
                                Re-Calculate Weights
                              </button>
                          </div>
                        </div>
                    </div>

                    <div className="bg-white p-8 rounded-2xl border border-border-light shadow-soft space-y-6">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase text-slate-800">Sector Allocation Constraints</h3>
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Global Limits</div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                        {Object.entries(constraints.sectorLimits).map(([sector, limits]: [string, any]) => (
                          <div key={sector} className="p-4 rounded-xl border border-slate-100 space-y-3">
                            <div className="flex justify-between items-center">
                              <span className="text-[10px] font-black uppercase text-slate-500">{sector}</span>
                              <span className="text-[10px] font-black text-primary">
                                {Math.round(limits.min * 100)}% - {Math.round(limits.max * 100)}%
                              </span>
                            </div>
                            <div className="flex gap-4">
                              <div className="flex-1 space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase">Min %</label>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="100"
                                  value={Math.round(limits.min * 100)}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) / 100;
                                    setConstraints({
                                      ...constraints,
                                      sectorLimits: {
                                        ...constraints.sectorLimits,
                                        [sector]: { ...limits, min: val }
                                      }
                                    });
                                  }}
                                  className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-primary"
                                />
                              </div>
                              <div className="flex-1 space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase">Max %</label>
                                <input 
                                  type="number" 
                                  min="0" 
                                  max="100"
                                  value={Math.round(limits.max * 100)}
                                  onChange={(e) => {
                                    const val = Number(e.target.value) / 100;
                                    setConstraints({
                                      ...constraints,
                                      sectorLimits: {
                                        ...constraints.sectorLimits,
                                        [sector]: { ...limits, max: val }
                                      }
                                    });
                                  }}
                                  className="w-full px-3 py-2 text-xs font-bold border border-slate-200 rounded-lg focus:ring-1 focus:ring-primary"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                </div>
              )}

              {activeTab === 'risk' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {/* Efficiency Card */}
                    <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                      <h3 className="text-[10px] font-black text-primary uppercase border-b border-slate-50 pb-3 tracking-widest">Efficiency</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Annual Std Dev</span>
                          <span className="text-sm font-black text-slate-900">{(Number(result.metrics.volatility) * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Sharpe Ratio</span>
                          <span className="text-sm font-black text-slate-900">{Number(result.metrics.sharpeRatio).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Sortino Ratio</span>
                          <span className="text-sm font-black text-slate-900">{Number(result.metrics.sortinoRatio).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Information Ratio</span>
                          <span className="text-sm font-black text-slate-900">{Number(result.metrics.informationRatio).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Tail Risk Card */}
                    <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                      <h3 className="text-[10px] font-black text-red-600 uppercase border-b border-slate-50 pb-3 tracking-widest">Tail Risk (Daily)</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">VaR (95%)</span>
                          <span className="text-sm font-black text-slate-900">{(Math.abs(Number(result.metrics.var95)) * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">CVaR (95%)</span>
                          <span className="text-sm font-black text-slate-900">{(Math.abs(Number(result.metrics.cvar95)) * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Skewness</span>
                          <span className="text-sm font-black text-slate-900">{Number(result.metrics.skewness).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Tracking Card */}
                    <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                      <h3 className="text-[10px] font-black text-blue-600 uppercase border-b border-slate-50 pb-3 tracking-widest">Tracking</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Tracking Error</span>
                          <span className="text-sm font-black text-slate-900">{(Number(result.metrics.trackingError) * 100).toFixed(2)}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Avg Correlation</span>
                          <span className="text-sm font-black text-slate-900">{Number(result.metrics.avgCorrelation).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Drawdown Card */}
                    <div className="bg-white p-6 rounded-2xl border border-border-light shadow-soft space-y-4">
                      <h3 className="text-[10px] font-black text-orange-600 uppercase border-b border-slate-50 pb-3 tracking-widest">Drawdown</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Max Duration</span>
                          <span className="text-sm font-black text-slate-900">{result.metrics.maxDrawdownDuration}d</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-text-muted font-medium">Calmar Ratio</span>
                          <span className="text-sm font-black text-slate-900">{Number(result.metrics.calmarRatio).toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Risk Contribution Chart */}
                  <div className="bg-white p-8 rounded-2xl border border-border-light shadow-soft space-y-6">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Risk Contribution by Asset</h3>
                    </div>
                    <div className="space-y-4">
                      {Object.entries(result.metrics.riskContributions).map(([symbol, contribution]) => (
                        <div key={symbol} className="space-y-1">
                          <div className="flex justify-between items-center">
                            <span className="text-[11px] font-black text-slate-700">{symbol}</span>
                            <span className="text-[11px] font-black text-slate-900">{(Number(contribution) * 100).toFixed(1)}%</span>
                          </div>
                          <div className="h-2 w-full bg-slate-50 rounded-full overflow-hidden">
                            <div 
                              className="h-full bg-primary transition-all duration-1000" 
                              style={{ width: `${Math.min(100, Number(contribution) * 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'simulations' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-4">
                  <div className="bg-white p-6 rounded-2xl border shadow-soft flex gap-8">
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase">Balance ({CURRENCY_SYMBOLS[currency]})</label>
                      <input type="number" value={constraints.initialBalance} onChange={e => setConstraints({...constraints, initialBalance: Number(e.target.value)})} className="p-2 border rounded-lg w-32 font-black" />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-black uppercase">Years</label>
                      <input type="number" value={constraints.simulationYears} onChange={e => setConstraints({...constraints, simulationYears: Number(e.target.value)})} className="p-2 border rounded-lg w-24 font-black" />
                    </div>
                  </div>
                  {simStats && (
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                      <MetricCard label="Worst Case" value={formatCurrency(simStats.worst)} />
                      <MetricCard label="95% Floor" value={formatCurrency(simStats.low95)} />
                      <MetricCard label="Median" value={formatCurrency(simStats.median)} />
                      <MetricCard label="Best Case" value={formatCurrency(simStats.best)} />
                    </div>
                  )}
                  <MonteCarloChart paths={result.monteCarlo} />
                </div>
              )}

              {activeTab === 'ai-analysis' && (
                <div className="bg-white p-8 rounded-2xl border shadow-soft min-h-[400px]">
                  {isAiLoading ? <div className="h-full flex items-center justify-center animate-pulse text-xs font-black uppercase tracking-widest">AI Analyst Synthesis...</div> : 
                  aiAnalysis ? <div className="prose prose-slate whitespace-pre-line text-sm leading-relaxed">{aiAnalysis}</div> : 
                  <button onClick={fetchAiAnalysis} className="p-4 border rounded-xl hover:bg-slate-50 font-black text-xs uppercase w-full">Generate Portfolio Insights</button>}
                </div>
              )}

              {activeTab === 'methodology' && (
                <div className="bg-white p-8 rounded-2xl border shadow-soft space-y-6">
                  <h3 className="text-xl font-black">Quantitative Methodology</h3>
                  <div className="space-y-4 text-sm text-slate-600 leading-relaxed">
                    <p>Tashakkori Portfilio Opimisation uses a <strong>dual-resolution model</strong> to provide accurate but non-optimistic results:</p>
                    <ul className="list-disc pl-5 space-y-2">
                      <li><strong>Expected Returns:</strong> Calculated using the <strong>Compound Annual Growth Rate (CAGR)</strong> from yearly price data to reflect true realized growth.</li>
                      <li><strong>Risk & Covariance:</strong> Calculated using <strong>high-frequency daily returns</strong> to identify structural correlations.</li>
                      <li><strong>Allocation Engine:</strong> Projects units required for specific capital thresholds, adjusted for selected currencies.</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4"><span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span><h2 className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Fetching Financial Market State</h2></div>
          )}
        </div>
      </main>
    </div>
  );
};

export default App;

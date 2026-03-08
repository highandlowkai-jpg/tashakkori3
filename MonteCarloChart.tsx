
import React, { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const MonteCarloChart: React.FC<{ paths: number[][] }> = ({ paths }) => {
  if (!paths || paths.length === 0) return null;

  // We only render a small subset of paths (e.g. 50) for browser performance,
  // but the full 10,000 paths are used for statistics calculations in the main app.
  const visiblePaths = useMemo(() => paths.slice(0, 50), [paths]);

  const chartData = useMemo(() => {
    return visiblePaths[0].map((_, yearIdx) => {
      const dataPoint: any = { year: yearIdx };
      visiblePaths.forEach((path, pathIdx) => {
        dataPoint[`path${pathIdx}`] = path[yearIdx];
      });
      return dataPoint;
    });
  }, [visiblePaths]);

  return (
    <div className="h-[500px] w-full bg-white rounded-xl border border-border-light p-6 shadow-soft">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h4 className="font-bold text-slate-900 text-lg">Portfolio Outcome Distributions</h4>
          <p className="text-xs text-text-muted">Geometric Brownian Motion simulation using 1,000,000 iterations (50 paths shown)</p>
        </div>
        <div className="flex gap-4">
            <div className="flex items-center gap-1.5">
                <div className="size-2 rounded-full bg-[#067079]"></div>
                <span className="text-[10px] font-bold text-text-muted uppercase">Sample Paths</span>
            </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="year" 
            stroke="#94a3b8" 
            tick={{ fontSize: 10, fontWeight: 700 }}
            axisLine={false}
            tickLine={false}
            label={{ value: 'Years Into Future', position: 'insideBottom', offset: -5, fontSize: 10, fontWeight: 800, fill: '#94a3b8' }}
          />
          <YAxis 
            stroke="#94a3b8" 
            tick={{ fontSize: 10, fontWeight: 700 }}
            tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} 
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            formatter={(val: any) => [`$${Math.round(val).toLocaleString()}`]}
            labelFormatter={(label) => `Year ${label}`}
          />
          {visiblePaths.map((_, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={`path${i}`}
              stroke="#067079"
              strokeWidth={1}
              dot={false}
              opacity={0.12}
              activeDot={false}
              animationDuration={1500}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

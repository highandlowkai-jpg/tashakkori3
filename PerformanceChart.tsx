
import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { HistoricalPoint } from '../types';

export const PerformanceChart: React.FC<{ history: HistoricalPoint[], benchmark?: string }> = ({ history, benchmark = 'VOO' }) => {
  return (
    <div className="h-[400px] w-full bg-white rounded-xl border border-border-light p-6 shadow-soft">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h4 className="font-bold text-slate-900 text-lg">Equity Performance Curve</h4>
          <p className="text-xs text-text-muted">Historical cumulative returns vs Benchmark ({benchmark})</p>
        </div>
      </div>
      <ResponsiveContainer width="100%" height="80%">
        <AreaChart data={history}>
          <defs>
            <linearGradient id="curveGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#067079" stopOpacity={0.1}/>
              <stop offset="100%" stopColor="#067079" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis 
            dataKey="date" 
            stroke="#94a3b8" 
            tick={{ fontSize: 10, fontWeight: 600 }}
            tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { month: 'short', year: '2-digit' })}
            axisLine={false}
            tickLine={false}
          />
          <YAxis 
            stroke="#94a3b8" 
            tick={{ fontSize: 10, fontWeight: 600 }}
            tickFormatter={(val) => `${((val - 1) * 100).toFixed(0)}%`} 
            axisLine={false}
            tickLine={false}
          />
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', padding: '12px' }}
            labelStyle={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '4px', color: '#64748b' }}
            itemStyle={{ fontSize: '11px', fontWeight: 'bold', padding: '2px 0' }}
            formatter={(val: number) => [`${((val - 1) * 100).toFixed(2)}%`]}
          />
          <Legend 
            verticalAlign="top" 
            align="right" 
            iconType="circle"
            wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.05em', paddingBottom: '20px' }}
          />
          <Area 
            type="monotone" 
            dataKey="value" 
            name="Portfolio"
            stroke="#067079" 
            fill="url(#curveGradient)" 
            strokeWidth={3}
            animationDuration={1500}
          />
          <Area 
            type="monotone" 
            dataKey="benchmarkValue" 
            name="Benchmark"
            stroke="#cbd5e1" 
            fill="transparent" 
            strokeWidth={1.5}
            strokeDasharray="4 4"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
};

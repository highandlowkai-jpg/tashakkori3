
import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Asset } from '../types';

const COLORS = ['#067079', '#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#db2777', '#0891b2'];

export const AssetAllocationChart: React.FC<{ assets: Asset[] }> = ({ assets }) => {
  const data = assets.map(a => ({
    name: a.symbol,
    value: Math.round(a.weight * 1000) / 10
  })).sort((a, b) => b.value - a.value);

  return (
    <div className="h-[400px] w-full bg-white rounded-xl border border-border-light p-6 shadow-soft">
      <h4 className="font-bold text-slate-900 text-lg mb-6">Optimized Allocation</h4>
      <ResponsiveContainer width="100%" height="80%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={65}
            outerRadius={95}
            paddingAngle={4}
            dataKey="value"
            animationBegin={0}
            animationDuration={1200}
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip 
            contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
            formatter={(value: number) => `${value}%`}
          />
          <Legend 
            verticalAlign="bottom" 
            height={36} 
            iconType="circle"
            wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

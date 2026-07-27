"use client";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: string;
  trend?: string;
  isPositive?: boolean;
}

export default function StatCard({ title, value, icon, trend, isPositive }: StatCardProps) {
  return (
    <div className="bg-slate-900/60 backdrop-blur-xl rounded-2xl p-6 border border-slate-800 shadow-xl relative overflow-hidden group">
      <div className="absolute inset-0 bg-gradient-to-br from-purple-600/5 to-cyan-600/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
      
      <div className="flex items-start justify-between relative z-10">
        <div>
          <p className="text-slate-400 font-medium text-sm tracking-wide mb-1 uppercase">{title}</p>
          <h3 className="text-4xl font-bold text-white tracking-tight">{value}</h3>
          
          {trend && (
            <div className="mt-3 flex items-center gap-1.5">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isPositive ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
                {trend}
              </span>
              <span className="text-slate-500 text-xs">vs last month</span>
            </div>
          )}
        </div>
        
        <div className="p-3 bg-slate-800/80 rounded-xl text-2xl shadow-inner border border-slate-700/50">
          {icon}
        </div>
      </div>
    </div>
  );
}

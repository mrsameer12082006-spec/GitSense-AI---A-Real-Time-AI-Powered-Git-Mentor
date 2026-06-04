import React from 'react';
import SubPageLayout from '../components/SubPageLayout';
import { Info, Cpu, Sparkles, Code2, ShieldCheck } from 'lucide-react';

export default function AboutUsPage() {
  return (
    <SubPageLayout activeTab="">
      <div className="flex flex-col gap-6">
        
        {/* Header */}
        <div className="flex flex-col gap-1 text-left">
          <h2 className="text-2xl font-extrabold tracking-tight text-white font-heading">About GitSense AI</h2>
          <p className="text-sm text-slate-400">Discover the core vision, architecture, and version history of the platform.</p>
        </div>

        {/* Card */}
        <div className="gitsense-card p-8 flex flex-col gap-6 border-white/[0.08] bg-[#0b1220]/70 text-left">
          
          {/* Logo & Version Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#7C5CFF] to-[#00D4FF] p-[1.5px] flex items-center justify-center shadow-lg shadow-[#7C5CFF]/10">
                <div className="w-full h-full bg-[#060913] rounded-[13px] flex items-center justify-center">
                  <Sparkles size={18} className="text-[#00D4FF]" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold text-white font-heading leading-tight">GitSense.AI</h3>
                <span className="text-[10px] text-slate-500 font-mono">Cognitive Repository Engine</span>
              </div>
            </div>
            
            <div className="flex flex-col sm:items-end gap-0.5">
              <span className="text-xs font-mono font-bold text-[#00E38C] bg-[#00E38C]/10 border border-[#00E38C]/20 px-3 py-1 rounded-full self-start sm:self-auto">
                v1.0.0
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Latest Stable Build</span>
            </div>
          </div>

          {/* Description Section */}
          <div className="flex flex-col gap-3">
            <h4 className="text-sm font-semibold text-slate-200">The Vision</h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              GitSense AI was built to solve a major headache in modern programming: cryptic Git errors, accidental forced push overwrites, and complex merge conflict maps. We think that your repository should be clear, readable, and safe.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Our agent runs locally to analyze your branch index metrics, staging files, and diverged histories, while advanced AI language parsing helps you run linear Git commands with complete understanding and zero anxiety.
            </p>
          </div>

          {/* Key Pillars */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-white/[0.05]">
            <div className="flex flex-col gap-1.5 p-3.5 bg-slate-950/40 border border-white/[0.04] rounded-xl">
              <Code2 size={16} className="text-[#7C5CFF]" />
              <span className="text-xs font-bold font-heading text-slate-200">Safe Commands</span>
              <span className="text-[10px] text-slate-500 leading-normal">Smart safety guards flag potentially dangerous operations before execution.</span>
            </div>

            <div className="flex flex-col gap-1.5 p-3.5 bg-slate-950/40 border border-white/[0.04] rounded-xl">
              <Cpu size={16} className="text-[#00D4FF]" />
              <span className="text-xs font-bold font-heading text-slate-200">Semantic Diffing</span>
              <span className="text-[10px] text-slate-500 leading-normal">Translates code differences and commit divergence into plain, actionable English.</span>
            </div>

            <div className="flex flex-col gap-1.5 p-3.5 bg-slate-950/40 border border-white/[0.04] rounded-xl">
              <ShieldCheck size={16} className="text-[#00E38C]" />
              <span className="text-xs font-bold font-heading text-slate-200">Privacy First</span>
              <span className="text-[10px] text-slate-500 leading-normal">Your codebase stays exactly where it belongs: local, confidential, and fully private.</span>
            </div>
          </div>

          {/* Development Team */}
          <div className="pt-4 border-t border-white/[0.05] flex flex-col gap-2">
            <span className="text-xs font-mono font-bold text-slate-400 uppercase">GitSense Creators</span>
            <div className="flex flex-wrap gap-2 mt-1">
              {['Sameer Mishra', 'Kartik Sharma', 'Ayesh Srivastava', 'Manik Chauhan'].map((name) => (
                <span key={name} className="text-[10px] font-medium text-slate-300 bg-white/4 border border-white/6 px-2.5 py-1 rounded-lg">
                  {name}
                </span>
              ))}
            </div>
          </div>

        </div>
      </div>
    </SubPageLayout>
  );
}

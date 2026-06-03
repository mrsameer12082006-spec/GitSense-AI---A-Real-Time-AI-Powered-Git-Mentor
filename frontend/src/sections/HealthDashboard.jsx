import React from 'react';
import { ShieldCheck, GitBranch, FileText, CheckCircle2, ArrowRight, ShieldAlert } from 'lucide-react';

export default function HealthDashboard() {
  return (
    <section id="health-dashboard" className="relative py-24 border-t border-white/[0.05] overflow-hidden">
      <div className="glow-blur glow-purple w-[350px] h-[350px] top-1/3 -left-16 pointer-events-none" />

      <div className="section-container relative z-10">

        {/* Header */}
        <div className="section-header">
          <div className="badge bg-[#00E38C]/10 border-[#00E38C]/30 text-[#00E38C]">
            <ShieldCheck size={11} /> HEALTH MONITOR
          </div>
          <h2 className="text-slate-100">Repository Health at a Glance</h2>
          <p className="text-slate-400 text-[1.0625rem] max-w-xl">
            Stop coding in the dark. Monitor branch sync, merge safety scores, and local changes dynamically.
          </p>
        </div>

        {/* Dashboard grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">

          {/* Left widgets — 8 cols */}
          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Widget: Branch Status */}
            <div className="gitsense-card spotlight-border p-6 flex flex-col gap-4 text-left">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <GitBranch size={15} className="text-[#7C5CFF]" />
                  <span className="font-heading font-bold text-sm text-slate-200">Branch Status</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                  feature/login
                </span>
              </div>

              <div>
                <div className="text-2xl font-heading font-bold text-slate-100 flex items-baseline gap-1.5">
                  Diverged
                  <span className="text-xs text-slate-500 font-normal font-sans">from origin/main</span>
                </div>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {[
                    { label: 'Behind by 2', sub: 'remote commits', color: '#FFB800' },
                    { label: 'Ahead by 1',  sub: 'local commit',   color: '#7C5CFF' },
                  ].map(({ label, sub, color }) => (
                    <div key={label} className="bg-slate-950/60 border border-white/[0.06] p-3 rounded-xl flex flex-col gap-0.5">
                      <span className="font-mono text-xs font-bold" style={{ color }}>{label}</span>
                      <span className="text-[10px] text-slate-500">{sub}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 border-t border-white/[0.05] pt-3 leading-relaxed">
                "You have 1 local commit not yet pushed. origin/main has 2 commits you need to pull."
              </p>
            </div>

            {/* Widget: Merge Safety Score */}
            <div className="gitsense-card spotlight-border p-6 flex flex-col gap-4 text-left">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={15} className="text-[#00E38C]" />
                  <span className="font-heading font-bold text-sm text-slate-200">Merge Safety</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-[#00E38C] bg-[#00E38C]/10 px-2 py-0.5 rounded-full">
                  HIGH
                </span>
              </div>

              <div className="flex items-center gap-5">
                {/* Donut */}
                <div className="relative w-20 h-20 flex-shrink-0 flex items-center justify-center">
                  <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
                    <circle cx="18" cy="18" r="15" fill="none" stroke="rgba(255,255,255,0.04)" strokeWidth="3" />
                    <circle cx="18" cy="18" r="15" fill="none" stroke="#00E38C" strokeWidth="3"
                      strokeDasharray="94 100" strokeLinecap="round" />
                  </svg>
                  <span className="absolute font-heading font-bold text-lg text-slate-100">94%</span>
                </div>
                <div className="flex flex-col gap-1.5 text-xs text-slate-400">
                  <span className="text-slate-200 font-semibold text-sm">Safe to merge</span>
                  {['0 conflict lines', 'File overlaps reviewed', '100% test coverage'].map(t => (
                    <span key={t} className="flex items-center gap-1.5">
                      <span className="text-[#00E38C]">✓</span> {t}
                    </span>
                  ))}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 border-t border-white/[0.05] pt-3 leading-relaxed">
                "Merge looks very safe. Minimal changes overlap with active branches."
              </p>
            </div>

            {/* Widget: Local Changes — spans 2 cols */}
            <div className="gitsense-card spotlight-border p-6 flex flex-col gap-4 text-left md:col-span-2">
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                <div className="flex items-center gap-2">
                  <FileText size={15} className="text-[#00D4FF]" />
                  <span className="font-heading font-bold text-sm text-slate-200">Local Changes</span>
                </div>
                <span className="text-[10px] font-mono font-semibold text-[#00D4FF] bg-[#00D4FF]/10 px-2 py-0.5 rounded-full">
                  3 MODIFIED
                </span>
              </div>

              <div className="flex flex-col gap-2 font-mono text-xs">
                {[
                  { file: 'src/components/GitGraph.jsx', status: 'STAGED',   color: '#00E38C' },
                  { file: 'src/sections/Hero.jsx',       status: 'MODIFIED', color: '#7C5CFF' },
                  { file: 'src/index.css',               status: 'MODIFIED', color: '#7C5CFF' },
                ].map(({ file, status, color }) => (
                  <div key={file} className="flex items-center justify-between bg-slate-950/50 px-3 py-2.5 rounded-lg border border-white/[0.05]">
                    <span className="text-slate-300 truncate">{file}</span>
                    <span className="text-[10px] font-bold ml-3 px-2 py-0.5 rounded flex-shrink-0"
                      style={{ color, background: `${color}18` }}>
                      {status}
                    </span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                ⚠️ <span className="text-[#FFB800] font-semibold">Caution:</span> Pulling remote commits now will
                overwrite uncommitted changes in <code className="font-mono">Hero.jsx</code> and <code className="font-mono">index.css</code>. Stash them first.
              </p>
            </div>
          </div>

          {/* Command Mentor — 4 cols */}
          <div className="lg:col-span-4">
            <div className="gitsense-card spotlight-border p-6 flex flex-col h-full text-left"
              style={{ borderColor: 'rgba(124,92,255,0.25)' }}>
              <div className="flex items-center gap-2 pb-4 mb-4 border-b border-white/[0.06]">
                <ShieldAlert size={15} className="text-[#7C5CFF]" />
                <span className="font-heading font-bold text-sm text-slate-200">Git Command Mentor</span>
              </div>

              <div className="flex flex-col gap-3 flex-1">
                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Safest Next Steps</span>

                {[
                  { cmd: 'git stash',                   color: '#00E38C', desc: 'Stash modified files safely before pulling to avoid overwriting local edits.' },
                  { cmd: 'git pull --rebase origin main', color: '#00D4FF', desc: 'Pull latest changes and replay your commits on top — keeps history linear.' },
                ].map(({ cmd, color, desc }) => (
                  <div key={cmd} className="bg-slate-950/80 border border-white/[0.06] rounded-xl p-4 flex flex-col gap-2">
                    <span className="font-mono text-xs font-bold" style={{ color }}>{cmd}</span>
                    <p className="text-[11px] text-slate-400 font-sans border-t border-white/[0.05] pt-2 leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 mt-4 border-t border-white/[0.06] text-xs">
                <span className="text-slate-500">Learn about rebase</span>
                <a href="#features" className="text-[#7C5CFF] hover:text-[#00D4FF] font-heading font-semibold flex items-center gap-1 transition-colors">
                  Docs <ArrowRight size={11} />
                </a>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

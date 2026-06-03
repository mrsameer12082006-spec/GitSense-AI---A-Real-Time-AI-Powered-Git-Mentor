import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { GitBranch, GitPullRequest, RefreshCw, AlertTriangle } from 'lucide-react';
import GitGraph from '../components/GitGraph';

const STATES = [
  {
    id: 'normal',
    label: 'Synced Workflow',
    icon: <GitBranch size={14} />,
    desc: 'Clean feature branching and standard merge history. Everything is in sync.'
  },
  {
    id: 'diverged',
    label: 'Diverged History',
    icon: <RefreshCw size={14} />,
    desc: 'Local and remote branches have diverged. GitSense AI shows you exactly how to resync.'
  },
  {
    id: 'conflict',
    label: 'Unresolved Conflict',
    icon: <AlertTriangle size={14} />,
    desc: 'Both branches modified the same file. See exactly where the collision is.'
  }
];

export default function VisualizerSection() {
  const [active, setActive] = useState('normal');
  const current = STATES.find(s => s.id === active);

  return (
    <section id="visualizer" className="relative py-24 border-t border-white/[0.05] overflow-hidden">
      <div className="glow-blur glow-cyan w-[350px] h-[350px] top-1/4 -right-16 pointer-events-none" />

      <div className="section-container relative z-10">

        {/* Header */}
        <div className="section-header">
          <div className="badge bg-[#00D4FF]/10 border-[#00D4FF]/30 text-[#00D4FF]">
            <GitPullRequest size={11} />
            INTERACTIVE REPOSITORY ENGINE
          </div>
          <h2 className="text-slate-100">Visualize the Branch Lifecycles</h2>
          <p className="text-slate-400 max-w-xl text-[1.0625rem]">
            Understand exactly where you stand. Explore common Git states interactively and see how GitSense AI parses each one.
          </p>

          {/* Toggle bar */}
          <div className="flex items-center gap-1.5 mt-4 p-1.5 bg-slate-900/60 border border-white/[0.06] rounded-xl w-full max-w-lg">
            {STATES.map(st => (
              <button
                key={st.id}
                onClick={() => setActive(st.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 text-xs font-heading font-semibold rounded-lg transition-all duration-200
                  ${active === st.id
                    ? 'bg-[#7C5CFF] text-white shadow-md shadow-[#7C5CFF]/30'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                  }`}
              >
                {st.icon}
                {st.label}
              </button>
            ))}
          </div>
        </div>

        {/* Graph Card */}
        <motion.div
          key={active}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="gitsense-card spotlight-border p-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
            <div>
              <h3 className="text-slate-100 text-base font-semibold flex items-center gap-2">
                {current.icon} {current.label}
              </h3>
              <p className="text-slate-400 text-sm mt-1 max-w-lg">{current.desc} Click nodes to see AI analysis.</p>
            </div>
            <span className="font-mono text-[10px] text-slate-500 bg-slate-900/60 border border-slate-800 px-2.5 py-1 rounded-lg whitespace-nowrap self-start">
              {active}.git
            </span>
          </div>
          <GitGraph state={active} />
        </motion.div>

      </div>
    </section>
  );
}

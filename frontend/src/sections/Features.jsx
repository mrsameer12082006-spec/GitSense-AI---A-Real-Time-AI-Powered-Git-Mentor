import React from 'react';
import { Bot, ShieldAlert, GitMerge, LayoutGrid, Terminal, Eye } from 'lucide-react';

const FEATURES = [
  {
    icon: Bot,
    color: '#7C5CFF',
    title: 'AI Repository Assistant',
    desc: 'Chat or voice guide that indexes commits, branches, and logs — explaining repository status in plain English.',
  },
  {
    icon: ShieldAlert,
    color: '#00D4FF',
    title: 'Smart Command Guard',
    desc: 'Intercepts pulls, pushes, and merges, scanning for remote sync gaps before you accidentally overwrite commits.',
  },
  {
    icon: GitMerge,
    color: '#00E38C',
    title: 'Merge Conflict Resolver',
    desc: 'Translates conflict markers into logical edits. Understand why they occurred and resolve them in one click.',
  },
  {
    icon: Eye,
    color: '#7C5CFF',
    title: 'Visual Commit Graph',
    desc: 'Interactive repository map. Click nodes to see AI-generated diff explanations, branch history, and commit significance.',
  },
  {
    icon: Terminal,
    color: '#00D4FF',
    title: 'Git Command Mentor',
    desc: 'Suggests the next safest command, details possible risks, flags dangerous operations, and enforces Git best practices.',
  },
  {
    icon: LayoutGrid,
    color: '#00E38C',
    title: 'Repository Health Deck',
    desc: 'Consolidates ahead/behind metrics, staging states, and safety checks into one developer-focused dashboard.',
  },
];

export default function Features() {
  return (
    <section id="features" className="relative py-24 border-t border-white/[0.05] overflow-hidden">

      <div className="section-container relative z-10">

        {/* Header */}
        <div className="section-header">
          <div className="badge bg-[#7C5CFF]/10 border-[#7C5CFF]/30 text-[#7C5CFF]">
            <LayoutGrid size={11} /> PRODUCT CAPABILITIES
          </div>
          <h2 className="text-slate-100">Designed for Safer, Faster Development</h2>
          <p className="text-slate-400 text-[1.0625rem] max-w-xl">
            Stop checking logs and hoping for the best. GitSense AI gives you full repository intelligence.
          </p>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {FEATURES.map(({ icon: Icon, color, title, desc }) => (
            <div
              key={title}
              className="gitsense-card spotlight-border p-6 flex flex-col gap-4 text-left group"
            >
              <div
                className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-300 group-hover:scale-110"
                style={{ background: `${color}18`, color }}
              >
                <Icon size={22} />
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="font-heading text-[1rem] font-bold text-slate-100">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{desc}</p>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}

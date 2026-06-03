import React from 'react';
import { Terminal, Cpu, ShieldAlert } from 'lucide-react';

const STEPS = [
  {
    num: '01',
    icon: Terminal,
    color: '#7C5CFF',
    title: 'Initialize CLI Hook',
    desc: 'Run a single command inside your local project to link GitSense AI to your repository index files.',
  },
  {
    num: '02',
    icon: Cpu,
    color: '#00D4FF',
    title: 'Semantic Analysis',
    desc: 'Our local agent parses commit paths, local adjustments, and remote origin branches to model your changes.',
  },
  {
    num: '03',
    icon: ShieldAlert,
    color: '#00E38C',
    title: 'Code with Confidence',
    desc: 'Ask the mentor questions, explore the branch map, and execute Git operations without fear of breaking code.',
  },
];

export default function HowItWorks() {
  return (
    <section className="relative py-24 border-t border-white/[0.05] overflow-hidden">
      <div className="glow-blur glow-cyan w-[350px] h-[350px] bottom-0 -right-16 pointer-events-none" />

      <div className="section-container relative z-10">

        {/* Header */}
        <div className="section-header">
          <h2 className="text-slate-100">How GitSense Works</h2>
          <p className="text-slate-400 text-[1.0625rem] max-w-xl">
            Three steps from command memorisation to clear visual repository understanding.
          </p>
        </div>

        {/* Steps */}
        <div className="relative grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-6">

          {/* Connector line — desktop only */}
          <div className="hidden lg:block absolute top-[2.375rem] left-[calc(16.66%+1.5rem)] right-[calc(16.66%+1.5rem)] h-[1px]
            bg-gradient-to-r from-[#7C5CFF]/30 via-[#00D4FF]/40 to-[#00E38C]/30 z-0" />

          {STEPS.map(({ num, icon: Icon, color, title, desc }) => (
            <div key={num} className="flex flex-col items-center text-center gap-5 relative z-10">

              {/* Number + Icon circle */}
              <div
                className="w-[4.75rem] h-[4.75rem] rounded-full flex items-center justify-center border-2 relative flex-shrink-0"
                style={{ borderColor: `${color}40`, background: `${color}12` }}
              >
                <Icon size={22} style={{ color }} />
                <span
                  className="absolute -top-2.5 -right-2.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border"
                  style={{ color, background: '#0B1020', borderColor: `${color}40` }}
                >
                  {num}
                </span>
              </div>

              {/* Text */}
              <div className="flex flex-col gap-2">
                <h3 className="font-heading font-bold text-base text-slate-100">{title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed max-w-[18rem] mx-auto">{desc}</p>
              </div>
            </div>
          ))}

        </div>
      </div>
    </section>
  );
}

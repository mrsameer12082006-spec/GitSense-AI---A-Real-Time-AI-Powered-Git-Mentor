import React from 'react';
import { motion } from 'framer-motion';
import { Terminal, ShieldCheck, ArrowRight, Play } from 'lucide-react';
import MagneticButton from '../components/MagneticButton';
import GitGraph from '../components/GitGraph';

export default function Hero() {
  return (
    <section className="relative min-h-[92vh] flex items-center justify-center pt-20 pb-20 overflow-hidden">
      {/* Glow Blobs — clipped by section overflow:hidden */}
      <div className="glow-blur glow-purple w-[500px] h-[500px] -top-20 -left-20 pointer-events-none" />
      <div className="glow-blur glow-cyan   w-[600px] h-[600px] bottom-0 -right-20 pointer-events-none" />

      <div className="section-container relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-14 items-center">

          {/* ── Left: Copy & CTAs ── */}
          <div className="flex flex-col items-start gap-7">

            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="badge bg-[#7C5CFF]/10 border-[#7C5CFF]/35 text-[#7C5CFF]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#7C5CFF] animate-pulse" />
              REAL-TIME REPOSITORY INTELLIGENCE
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.08 }}
              className="gradient-text leading-[1.1]"
            >
              Know Exactly<br />
              What Happens<br />
              Next.
            </motion.h1>

            {/* Sub-copy */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.16 }}
              className="text-[1.125rem] leading-[1.7] text-slate-400 max-w-lg"
            >
              Understand branches, merges, conflicts, and repository changes
              through intelligent visual guidance. Stop guessing — code with
              absolute clarity.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.24 }}
              className="flex flex-wrap items-center gap-4 pt-1"
            >
              <MagneticButton
                className="btn btn-primary"
                onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Get Started <ArrowRight size={15} />
              </MagneticButton>
            </motion.div>

            {/* Trust strip */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.36 }}
              className="flex items-center gap-5 pt-2"
            >
              {['Git 2.24+', 'Node 18+', 'Open Source'].map(label => (
                <span key={label} className="flex items-center gap-1.5 text-xs text-slate-500 font-mono">
                  <span className="w-1 h-1 rounded-full bg-[#00E38C]" />
                  {label}
                </span>
              ))}
            </motion.div>
          </div>

          {/* ── Right: Interactive Graph + AI Card ── */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 20 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="flex flex-col gap-5 w-full"
          >
            {/* Graph card */}
            <div className="gitsense-card spotlight-border p-6 flex flex-col gap-5">
              {/* macOS‑style title bar */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-500/80"   />
                  <span className="w-3 h-3 rounded-full bg-yellow-500/80" />
                  <span className="w-3 h-3 rounded-full bg-green-500/80"  />
                </div>
                <span className="font-mono text-[11px] text-slate-500 tracking-wide">
                  interactive_repository_map.git
                </span>
              </div>
              <GitGraph state="normal" />
            </div>

            {/* AI recommendation strip */}
            <motion.div
              initial={{ y: 16, opacity: 0 }}
              animate={{ y: 0,  opacity: 1 }}
              transition={{ duration: 0.55, delay: 0.48 }}
              className="gitsense-card spotlight-border p-5 flex items-start gap-4"
              style={{ borderColor: 'rgba(124,92,255,0.3)' }}
            >
              {/* Left accent bar */}
              <div className="absolute top-0 left-0 w-1 h-full bg-[#7C5CFF] rounded-l-2xl" />

              <div className="p-2.5 rounded-xl bg-[#7C5CFF]/10 text-[#7C5CFF] shrink-0 ml-3">
                <Terminal size={20} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                  <span className="font-heading font-semibold text-sm text-[#F8FAFC]">
                    Recommended Next Action
                  </span>
                  <span className="text-[10px] font-mono font-semibold text-[#00E38C] bg-[#00E38C]/10 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <ShieldCheck size={9} /> SAFE
                  </span>
                </div>
                <div className="font-mono text-xs text-[#00D4FF] bg-slate-950/70 px-3 py-2 rounded-lg border border-slate-800 mb-2">
                  git merge feature/auth
                </div>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Branch <span className="text-[#00D4FF] font-mono">feature/auth</span> has no conflicts
                  with <span className="text-[#7C5CFF] font-mono">main</span>. Safe to merge — 2 commits will be applied.
                </p>
              </div>
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}

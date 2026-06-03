import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldAlert, Sparkles, Check, FileCode, ArrowRight } from 'lucide-react';

export default function MergeConflictPreview() {
  const [resolved, setResolved] = useState(false);
  const [resolving, setResolving] = useState(false);

  const handleResolve = () => {
    setResolving(true);
    setTimeout(() => { setResolving(false); setResolved(true); }, 1800);
  };

  return (
    <section id="conflict-resolver" className="relative py-24 border-t border-white/[0.05] overflow-hidden">
      <div className="glow-blur glow-cyan w-[350px] h-[350px] -top-10 -right-10 pointer-events-none" />

      <div className="section-container relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">

          {/* ── Editor mock (left, 7 cols) ── */}
          <div className="lg:col-span-7">
            <div className="gitsense-card spotlight-border p-0 shadow-2xl">

              {/* Title bar */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/[0.06] bg-white/[0.02]">
                <div className="flex items-center gap-2">
                  <FileCode size={14} className="text-[#00D4FF]" />
                  <span className="font-mono text-xs text-slate-400">src/utils/auth.js</span>
                </div>
                <span className="text-[10px] font-mono text-slate-600">javascript</span>
              </div>

              {/* Scan line */}
              {resolving && (
                <motion.div
                  initial={{ top: '48px' }}
                  animate={{ top: '100%' }}
                  transition={{ duration: 1.8, ease: 'linear' }}
                  className="absolute left-0 right-0 h-[2px] z-20 pointer-events-none"
                  style={{ background: 'linear-gradient(90deg, transparent, #00E38C, transparent)', boxShadow: '0 0 12px #00E38C' }}
                />
              )}

              {/* Code area */}
              <div className="p-6 font-mono text-xs h-64 overflow-auto leading-relaxed">
                <AnimatePresence mode="wait">
                  {!resolved ? (
                    <motion.div key="raw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <span className="text-slate-400">{'export const generateSession = (user) => {\n'}</span>
                      <span className="block -mx-6 px-6 text-[#7C5CFF] bg-[#7C5CFF]/[0.08] font-semibold whitespace-pre">{
`<<<<<<< HEAD (Local)\n  return jwt.sign({ id: user.id }, SECRET, {\n    expiresIn: '72h'\n  });`}
                      </span>
                      <span className="block text-slate-500">{'======='}</span>
                      <span className="block -mx-6 px-6 text-[#00D4FF] bg-[#00D4FF]/[0.06] font-semibold whitespace-pre">{
`  return jwt.sign({ id: user.id, role: user.role }, SECRET, {\n    expiresIn: '24h'\n  });\n>>>>>>> origin/main`}
                      </span>
                      <span className="text-slate-400">{'};\n'}</span>
                    </motion.div>
                  ) : (
                    <motion.div key="clean" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <span className="text-slate-400">{'export const generateSession = (user) => {\n'}</span>
                      <span className="block -mx-6 px-6 text-[#00E38C] bg-[#00E38C]/[0.08] font-semibold whitespace-pre">{
`  // Resolved by GitSense AI — merged role metadata + 72h expiry\n  return jwt.sign({ id: user.id, role: user.role }, SECRET, {\n    expiresIn: '72h'\n  });`}
                      </span>
                      <span className="text-slate-400">{'};\n'}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Action bar */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-white/[0.06] bg-white/[0.02]">
                <span className={`text-xs flex items-center gap-1.5 font-mono ${resolved ? 'text-[#00E38C]' : 'text-[#FFB800]'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${resolved ? 'bg-[#00E38C]' : 'bg-[#FFB800] animate-pulse'}`} />
                  {resolved ? '1 conflict resolved' : '1 conflict block detected'}
                </span>
                {!resolved ? (
                  <button
                    onClick={handleResolve}
                    disabled={resolving}
                    className="btn btn-cyan !py-2 !px-4 !text-xs flex items-center gap-2"
                  >
                    <Sparkles size={13} />
                    {resolving ? 'Resolving...' : 'Auto-Resolve with AI'}
                  </button>
                ) : (
                  <button onClick={() => setResolved(false)} className="btn btn-secondary !py-2 !px-4 !text-xs">
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ── Explanation (right, 5 cols) ── */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="badge bg-[#FF4B4B]/10 border-[#FF4B4B]/30 text-[#FF4B4B]">
              <ShieldAlert size={11} /> CONFLICT BREAKDOWN
            </div>
            <h2 className="text-slate-100 leading-tight">Say Goodbye to Conflict Nightmares</h2>
            <p className="text-slate-400 text-[1.0625rem] leading-relaxed">
              Instead of raw diff markers, GitSense AI explains the conflict in plain English and recommends exactly which values to keep.
            </p>

            <div className="gitsense-card p-5 flex flex-col gap-4">
              <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">GitSense AI Assessment</span>
              <p className="text-sm text-slate-300 leading-relaxed">
                "Both branches edited <span className="font-mono text-[#00D4FF]">auth.js</span>. Local branch set
                JWT expiry to <span className="text-[#7C5CFF] font-semibold">72h</span>. Remote main added
                user <span className="text-[#00D4FF] font-semibold">role</span> metadata to the payload.
                I recommend accepting both changes."
              </p>
              <div className="flex items-center gap-2 text-xs font-mono text-slate-500 pt-1 border-t border-white/[0.05]">
                <span className="text-[#7C5CFF]">HEAD: 72h expiry</span>
                <ArrowRight size={11} />
                <span className="text-[#00D4FF]">main: user.role</span>
                <ArrowRight size={11} />
                <span className="text-[#00E38C]">Merged ✓</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}

import React, { useState } from 'react';
import { motion } from 'framer-motion';
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
  const [pulses, setPulses] = useState([]);
  const [rippleCounters, setRippleCounters] = useState([0, 0, 0]);

  const triggerRipple = (idx) => {
    setRippleCounters(prev => {
      const next = [...prev];
      next[idx] += 1;
      return next;
    });
  };

  const handleStepClick = (idx) => {
    const uniqueId = `${Date.now()}-${Math.random()}`;
    const stepColor = STEPS[idx].color;

    if (idx === 0) {
      // Step 1 clicked: ripple immediately, then travel 1 -> 2 -> 3
      triggerRipple(0);
      
      setPulses(prev => [...prev, {
        id: uniqueId,
        start: '16.66%',
        end: '83.33%',
        color: stepColor,
        duration: 1.0
      }]);

      const t1 = setTimeout(() => triggerRipple(1), 500);
      const t2 = setTimeout(() => triggerRipple(2), 1000);

      setTimeout(() => {
        setPulses(prev => prev.filter(p => p.id !== uniqueId));
        clearTimeout(t1);
        clearTimeout(t2);
      }, 1100);
    } 
    else if (idx === 1) {
      // Step 2 clicked: ripple immediately, then travel 2 -> 1 and 2 -> 3
      triggerRipple(1);

      const idLeft = `${uniqueId}-L`;
      const idRight = `${uniqueId}-R`;

      setPulses(prev => [
        ...prev,
        {
          id: idLeft,
          start: '50%',
          end: '16.66%',
          color: stepColor,
          duration: 0.5
        },
        {
          id: idRight,
          start: '50%',
          end: '83.33%',
          color: stepColor,
          duration: 0.5
        }
      ]);

      const t1 = setTimeout(() => triggerRipple(0), 500);
      const t2 = setTimeout(() => triggerRipple(2), 500);

      setTimeout(() => {
        setPulses(prev => prev.filter(p => p.id !== idLeft && p.id !== idRight));
        clearTimeout(t1);
        clearTimeout(t2);
      }, 600);
    } 
    else if (idx === 2) {
      // Step 3 clicked: ripple immediately, then travel 3 -> 2 -> 1
      triggerRipple(2);

      setPulses(prev => [...prev, {
        id: uniqueId,
        start: '83.33%',
        end: '16.66%',
        color: stepColor,
        duration: 1.0
      }]);

      const t1 = setTimeout(() => triggerRipple(1), 500);
      const t2 = setTimeout(() => triggerRipple(0), 1000);

      setTimeout(() => {
        setPulses(prev => prev.filter(p => p.id !== uniqueId));
        clearTimeout(t1);
        clearTimeout(t2);
      }, 1100);
    }
  };

  return (
    <section id="how-it-works" className="relative py-24 border-t border-white/[0.05] overflow-hidden">
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

          {/* Glowing pulses traveling on line — desktop only */}
          <div className="hidden lg:block absolute inset-0 pointer-events-none z-0">
            {pulses.map(pulse => (
              <motion.div
                key={pulse.id}
                initial={{ left: pulse.start, opacity: 0.8 }}
                animate={{ left: pulse.end, opacity: [0.8, 1, 0.8, 0] }}
                transition={{ duration: pulse.duration, ease: "linear" }}
                className="absolute w-2.5 h-2.5 rounded-full shadow-[0_0_12px_4px_currentColor] pointer-events-none"
                style={{
                  top: '2.375rem',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: pulse.color,
                  color: pulse.color
                }}
              />
            ))}
          </div>

          {STEPS.map(({ num, icon: Icon, color, title, desc }, idx) => (
            <div key={num} className="flex flex-col items-center text-center gap-5 relative z-10">

              {/* Number + Icon circle */}
              <div
                onClick={() => handleStepClick(idx)}
                className="w-[4.75rem] h-[4.75rem] rounded-full flex items-center justify-center border-2 relative flex-shrink-0 cursor-pointer transition-all duration-300 select-none"
                style={{
                  borderColor: `${color}40`,
                  background: `${color}12`,
                  boxShadow: `0 0 10px ${color}10`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.08)';
                  e.currentTarget.style.boxShadow = `0 0 22px ${color}40`;
                  e.currentTarget.style.borderColor = `${color}75`;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.boxShadow = `0 0 10px ${color}10`;
                  e.currentTarget.style.borderColor = `${color}40`;
                }}
              >
                <Icon size={22} style={{ color }} />
                <span
                  className="absolute -top-2.5 -right-2.5 text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md border"
                  style={{ color, background: '#0B1020', borderColor: `${color}40` }}
                >
                  {num}
                </span>

                {/* Expanding Ripple effect on hit */}
                {rippleCounters[idx] > 0 && (
                  <motion.div
                    key={`${idx}-${rippleCounters[idx]}`}
                    initial={{ scale: 0.9, opacity: 0.9 }}
                    animate={{ scale: 1.8, opacity: 0 }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="absolute inset-[-2px] rounded-full border-2 pointer-events-none"
                    style={{ borderColor: color, zIndex: -1 }}
                  />
                )}
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

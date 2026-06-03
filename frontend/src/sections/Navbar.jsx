import React from 'react';
import MagneticButton from '../components/MagneticButton';

export default function Navbar() {
  return (
    <header className="sticky top-0 w-full z-50 border-b border-white/[0.06] bg-[#060913]/85 backdrop-blur-xl">
      <div className="section-container flex items-center justify-between py-4">

        {/* Brand Logo */}
        <a href="#" className="flex items-center gap-3 group flex-shrink-0">
          <div className="relative w-8 h-8 flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full transition-transform duration-300 group-hover:rotate-[15deg]">
              <defs>
                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#00D4FF" />
                  <stop offset="100%" stopColor="#7C5CFF" />
                </linearGradient>
              </defs>
              <path d="M 25 50 C 25 20, 75 20, 75 50 C 75 80, 25 80, 25 50 Z"
                fill="none" stroke="url(#logoGrad)" strokeWidth="10" strokeLinecap="round" />
              <path d="M 25 50 H 52"
                fill="none" stroke="url(#logoGrad)" strokeWidth="10" strokeLinecap="round" />
              <circle cx="25" cy="50" r="9" fill="#060913" stroke="#00D4FF" strokeWidth="5.5" />
              <circle cx="75" cy="50" r="9" fill="#060913" stroke="#7C5CFF" strokeWidth="5.5" />
              <circle cx="50" cy="50" r="7"  fill="#F8FAFC" />
            </svg>
            <div className="absolute inset-0 rounded-full bg-[#00D4FF]/20 blur-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
          </div>
          <span className="font-heading font-bold text-xl tracking-tight text-slate-100 group-hover:text-white transition-colors">
            GitSense<span style={{ color: '#7C5CFF' }}>.AI</span>
          </span>
        </a>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-7">
          {[
            ['#visualizer',      'Playground'],
            ['#ai-mentor',       'AI Mentor'],
            ['#conflict-resolver','Conflicts'],
            ['#health-dashboard','Health'],
            ['#features',        'Features'],
          ].map(([href, label]) => (
            <a key={href} href={href}
              className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors relative
                         after:absolute after:bottom-[-3px] after:left-0 after:h-[2px] after:w-0 after:bg-[#00D4FF]
                         after:transition-[width] after:duration-300 hover:after:w-full"
            >
              {label}
            </a>
          ))}
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-4 flex-shrink-0">
          <a href="#features"
            className="hidden sm:inline-block text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">
            Docs
          </a>
          <MagneticButton
            className="btn btn-primary !py-2.5 !px-5 !text-sm"
            onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}
          >
            Start Free
          </MagneticButton>
        </div>
      </div>
    </header>
  );
}

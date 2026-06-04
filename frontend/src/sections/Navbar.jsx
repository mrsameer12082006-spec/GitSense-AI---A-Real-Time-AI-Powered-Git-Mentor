import React from 'react';
import { Mail, ChevronRight } from 'lucide-react';
import MagneticButton from '../components/MagneticButton';

const LinkedinIcon = ({ size = 14, className = "" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M16 8a6 6 0 0 1 6 6v6h-4v-6a2 2 0 0 0-4 0v6h-4v-12h4v2z" />
    <rect x="2" y="9" width="4" height="12" />
    <circle cx="4" cy="4" r="2" />
  </svg>
);

const featureItems = [
  {
    name: 'AI Assistance',
    desc: 'Real-time AI Git mentor explaining commits and logs in plain English.',
    href: '#ai-mentor',
    emoji: '🤖',
  },
  {
    name: 'Visualization Graph',
    desc: 'Interactive repository map visualizing branch lifecycles.',
    href: '#visualizer',
    emoji: '📊',
  },
  {
    name: 'Git Command Mentor',
    desc: 'Safety guards flagging dangerous operations and suggesting next steps.',
    href: '#features',
    emoji: '🧠',
  },
];

const howItWorksItems = [
  {
    name: 'Initialize CLI Hook',
    desc: 'Run a single command to link GitSense AI to your local repository.',
    href: '#how-it-works',
    emoji: '🔌',
  },
  {
    name: 'Semantic Analysis',
    desc: 'Our agent parses commit paths and branches to model changes.',
    href: '#how-it-works',
    emoji: '🔍',
  },
  {
    name: 'Code with Confidence',
    desc: 'Ask questions, explore graphs, and merge without breaking code.',
    href: '#how-it-works',
    emoji: '🛡️',
  },
];

const developers = [
  {
    name: 'Kartik Sharma',
    email: 'kartik.s1280@gmail.com',
    linkedin: 'https://www.linkedin.com/in/kartik1280',
    emoji: '🧑‍💻',
  },
  {
    name: 'Sameer Mishra',
    email: 'mrsameer12082006@gmail.com',
    linkedin: 'https://www.linkedin.com/in/sameer-mishra2006',
    emoji: '😎',
  },
  {
    name: 'Ayesh Srivastava',
    email: 'ayeshsrivastava@gmail.com',
    linkedin: 'https://www.linkedin.com/in/ayesh-srivastava-780672390',
    emoji: '📚',
  },
  {
    name: 'Manik Chauhan',
    email: '2manik2288@gmail.com',
    linkedin: 'https://www.linkedin.com/in/manik-chauhan-5221573b7',
    emoji: '🤖',
  },
];

export default function Navbar() {
  return (
    <header className="sticky top-0 w-full z-50 border-b border-white/[0.06] bg-[#060913]/85 backdrop-blur-xl">
      <div className="section-container flex items-center justify-between py-4">

        {/* Brand Logo */}
        <a href="#home" className="flex items-center gap-3 group flex-shrink-0">
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
          {/* Features with Dropdown */}
          <div className="relative group py-2">
            <a href="#features"
              className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors relative
                         after:absolute after:bottom-[-3px] after:left-0 after:h-[2px] after:w-0 after:bg-[#00D4FF]
                         after:transition-[width] after:duration-300 hover:after:w-full"
            >
              Features
            </a>

            {/* Features Dropdown */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform scale-95 group-hover:scale-100 origin-top z-50">
              <div className="rounded-xl border border-white/[0.08] bg-[#0b1220]/95 backdrop-blur-xl p-1.5 shadow-2xl flex flex-col gap-1">
                {featureItems.map((feat) => (
                  <a key={feat.name} href={feat.href} className="flex flex-col gap-0.5 px-3 py-2 text-xs text-left rounded-lg hover:bg-white/5 transition-colors group/item">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{feat.emoji}</span>
                      <span className="text-[13px] font-semibold text-slate-200 group-hover/item:text-white transition-colors">{feat.name}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal leading-relaxed">{feat.desc}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* About Us with Dropdown */}
          <div className="relative group py-2">
            <a href="#developers"
              className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors relative
                         after:absolute after:bottom-[-3px] after:left-0 after:h-[2px] after:w-0 after:bg-[#00D4FF]
                         after:transition-[width] after:duration-300 hover:after:w-full"
            >
              About Us
            </a>

            {/* Main Dropdown */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-56 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform scale-95 group-hover:scale-100 origin-top z-50">
              <div className="rounded-xl border border-white/[0.08] bg-[#0b1220]/95 backdrop-blur-xl p-1.5 shadow-2xl flex flex-col gap-1">
                {developers.map((dev) => (
                  <div key={dev.name} className="relative group/item">
                    <div className="flex items-center justify-between w-full px-3 py-2.5 text-sm font-medium text-slate-300 hover:text-white hover:bg-white/5 rounded-lg transition-colors cursor-pointer select-none">
                      <span className="flex items-center gap-2">
                        <span className="text-base">{dev.emoji}</span>
                        <span>{dev.name}</span>
                      </span>
                      <ChevronRight size={14} className="text-slate-500 group-hover/item:text-slate-300 transition-colors" />
                    </div>

                    {/* Sideways Submenu */}
                    <div className="absolute left-full top-0 pl-2 w-44 opacity-0 invisible group-hover/item:opacity-100 group-hover/item:visible transition-all duration-300 transform translate-x-[-8px] group-hover/item:translate-x-0 origin-left z-50">
                      <div className="rounded-xl border border-white/[0.08] bg-[#0b1220]/95 backdrop-blur-xl p-1.5 shadow-2xl flex flex-col gap-1">
                        <a href={dev.linkedin} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                          <LinkedinIcon size={14} className="text-[#00D4FF]" />
                          LinkedIn
                        </a>
                        <a href={`mailto:${dev.email}`} className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-white/5 rounded-lg transition-colors">
                          <Mail size={14} className="text-[#7C5CFF]" />
                          Email
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* How It Works with Dropdown */}
          <div className="relative group py-2">
            <a href="#how-it-works"
              className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors relative
                         after:absolute after:bottom-[-3px] after:left-0 after:h-[2px] after:w-0 after:bg-[#00D4FF]
                         after:transition-[width] after:duration-300 hover:after:w-full"
            >
              How It Works
            </a>

            {/* How It Works Dropdown */}
            <div className="absolute top-full left-1/2 -translate-x-1/2 pt-2 w-72 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 transform scale-95 group-hover:scale-100 origin-top z-50">
              <div className="rounded-xl border border-white/[0.08] bg-[#0b1220]/95 backdrop-blur-xl p-1.5 shadow-2xl flex flex-col gap-1">
                {howItWorksItems.map((step) => (
                  <a key={step.name} href={step.href} className="flex flex-col gap-0.5 px-3 py-2 text-xs text-left rounded-lg hover:bg-white/5 transition-colors group/item">
                    <span className="flex items-center gap-2">
                      <span className="text-sm">{step.emoji}</span>
                      <span className="text-[13px] font-semibold text-slate-200 group-hover/item:text-white transition-colors">{step.name}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal leading-relaxed">{step.desc}</span>
                  </a>
                ))}
              </div>
            </div>
          </div>
        </nav>

        {/* CTAs */}
        <div className="flex items-center gap-5 flex-shrink-0">
          <a href="#login"
            className="text-sm font-medium text-slate-400 hover:text-slate-100 transition-colors">
            Log In
          </a>
          <a href="#signup" className="flex items-center">
            <MagneticButton
              className="btn btn-primary !py-2.5 !px-5 !text-sm"
            >
              Sign Up
            </MagneticButton>
          </a>
        </div>
      </div>
    </header>
  );
}

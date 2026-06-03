import React from 'react';
import CursorSpotlight from './components/CursorSpotlight';
import ParticleCanvas from './components/ParticleCanvas';
import Navbar from './sections/Navbar';
import Hero from './sections/Hero';
import VisualizerSection from './sections/VisualizerSection';
import AIShowcase from './sections/AIShowcase';

import Features from './sections/Features';
import HowItWorks from './sections/HowItWorks';
import CTA from './sections/CTA';

export default function App() {
  return (
    <div className="min-h-screen bg-[#0B1020] text-[#F8FAFC] relative overflow-x-hidden">

      {/* Layer 0 — fixed canvas background */}
      <ParticleCanvas />

      {/* Layer 1 — mouse-based spotlight tracker */}
      <CursorSpotlight />

      {/* Layer 2 — page layout */}
      <div className="relative z-10 flex flex-col min-h-screen">
        <Navbar />

        <main className="flex-1">
          <Hero />
          <VisualizerSection />
          <AIShowcase />

          <Features />
          <HowItWorks />
          <CTA />
        </main>

        {/* Footer */}
        <footer className="border-t border-white/[0.05] bg-[#060913]/80 backdrop-blur-md py-10 px-6">
          <div className="section-container flex flex-col sm:flex-row items-center justify-between gap-5">
            {/* Brand */}
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="font-heading font-bold text-slate-400">
                GitSense<span style={{ color: '#7C5CFF' }}>.AI</span>
              </span>
              <span>© {new Date().getFullYear()} Team Delmora — All rights reserved.</span>
            </div>

            {/* Links */}
            <nav className="flex items-center gap-6 text-xs text-slate-500">
              {['Privacy', 'Terms', 'Security', 'GitHub'].map(l => (
                <a key={l} href="#" className="hover:text-slate-300 transition-colors">{l}</a>
              ))}
            </nav>
          </div>
        </footer>
      </div>
    </div>
  );
}

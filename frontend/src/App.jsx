import React from 'react';
import CursorSpotlight from './components/CursorSpotlight';
import ParticleCanvas from './components/ParticleCanvas';
import Navbar from './sections/Navbar';
import Hero from './sections/Hero';
import VisualizerSection from './sections/VisualizerSection';
import AIShowcase from './sections/AIShowcase';

import Features from './sections/Features';
import HowItWorks from './sections/HowItWorks';
import Developers from './sections/Developers';

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
          <Developers />
        </main>

        {/* Footer removed — footer is rendered inside Developers section for a unified look */}
      </div>
    </div>
  );
}

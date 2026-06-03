import React, { useRef, useState } from 'react';
import { motion, useSpring, useTransform, useMotionValue } from 'framer-motion';

export default function MagneticButton({ children, className = '', onClick }) {
  const ref = useRef(null);
  const [hovered, setHovered] = useState(false);

  // Motion values for tracking cursor relative to button center
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Springs for smooth physics-based motion
  const springConfig = { damping: 15, elasticity: 0.1, stiffness: 150 };
  const springX = useSpring(x, springConfig);
  const springY = useSpring(y, springConfig);

  const handleMouseMove = (e) => {
    if (!ref.current) return;
    const { clientX, clientY } = e;
    const { left, top, width, height } = ref.current.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    
    // Distance from center, scaled down to create magnetic pull
    const distanceX = clientX - centerX;
    const distanceY = clientY - centerY;

    // Limit maximum pull distance to 15px
    const maxPull = 15;
    const pullX = Math.min(Math.max(distanceX * 0.35, -maxPull), maxPull);
    const pullY = Math.min(Math.max(distanceY * 0.35, -maxPull), maxPull);

    x.set(pullX);
    y.set(pullY);
  };

  const handleMouseLeave = () => {
    setHovered(false);
    x.set(0);
    y.set(0);
  };

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        x: springX,
        y: springY,
        display: 'inline-block',
      }}
    >
      <button 
        className={className} 
        onClick={onClick}
        style={{
          position: 'relative',
          zIndex: 1,
        }}
      >
        {children}
        {/* Glow effect on hover */}
        {hovered && (
          <motion.span
            layoutId="btn-glow"
            className="absolute inset-0 pointer-events-none"
            style={{
              borderRadius: 'inherit',
              boxShadow: '0 0 20px var(--primary)',
              opacity: 0.3,
            }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          />
        )}
      </button>
    </motion.div>
  );
}

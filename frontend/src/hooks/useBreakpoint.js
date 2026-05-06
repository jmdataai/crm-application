import { useState, useEffect } from 'react';

/**
 * Returns responsive breakpoint flags.
 * isMobile   : <= 768px  (phones)
 * isTablet   : <= 1024px (tablets / small laptops)
 * isSmall    : <= 480px  (small phones)
 */
export const useBreakpoint = () => {
  const getWidth = () =>
    typeof window !== 'undefined' ? window.innerWidth : 1280;

  const [width, setWidth] = useState(getWidth);

  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return {
    width,
    isMobile:  width <= 768,
    isTablet:  width <= 1024,
    isSmall:   width <= 480,
  };
};

export default useBreakpoint;

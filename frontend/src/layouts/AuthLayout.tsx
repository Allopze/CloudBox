import { Outlet, useLocation } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { useBrandingStore } from '../stores/brandingStore';
import { useThemeStore } from '../stores/themeStore';
import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useEffect } from 'react';

// Track navigation direction for slide animation
const routeOrder = ['/login', '/register', '/forgot-password', '/reset-password'];

function getDirection(from: string, to: string): number {
  const fromIndex = routeOrder.findIndex(r => from.startsWith(r));
  const toIndex = routeOrder.findIndex(r => to.startsWith(r));
  return toIndex > fromIndex ? 1 : -1;
}

export default function AuthLayout() {
  const { branding } = useBrandingStore();
  const { isDark } = useThemeStore();
  const location = useLocation();
  const logo = (isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl;

  const prevPathRef = useRef(location.pathname);
  const direction = getDirection(prevPathRef.current, location.pathname);

  useEffect(() => {
    prevPathRef.current = location.pathname;
  }, [location.pathname]);

  const slideVariants = {
    initial: (dir: number) => ({
      opacity: 0,
      x: dir * 100,
    }),
    animate: {
      opacity: 1,
      x: 0,
    },
    exit: (dir: number) => ({
      opacity: 0,
      x: dir * -100,
    }),
  };

  const slideTransition = {
    type: 'spring',
    stiffness: 300,
    damping: 30,
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] dark:bg-dark-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl p-8 overflow-hidden">
          {/* Logo inside card */}
          <div className="flex justify-center mb-8">
            {logo ? (
              <img src={logo} alt="Logo" className="h-20 object-contain" />
            ) : (
              <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center">
                <Cloud className="w-12 h-12 text-white" />
              </div>
            )}
          </div>
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={location.pathname}
              custom={direction}
              variants={slideVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={slideTransition}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

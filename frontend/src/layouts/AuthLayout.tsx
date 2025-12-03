import { Outlet, useLocation } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { useBrandingStore } from '../stores/brandingStore';
import { useThemeStore } from '../stores/themeStore';
import { motion, AnimatePresence } from 'framer-motion';

const pageVariants = {
  initial: { 
    opacity: 0, 
    y: 8,
  },
  animate: { 
    opacity: 1, 
    y: 0,
  },
  exit: { 
    opacity: 0,
    y: -8,
  },
};

const pageTransition = {
  type: 'tween',
  ease: 'easeOut',
  duration: 0.15,
};

export default function AuthLayout() {
  const { branding } = useBrandingStore();
  const { isDark } = useThemeStore();
  const location = useLocation();
  const logo = (isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] dark:bg-dark-950 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl p-8">
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
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              variants={pageVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={pageTransition}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

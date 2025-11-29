import { Outlet, useLocation } from 'react-router-dom';
import { Cloud } from 'lucide-react';
import { useBrandingStore } from '../stores/brandingStore';
import { useThemeStore } from '../stores/themeStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function AuthLayout() {
  const { branding } = useBrandingStore();
  const { isDark } = useThemeStore();
  const location = useLocation();
  const logo = (isDark ? branding.logoDarkUrl : branding.logoLightUrl) || branding.logoUrl;

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] dark:bg-dark-950 p-4">
      <div className="w-full max-w-md">
        <motion.div
          layout
          className="bg-white dark:bg-dark-800 rounded-2xl shadow-2xl p-8 overflow-hidden"
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
        >
          {/* Logo inside card */}
          <motion.div layout className="flex justify-center mb-8">
            {logo ? (
              <img src={logo} alt="Logo" className="h-20 object-contain" />
            ) : (
              <div className="w-20 h-20 bg-primary-600 rounded-2xl flex items-center justify-center">
                <Cloud className="w-12 h-12 text-white" />
              </div>
            )}
          </motion.div>
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
}

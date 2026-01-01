import { create } from 'zustand';


interface MaintenanceState {
    isMaintenance: boolean;
    message: string;
    lastChecked: number;
    checkStatus: () => Promise<void>;
    setIsMaintenance: (enabled: boolean, message?: string) => void;
}

export const useMaintenanceStore = create<MaintenanceState>((set) => ({
    isMaintenance: false,
    message: '',
    lastChecked: 0,

    checkStatus: async () => {
        try {
            // Use explicit fetch to avoid circular dependency if api interceptor uses the store
            // But we use the store in the interceptor, so using the raw api instance is fine if it doesn't trigger loop
            // Or we can use fetch directly for the status check to be safe
            const res = await fetch('/api/status/maintenance');
            if (res.ok) {
                const data = await res.json();
                set({
                    isMaintenance: data.maintenance,
                    message: data.message || '',
                    lastChecked: Date.now()
                });
            }
        } catch (error) {
            console.error('Failed to check maintenance status', error);
        }
    },

    setIsMaintenance: (enabled: boolean, message?: string) => {
        set({ isMaintenance: enabled, message: message || '' });
    }
}));

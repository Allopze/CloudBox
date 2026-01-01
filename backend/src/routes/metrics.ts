import { Router, Request, Response } from 'express';
import si from 'systeminformation';
import { authenticate, requireAdmin } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/admin/metrics
 * Returns real-time system metrics for the admin dashboard.
 * Requires admin authentication.
 * 
 * Works on Windows, Linux, and macOS.
 */
router.get('/', authenticate, requireAdmin, async (req: Request, res: Response) => {
    try {
        // Fetch all metrics in parallel for performance
        const [cpu, mem, disk, osInfo, networkStats, temp, time, load] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.fsSize(),
            si.osInfo(),
            si.networkStats(),
            si.cpuTemperature(),
            si.time(),
            si.fullLoad(),
        ]);

        // Filter out virtual/loop devices on Linux
        const filteredDisks = disk.filter(d =>
            !d.mount.startsWith('/snap') &&
            !d.mount.startsWith('/boot') &&
            !d.fs.startsWith('tmpfs') &&
            !d.fs.startsWith('devtmpfs') &&
            d.size > 0
        );

        // Filter network interfaces (exclude virtual/loopback)
        const filteredNetwork = networkStats.filter(n =>
            !n.iface.startsWith('lo') &&
            !n.iface.startsWith('veth') &&
            !n.iface.includes('docker') &&
            !n.iface.includes('br-')
        );

        res.json({
            cpu: {
                usage: Math.round(cpu.currentLoad * 10) / 10, // 1 decimal
                cores: cpu.cpus?.length || 0,
                perCore: cpu.cpus?.map(c => Math.round(c.load * 10) / 10) || [],
            },
            memory: {
                total: mem.total,
                used: mem.used,
                free: mem.free,
                available: mem.available,
                percentage: Math.round((mem.used / mem.total) * 100),
                swap: {
                    total: mem.swaptotal,
                    used: mem.swapused,
                    percentage: mem.swaptotal > 0
                        ? Math.round((mem.swapused / mem.swaptotal) * 100)
                        : 0,
                },
            },
            disk: filteredDisks.map(d => ({
                mount: d.mount,
                fs: d.fs,
                type: d.type,
                size: d.size,
                used: d.used,
                available: d.available,
                percentage: Math.round(d.use),
            })),
            temperature: {
                main: temp.main !== null ? Math.round(temp.main) : null,
                max: temp.max !== null ? Math.round(temp.max) : null,
                cores: temp.cores?.map(c => Math.round(c)) || [],
                chipset: temp.chipset !== null && temp.chipset !== undefined ? Math.round(temp.chipset) : null,
            },
            network: filteredNetwork.slice(0, 4).map(n => ({
                iface: n.iface,
                rx_sec: Math.round(n.rx_sec),      // bytes/sec received
                tx_sec: Math.round(n.tx_sec),      // bytes/sec transmitted
                rx_total: n.rx_bytes,              // total bytes received
                tx_total: n.tx_bytes,              // total bytes transmitted
            })),
            os: {
                platform: osInfo.platform,
                distro: osInfo.distro,
                release: osInfo.release,
                arch: osInfo.arch,
                hostname: osInfo.hostname,
                kernel: osInfo.kernel,
            },
            uptime: time.uptime, // seconds since boot
            load: {
                avgLoad: load, // system load average (Linux/macOS) or avg CPU (Windows)
                current1: load,
            },
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Get metrics error:', error);
        res.status(500).json({ error: 'Failed to get system metrics' });
    }
});

/**
 * GET /api/admin/metrics/quick
 * Returns only essential metrics for quick polling (lighter endpoint).
 */
router.get('/quick', authenticate, requireAdmin, async (req: Request, res: Response) => {
    try {
        const [cpu, mem, temp] = await Promise.all([
            si.currentLoad(),
            si.mem(),
            si.cpuTemperature(),
        ]);

        res.json({
            cpu: Math.round(cpu.currentLoad * 10) / 10,
            memory: Math.round((mem.used / mem.total) * 100),
            temperature: temp.main !== null ? Math.round(temp.main) : null,
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Get quick metrics error:', error);
        res.status(500).json({ error: 'Failed to get quick metrics' });
    }
});

export default router;

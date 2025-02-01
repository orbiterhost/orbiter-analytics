import { exec } from 'child_process';
import { promisify } from 'util';
const execPromise = promisify(exec);
class DiskSpaceError extends Error {
    constructor(message) {
        super(message);
        this.name = 'DiskSpaceError';
    }
}
async function checkDiskSpace() {
    try {
        const { stdout, stderr } = await execPromise('df -h');
        if (stderr) {
            throw new DiskSpaceError(`Error executing df command: ${stderr}`);
        }
        // Parse the output
        const lines = stdout.split('\n');
        const parsedData = lines
            .slice(1) // Skip header line
            .filter((line) => line.trim()) // Remove empty lines
            .map((line) => {
            const [filesystem, size, used, available, usePercentage, mountpoint] = line.split(/\s+/);
            return {
                filesystem,
                size,
                used,
                available,
                usePercentage: usePercentage ? usePercentage.replace('%', '') : '0',
                mountpoint
            };
        });
        return parsedData;
    }
    catch (error) {
        if (error instanceof DiskSpaceError) {
            throw error;
        }
        throw new DiskSpaceError(`Failed to check disk space: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
async function monitorDiskSpace(customThresholds) {
    try {
        const thresholds = {
            critical: customThresholds?.critical ?? 90,
            warning: customThresholds?.warning ?? 80
        };
        const diskSpace = await checkDiskSpace();
        // Filter out temporary filesystems
        const relevantPartitions = diskSpace.filter(partition => !partition.filesystem.startsWith('tmpfs') &&
            !partition.filesystem.startsWith('efivarfs'));
        // Check for alerts
        const alerts = [];
        relevantPartitions.forEach(partition => {
            const usage = parseInt(partition.usePercentage);
            if (usage >= thresholds.critical) {
                alerts.push({
                    partition,
                    level: 'critical',
                    message: `CRITICAL: ${partition.mountpoint} is at ${usage}% usage!`
                });
            }
            else if (usage >= thresholds.warning) {
                alerts.push({
                    partition,
                    level: 'warning',
                    message: `WARNING: ${partition.mountpoint} is at ${usage}% usage`
                });
            }
        });
        return {
            partitions: relevantPartitions,
            alerts
        };
    }
    catch (error) {
        throw new DiskSpaceError(`Error monitoring disk space: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
export { checkDiskSpace, monitorDiskSpace, DiskSpaceError };

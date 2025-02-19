import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

interface DiskPartition {
    filesystem: string;
    size: string;
    used: string;
    available: string;
    usePercentage: string;
    mountpoint: string;
}

interface MonitoringThresholds {
    critical: number;
    warning: number;
}

class DiskSpaceError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'DiskSpaceError';
    }
}

async function checkDiskSpace(): Promise<DiskPartition[]> {
    try {
        const { stdout, stderr } = await execPromise('df -h');
        
        if (stderr) {
            throw new DiskSpaceError(`Error executing df command: ${stderr}`);
        }

        // Parse the output
        const lines: string[] = stdout.split('\n');
        const parsedData: DiskPartition[] = lines
            .slice(1) // Skip header line
            .filter((line: string) => line.trim()) // Remove empty lines
            .map((line: string) => {
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
    } catch (error) {
        if (error instanceof DiskSpaceError) {
            throw error;
        }
        throw new DiskSpaceError(`Failed to check disk space: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

interface DiskSpaceAlert {
    partition: DiskPartition;
    level: 'critical' | 'warning';
    message: string;
}

async function monitorDiskSpace(
    customThresholds?: Partial<MonitoringThresholds>
): Promise<{
    partitions: DiskPartition[];
    alerts: DiskSpaceAlert[];
}> {
    try {
        const thresholds: MonitoringThresholds = {
            critical: customThresholds?.critical ?? 90,
            warning: customThresholds?.warning ?? 80
        };

        const diskSpace = await checkDiskSpace();
        
        // Filter out temporary filesystems
        const relevantPartitions = diskSpace.filter(partition => 
            !partition.filesystem.startsWith('tmpfs') && 
            !partition.filesystem.startsWith('efivarfs')
        );

        // Check for alerts
        const alerts: DiskSpaceAlert[] = [];
        
        relevantPartitions.forEach(partition => {
            const usage = parseInt(partition.usePercentage);
            
            if (usage >= thresholds.critical) {
                alerts.push({
                    partition,
                    level: 'critical',
                    message: `CRITICAL: ${partition.mountpoint} is at ${usage}% usage!`
                });
            } else if (usage >= thresholds.warning) {
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

    } catch (error) {
        throw new DiskSpaceError(`Error monitoring disk space: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

export { 
    checkDiskSpace, 
    monitorDiskSpace,
    DiskSpaceError,
    type DiskPartition,
    type MonitoringThresholds,
    type DiskSpaceAlert
};
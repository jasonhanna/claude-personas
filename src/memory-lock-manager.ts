import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from './utils/logger.js';

interface MemoryLock {
  lockId: string;
  memoryId: string;
  persona: string;
  projectHash?: string;
  lockedBy: string; // session ID or process ID
  lockedAt: Date;
  expiresAt: Date;
  version: number;
}

interface MemoryVersion {
  version: number;
  content: string;
  timestamp: Date;
  author: string;
  checksum: string;
}

interface LockAcquisitionResult {
  success: boolean;
  lockId?: string;
  currentVersion?: number;
  error?: string;
}

interface MemoryUpdateResult {
  success: boolean;
  newVersion?: number;
  conflicts?: string[];
  error?: string;
}

export class MemoryLockManager {
  private readonly locksDir: string;
  private readonly versionsDir: string;
  private readonly lockTimeout: number = 60000; // 1 minute default
  private cleanupInterval: NodeJS.Timeout | null = null;
  private logger = createLogger('MemoryLockManager');

  constructor(claudeAgentsHome?: string) {
    const baseDir = claudeAgentsHome || path.join(process.env.HOME || '~', '.claude-agents');
    this.locksDir = path.join(baseDir, 'locks');
    this.versionsDir = path.join(baseDir, 'versions');
  }

  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.locksDir, { recursive: true });
      await fs.mkdir(this.versionsDir, { recursive: true });
      
      // Start cleanup process for expired locks
      this.startCleanupProcess();
      
      this.logger.info('Initialized');
    } catch (error) {
      console.error('Failed to initialize memory lock manager:', error);
      throw error;
    }
  }

  /**
   * Acquire lock for memory update with optimistic locking
   */
  async acquireLock(
    memoryId: string,
    persona: string,
    lockedBy: string,
    projectHash?: string,
    expectedVersion?: number
  ): Promise<LockAcquisitionResult> {
    try {
      const lockId = this.generateLockId();
      const lockFile = path.join(this.locksDir, `${memoryId}.lock`);
      
      // Check if memory is already locked
      if (await this.fileExists(lockFile)) {
        const existingLock = await this.loadLock(lockFile);
        
        if (existingLock && !this.isLockExpired(existingLock)) {
          return {
            success: false,
            error: `Memory ${memoryId} is locked by ${existingLock.lockedBy} until ${existingLock.expiresAt.toISOString()}`
          };
        }
        
        // Lock is expired, we can proceed
        await this.removeLock(lockFile);
      }

      // Check version if optimistic locking is requested
      const currentVersion = await this.getCurrentVersion(memoryId, persona, projectHash);
      
      if (expectedVersion !== undefined && expectedVersion !== currentVersion) {
        return {
          success: false,
          currentVersion,
          error: `Version conflict: expected ${expectedVersion}, current is ${currentVersion}`
        };
      }

      // Create new lock
      const lock: MemoryLock = {
        lockId,
        memoryId,
        persona,
        projectHash,
        lockedBy,
        lockedAt: new Date(),
        expiresAt: new Date(Date.now() + this.lockTimeout),
        version: currentVersion
      };

      await fs.writeFile(lockFile, JSON.stringify(lock, null, 2));

      return {
        success: true,
        lockId,
        currentVersion
      };
    } catch (error) {
      console.error('Failed to acquire lock:', error);
      return {
        success: false,
        error: `Lock acquisition failed: ${error}`
      };
    }
  }

  /**
   * Release lock for memory
   */
  async releaseLock(lockId: string): Promise<boolean> {
    try {
      // Find lock file by scanning directory
      const lockFiles = await fs.readdir(this.locksDir);
      
      for (const file of lockFiles) {
        if (file.endsWith('.lock')) {
          const lockFile = path.join(this.locksDir, file);
          const lock = await this.loadLock(lockFile);
          
          if (lock && lock.lockId === lockId) {
            await this.removeLock(lockFile);
            this.logger.debug(`Released lock ${lockId}`);
            return true;
          }
        }
      }

      console.warn(`Lock ${lockId} not found`);
      return false;
    } catch (error) {
      console.error('Failed to release lock:', error);
      return false;
    }
  }

  /**
   * Update memory with version control
   */
  async updateMemoryWithVersioning(
    memoryId: string,
    persona: string,
    content: string,
    lockId: string,
    author: string,
    projectHash?: string
  ): Promise<MemoryUpdateResult> {
    try {
      // Verify lock ownership
      const lockFile = await this.findLockFile(memoryId);
      if (!lockFile) {
        return {
          success: false,
          error: 'Memory is not locked'
        };
      }

      const lock = await this.loadLock(lockFile);
      if (!lock || lock.lockId !== lockId) {
        return {
          success: false,
          error: 'Invalid lock ID'
        };
      }

      if (this.isLockExpired(lock)) {
        await this.removeLock(lockFile);
        return {
          success: false,
          error: 'Lock has expired'
        };
      }

      // Create new version
      const currentVersion = await this.getCurrentVersion(memoryId, persona, projectHash);
      const newVersion = currentVersion + 1;
      const checksum = this.calculateChecksum(content);

      const versionEntry: MemoryVersion = {
        version: newVersion,
        content,
        timestamp: new Date(),
        author,
        checksum
      };

      // Save version
      await this.saveVersion(memoryId, persona, versionEntry, projectHash);

      // Release lock
      await this.removeLock(lockFile);

      this.logger.debug(`Updated memory ${memoryId} to version ${newVersion}`);

      return {
        success: true,
        newVersion
      };
    } catch (error) {
      console.error('Failed to update memory with versioning:', error);
      return {
        success: false,
        error: `Update failed: ${error}`
      };
    }
  }

  /**
   * Get memory version history
   */
  async getVersionHistory(
    memoryId: string,
    persona: string,
    projectHash?: string,
    limit: number = 10
  ): Promise<MemoryVersion[]> {
    try {
      const versionFile = this.getVersionFilePath(memoryId, persona, projectHash);
      
      if (!await this.fileExists(versionFile)) {
        return [];
      }

      const content = await fs.readFile(versionFile, 'utf8');
      const versions: MemoryVersion[] = JSON.parse(content);

      return versions
        .sort((a, b) => b.version - a.version)
        .slice(0, limit);
    } catch (error) {
      console.error('Failed to get version history:', error);
      return [];
    }
  }

  /**
   * Get current version number for memory
   */
  async getCurrentVersion(
    memoryId: string,
    persona: string,
    projectHash?: string
  ): Promise<number> {
    try {
      const versionFile = this.getVersionFilePath(memoryId, persona, projectHash);
      
      if (!await this.fileExists(versionFile)) {
        return 0; // No versions exist yet
      }

      const content = await fs.readFile(versionFile, 'utf8');
      const versions: MemoryVersion[] = JSON.parse(content);

      return versions.length > 0 ? Math.max(...versions.map(v => v.version)) : 0;
    } catch (error) {
      console.error('Failed to get current version:', error);
      return 0;
    }
  }

  /**
   * Get memory content for specific version
   */
  async getMemoryVersion(
    memoryId: string,
    persona: string,
    version: number,
    projectHash?: string
  ): Promise<MemoryVersion | null> {
    try {
      const versions = await this.getVersionHistory(memoryId, persona, projectHash, 100);
      return versions.find(v => v.version === version) || null;
    } catch (error) {
      console.error('Failed to get memory version:', error);
      return null;
    }
  }

  /**
   * Detect conflicts between concurrent updates
   */
  async detectConflicts(
    memoryId: string,
    persona: string,
    baseVersion: number,
    projectHash?: string
  ): Promise<string[]> {
    try {
      const currentVersion = await this.getCurrentVersion(memoryId, persona, projectHash);
      const conflicts: string[] = [];

      if (currentVersion > baseVersion) {
        const versions = await this.getVersionHistory(memoryId, persona, projectHash);
        const conflictingVersions = versions.filter(v => v.version > baseVersion);

        for (const version of conflictingVersions) {
          const timestamp = typeof version.timestamp === 'string' 
            ? new Date(version.timestamp) 
            : version.timestamp;
          conflicts.push(
            `Version ${version.version} by ${version.author} at ${timestamp.toISOString()}`
          );
        }
      }

      return conflicts;
    } catch (error) {
      console.error('Failed to detect conflicts:', error);
      return [];
    }
  }

  /**
   * Clean up expired locks
   */
  private async cleanupExpiredLocks(): Promise<void> {
    try {
      if (!await this.fileExists(this.locksDir)) {
        return; // No locks directory, nothing to clean
      }
      
      const lockFiles = await fs.readdir(this.locksDir);
      let cleanedCount = 0;

      for (const file of lockFiles) {
        if (file.endsWith('.lock')) {
          const lockFile = path.join(this.locksDir, file);
          const lock = await this.loadLock(lockFile);

          if (lock && this.isLockExpired(lock)) {
            await this.removeLock(lockFile);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        this.logger.debug(`Cleaned up ${cleanedCount} expired locks`);
      }
    } catch (error) {
      console.error('Failed to cleanup expired locks:', error);
    }
  }

  private async saveVersion(
    memoryId: string,
    persona: string,
    version: MemoryVersion,
    projectHash?: string
  ): Promise<void> {
    const versionFile = this.getVersionFilePath(memoryId, persona, projectHash);
    
    // Ensure directory exists
    await fs.mkdir(path.dirname(versionFile), { recursive: true });

    let versions: MemoryVersion[] = [];
    
    if (await this.fileExists(versionFile)) {
      try {
        const content = await fs.readFile(versionFile, 'utf8');
        versions = JSON.parse(content);
      } catch (error) {
        console.warn('Failed to load existing versions, creating new file');
      }
    }

    versions.push(version);

    // Keep only last 50 versions
    versions = versions
      .sort((a, b) => b.version - a.version)
      .slice(0, 50);

    await fs.writeFile(versionFile, JSON.stringify(versions, null, 2));
  }

  private getVersionFilePath(memoryId: string, persona: string, projectHash?: string): string {
    if (projectHash) {
      return path.join(this.versionsDir, 'projects', projectHash, `${memoryId}.json`);
    } else {
      return path.join(this.versionsDir, 'personas', persona, `${memoryId}.json`);
    }
  }

  private async findLockFile(memoryId: string): Promise<string | null> {
    try {
      const lockFile = path.join(this.locksDir, `${memoryId}.lock`);
      if (await this.fileExists(lockFile)) {
        return lockFile;
      }
      return null;
    } catch {
      return null;
    }
  }

  private async loadLock(lockFile: string): Promise<MemoryLock | null> {
    try {
      const content = await fs.readFile(lockFile, 'utf8');
      const lock = JSON.parse(content);
      
      // Parse dates
      lock.lockedAt = new Date(lock.lockedAt);
      lock.expiresAt = new Date(lock.expiresAt);
      
      return lock;
    } catch (error) {
      console.warn('Failed to load lock file:', error);
      return null;
    }
  }

  private async removeLock(lockFile: string): Promise<void> {
    try {
      await fs.unlink(lockFile);
    } catch (error) {
      console.warn('Failed to remove lock file:', error);
    }
  }

  private isLockExpired(lock: MemoryLock): boolean {
    return new Date() > lock.expiresAt;
  }

  private generateLockId(): string {
    return `lock_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private calculateChecksum(content: string): string {
    // Simple checksum calculation for conflict detection
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private startCleanupProcess(): void {
    // Run cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredLocks().catch(error => {
        console.error('Lock cleanup error:', error);
      });
    }, 5 * 60 * 1000);
  }

  async shutdown(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    // Run final cleanup
    await this.cleanupExpiredLocks();
    this.logger.info('Shutdown completed');
  }
}

export default MemoryLockManager;
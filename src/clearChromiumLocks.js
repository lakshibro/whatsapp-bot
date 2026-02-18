/**
 * Aggressively clear Chromium profile lock files.
 * Run BEFORE starting the WhatsApp client to avoid "profile in use" after droplet/container restarts.
 * Recursively scans .wwebjs_auth and .wwebjs_cache - Chromium can leave locks in nested dirs.
 * Also clears lock files in Default profile and other Chromium directories.
 */
import { existsSync, unlinkSync, readdirSync, lstatSync } from 'fs';
import { join, basename } from 'path';

const CHROMIUM_LOCK_FILES = [
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
    'lockfile',
    '.lock',
    'LOCK',
    'LOCKFILE',
];

// Additional Chromium lock patterns
const CHROMIUM_LOCK_PATTERNS = [
    /^lock/i,
    /^singleton/i,
    /\.lock$/i,
];

function getAllDirs(dir, acc = []) {
    if (!existsSync(dir)) return acc;
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        acc.push(dir);
        for (const e of entries) {
            if (e.isDirectory() && e.name !== '.' && e.name !== '..') {
                getAllDirs(join(dir, e.name), acc);
            }
        }
    } catch (_) { }
    return acc;
}

function getAllFiles(dir, acc = []) {
    if (!existsSync(dir)) return acc;
    try {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
            const fullPath = join(dir, e.name);
            // Check for files AND symbolic links (Chromium locks are often symlinks)
            if (e.isFile() || e.isSymbolicLink()) {
                acc.push(fullPath);
            } else if (e.isDirectory() && e.name !== '.' && e.name !== '..') {
                getAllFiles(fullPath, acc);
            }
        }
    } catch (_) { }
    return acc;
}

function clearLocksInDir(dir) {
    let cleared = 0;

    // Clear known lock files
    for (const lockName of CHROMIUM_LOCK_FILES) {
        const lockPath = join(dir, lockName);
        try {
            // Use lstatSync instead of existsSync to detect broken symlinks
            // or just try to unlink directly
            try {
                unlinkSync(lockPath);
                cleared++;
            } catch (e) {
                // Ignore if file doesn't exist
                if (e.code !== 'ENOENT') throw e;
            }
        } catch (_) { }
    }

    // Also scan all files in directory for lock patterns
    try {
        const files = readdirSync(dir, { withFileTypes: true });
        for (const file of files) {
            // Check for files AND symbolic links
            if (file.isFile() || file.isSymbolicLink()) {
                const fileName = file.name;
                // Check if file matches lock patterns
                const isLockFile = CHROMIUM_LOCK_FILES.some(lock =>
                    fileName.toLowerCase() === lock.toLowerCase()
                ) || CHROMIUM_LOCK_PATTERNS.some(pattern => pattern.test(fileName));

                if (isLockFile) {
                    try {
                        const lockPath = join(dir, fileName);
                        unlinkSync(lockPath);
                        cleared++;
                    } catch (_) { }
                }
            }
        }
    } catch (_) { }

    return cleared;
}

export function clearChromiumLocks(authDir, cacheDir = null) {
    const baseDir = authDir;
    const cacheBase = cacheDir || join(authDir, '..', '.wwebjs_cache');
    const dirsToScan = [...getAllDirs(baseDir)];
    if (existsSync(cacheBase)) {
        dirsToScan.push(...getAllDirs(cacheBase));
    }

    let totalCleared = 0;

    // Clear locks in all directories
    for (const d of dirsToScan) {
        totalCleared += clearLocksInDir(d);
    }

    // Also check for lock files in nested Default profile
    const defaultProfile = join(baseDir, 'Default');
    if (existsSync(defaultProfile)) {
        const defaultFiles = getAllFiles(defaultProfile);
        for (const filePath of defaultFiles) {
            const fileName = basename(filePath);
            const isLockFile = CHROMIUM_LOCK_FILES.some(lock =>
                fileName.toLowerCase() === lock.toLowerCase()
            ) || CHROMIUM_LOCK_PATTERNS.some(pattern => pattern.test(fileName));

            if (isLockFile) {
                try {
                    unlinkSync(filePath);
                    totalCleared++;
                } catch (_) { }
            }
        }
    }

    return totalCleared;
}

// Clear locks on shutdown
export function clearChromiumLocksOnShutdown(authDir) {
    console.log('🔓 Clearing Chromium locks on shutdown...');
    const cleared = clearChromiumLocks(authDir);
    if (cleared > 0) {
        console.log(`🔓 Cleared ${cleared} lock file(s) on shutdown`);
    }
    return cleared;
}

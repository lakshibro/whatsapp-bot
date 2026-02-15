/**
 * Aggressively clear Chromium profile lock files.
 * Run BEFORE starting the WhatsApp client to avoid "profile in use" after droplet/container restarts.
 * Recursively scans .wwebjs_auth and .wwebjs_cache - Chromium can leave locks in nested dirs.
 */
import { existsSync, unlinkSync, readdirSync } from 'fs';
import { join } from 'path';

const CHROMIUM_LOCK_FILES = [
    'SingletonLock',
    'SingletonSocket',
    'SingletonCookie',
    'lockfile',
    '.lock',
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
    } catch (_) {}
    return acc;
}

function clearLocksInDir(dir) {
    let cleared = 0;
    for (const lockName of CHROMIUM_LOCK_FILES) {
        const lockPath = join(dir, lockName);
        try {
            if (existsSync(lockPath)) {
                unlinkSync(lockPath);
                cleared++;
            }
        } catch (_) {}
    }
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
    for (const d of dirsToScan) {
        totalCleared += clearLocksInDir(d);
    }
    return totalCleared;
}

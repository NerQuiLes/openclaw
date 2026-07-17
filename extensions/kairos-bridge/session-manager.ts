/**
 * Session Manager for OpenClaw
 * Handles session timeouts, interaction limits, turn-based system, and lock cleanup
 */

import * as fs from "fs";
import * as path from "path";

// Simple logger for session manager
const log = {
  info: (msg: string, ...args: unknown[]) => console.log(`[session-manager] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[session-manager] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[session-manager] ${msg}`, ...args),
};

// Configuration
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const MAX_INTERACTIONS_PER_SESSION = 50;
const LOCK_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LOCK_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes (locks older than this are stale)

interface SessionState {
  userId: string;
  channelId: string;
  threadTs?: string;
  startedAt: number;
  lastActivityAt: number;
  interactionCount: number;
  isActive: boolean;
}

interface SessionManagerOptions {
  sessionsDir: string;
  timeoutMs?: number;
  maxInteractions?: number;
}

export class SessionManager {
  private sessionsDir: string;
  private timeoutMs: number;
  private maxInteractions: number;
  private activeSessions: Map<string, SessionState> = new Map();
  private cleanupInterval?: NodeJS.Timeout;

  constructor(options: SessionManagerOptions) {
    this.sessionsDir = options.sessionsDir;
    this.timeoutMs = options.timeoutMs ?? SESSION_TIMEOUT_MS;
    this.maxInteractions = options.maxInteractions ?? MAX_INTERACTIONS_PER_SESSION;

    // Ensure sessions directory exists
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }

    // Start cleanup interval
    this.startCleanupInterval();

    log.info(
      `SessionManager initialized: timeout=${this.timeoutMs}ms, maxInteractions=${this.maxInteractions}`,
    );
  }

  /**
   * Start or resume a session for a user
   */
  startSession(userId: string, channelId: string, threadTs?: string): SessionState {
    const sessionKey = this.getSessionKey(userId, channelId, threadTs);
    const now = Date.now();

    // Check if there's an existing active session
    const existingSession = this.activeSessions.get(sessionKey);
    if (existingSession && existingSession.isActive) {
      // Check if session has timed out
      if (now - existingSession.lastActivityAt > this.timeoutMs) {
        log.info(`Session timed out for user ${userId}, starting new session`);
        this.closeSession(sessionKey);
      } else {
        // Resume existing session
        existingSession.lastActivityAt = now;
        existingSession.interactionCount++;

        // Check if max interactions reached
        if (existingSession.interactionCount >= this.maxInteractions) {
          log.info(`Max interactions (${this.maxInteractions}) reached for user ${userId}`);
          this.closeSession(sessionKey);
          // Start a new session
          return this.createNewSession(userId, channelId, threadTs);
        }

        return existingSession;
      }
    }

    // Create new session
    return this.createNewSession(userId, channelId, threadTs);
  }

  /**
   * Check if a user can start a new interaction (turn-based system)
   */
  canStartInteraction(
    userId: string,
    channelId: string,
    threadTs?: string,
  ): { allowed: boolean; reason?: string } {
    const sessionKey = this.getSessionKey(userId, channelId, threadTs);
    const session = this.activeSessions.get(sessionKey);

    if (!session || !session.isActive) {
      return { allowed: true };
    }

    const now = Date.now();

    // Check timeout
    if (now - session.lastActivityAt > this.timeoutMs) {
      return { allowed: true, reason: "Session timed out" };
    }

    // Check max interactions
    if (session.interactionCount >= this.maxInteractions) {
      return {
        allowed: false,
        reason: `Maximum interactions (${this.maxInteractions}) reached. Session closed.`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get current session state
   */
  getSession(userId: string, channelId: string, threadTs?: string): SessionState | undefined {
    const sessionKey = this.getSessionKey(userId, channelId, threadTs);
    return this.activeSessions.get(sessionKey);
  }

  /**
   * Close a specific session
   */
  closeSession(sessionKey: string): void {
    const session = this.activeSessions.get(sessionKey);
    if (session) {
      session.isActive = false;
      this.activeSessions.delete(sessionKey);
      log.info(`Session closed: ${sessionKey}`);
    }
  }

  /**
   * Close all sessions for a user
   */
  closeUserSessions(userId: string): void {
    for (const [key, session] of this.activeSessions.entries()) {
      if (session.userId === userId) {
        session.isActive = false;
        this.activeSessions.delete(key);
        log.info(`Session closed for user ${userId}: ${key}`);
      }
    }
  }

  /**
   * Get stats about active sessions
   */
  getStats(): { activeSessions: number; totalInteractions: number } {
    let totalInteractions = 0;
    for (const session of this.activeSessions.values()) {
      totalInteractions += session.interactionCount;
    }
    return {
      activeSessions: this.activeSessions.size,
      totalInteractions,
    };
  }

  /**
   * Clean up stale locks and old session files
   */
  cleanup(): void {
    const now = Date.now();
    let cleanedLocks = 0;
    let cleanedSessions = 0;

    // Clean up stale sessions from memory
    for (const [key, session] of this.activeSessions.entries()) {
      if (now - session.lastActivityAt > this.timeoutMs) {
        session.isActive = false;
        this.activeSessions.delete(key);
        cleanedSessions++;
      }
    }

    // Clean up lock files
    try {
      const files = fs.readdirSync(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith(".lock")) {
          const lockPath = path.join(this.sessionsDir, file);
          try {
            const stats = fs.statSync(lockPath);
            if (now - stats.mtime.getTime() > LOCK_MAX_AGE_MS) {
              fs.unlinkSync(lockPath);
              cleanedLocks++;
            }
          } catch {
            // Ignore errors for individual files
          }
        }
      }
    } catch (e) {
      log.warn("Error during lock cleanup:", e);
    }

    if (cleanedLocks > 0 || cleanedSessions > 0) {
      log.info(`Cleanup complete: ${cleanedLocks} locks, ${cleanedSessions} sessions removed`);
    }
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  private createNewSession(userId: string, channelId: string, threadTs?: string): SessionState {
    const sessionKey = this.getSessionKey(userId, channelId, threadTs);
    const now = Date.now();

    const session: SessionState = {
      userId,
      channelId,
      threadTs,
      startedAt: now,
      lastActivityAt: now,
      interactionCount: 1,
      isActive: true,
    };

    this.activeSessions.set(sessionKey, session);
    log.info(
      `New session started for user ${userId} in ${channelId}${threadTs ? ` (thread: ${threadTs})` : ""}`,
    );

    return session;
  }

  private getSessionKey(userId: string, channelId: string, threadTs?: string): string {
    return threadTs ? `${userId}:${channelId}:${threadTs}` : `${userId}:${channelId}`;
  }

  private startCleanupInterval(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, LOCK_CLEANUP_INTERVAL_MS);
  }
}

// Singleton instance
let globalSessionManager: SessionManager | null = null;

export function getSessionManager(sessionsDir: string): SessionManager {
  if (!globalSessionManager) {
    globalSessionManager = new SessionManager({ sessionsDir });
  }
  return globalSessionManager;
}

export function resetSessionManager(): void {
  if (globalSessionManager) {
    globalSessionManager.stop();
    globalSessionManager = null;
  }
}

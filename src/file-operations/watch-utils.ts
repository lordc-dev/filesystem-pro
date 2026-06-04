// File watching utilities using chokidar
import chokidar, { type FSWatcher, type ChokidarOptions } from 'chokidar';
import { EventEmitter } from 'events';
import picomatch from 'picomatch';
import { WatcherError } from "../errors/index.js";
import { WATCH_POLL_INTERVAL_MS } from "../constants.js";
import type { Stats } from 'fs';



export interface WatchOptions {
  path: string;
  recursive?: boolean;
  excludePatterns?: string[];
  events?: ('add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir')[];
}

export interface FileWatchEvent {
  type: 'add' | 'change' | 'unlink' | 'addDir' | 'unlinkDir' | 'error';
  path: string;
  timestamp: Date;
  stats?: Stats;
}

export class FileWatcher extends EventEmitter {
  private watcher: FSWatcher | null = null;
  private options: WatchOptions;

  constructor(options: WatchOptions) {
    super();
    this.options = options;
  }

  start(): void {
    if (this.watcher) {
      throw new WatcherError(this.options.path, "already exists");
    }

    const chokidarOptions: ChokidarOptions = {
      // Chokidar v4 requires ignored to be a function or RegExp, not an array
      ignored: this.options.excludePatterns ? 
        (testPath: string) => {
          return this.options.excludePatterns!.some(pattern => {
            const isMatch = picomatch(pattern, { dot: true });
            return isMatch(testPath);
          });
        } : undefined,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: WATCH_POLL_INTERVAL_MS
      },
      depth: this.options.recursive === false ? 0 : undefined
    };

    this.watcher = chokidar.watch(this.options.path, chokidarOptions);

    // Set up event handlers
    const events = this.options.events ?? ['add', 'change', 'unlink', 'addDir', 'unlinkDir'];
    
    events.forEach(eventType => {
      this.watcher!.on(eventType, (filePath: string, stats?: Stats) => {
        const event: FileWatchEvent = {
          type: eventType as FileWatchEvent['type'],
          path: filePath,
          timestamp: new Date(),
          stats
        };
        this.emit('change', event);
      });
    });

    this.watcher.on('error', (error: unknown) => {
      const event: FileWatchEvent = {
        type: 'error',
        path: '',
        timestamp: new Date()
      };
      this.emit('error', error, event);
    });

    this.watcher.on('ready', () => {
      this.emit('ready');
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.watcher) {
        resolve();
        return;
      }

      this.watcher.close().then(() => {
        this.watcher = null;
        this.removeAllListeners();
        resolve();
      });
    });
  }
}

// Singleton to manage active watchers
class WatcherManager {
  private watchers: Map<string, FileWatcher> = new Map();
  private readonly maxWatchers = 50;

  createWatcher(id: string, options: WatchOptions): FileWatcher {
    if (this.watchers.size >= this.maxWatchers) {
      throw new WatcherError(id, `Maximum watcher limit reached (${this.maxWatchers}). Stop existing watchers before creating new ones.`);
    }
    if (this.watchers.has(id)) {
      throw new WatcherError(id, "already exists");
    }

    const watcher = new FileWatcher(options);
    this.watchers.set(id, watcher);
    return watcher;
  }

  async removeWatcher(id: string): Promise<boolean> {
    const watcher = this.watchers.get(id);
    if (!watcher) {
      return false;
    }

    await watcher.stop();
    this.watchers.delete(id);
    return true;
  }

  async removeAllWatchers(): Promise<void> {
    const promises = Array.from(this.watchers.values()).map(w => w.stop());
    await Promise.all(promises);
    this.watchers.clear();
  }
}

export const watcherManager = new WatcherManager();

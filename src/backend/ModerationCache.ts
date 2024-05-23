import { ModerationProvider, ModerationRejectedError, ModerationResult } from "./ModerationProvider";

const MODERATION_CACHE_EXPIRE_MILLIS = process.env.VW_MODERATION_CACHE_EXPIRE_SECONDS
    ? parseInt(process.env.VW_MODERATION_CACHE_EXPIRE_SECONDS) * 1000
    : 60 * 60 * 1000;
const MODERATION_CACHE_EXPIRE_ENTRIES = process.env.VW_MODERATION_CACHE_EXPIRE_ENTRIES
    ? parseInt(process.env.VW_MODERATION_CACHE_EXPIRE_ENTRIES)
    : 1000;
const MODERATION_CACHE_CLEAN_MILLIS = 60 * 1000;
const MODERATION_CACHE_CLEAN_ENTRIES = 1.1 * MODERATION_CACHE_EXPIRE_ENTRIES;

interface CachedModeration {
    created: number;
    flagged: boolean;
}

/**
 * Caches moderation results of the wrapped provider.
 */
export class ModerationCache implements ModerationProvider {
    private readonly cache = new Map<string, CachedModeration>();

    private moderationCacheCleaned = 0;

    private readonly moderationProvider;

    /**
     * Constructs a new instance.
     *
     * @param moderationProvider Provider doing actual moderation
     */
    constructor(moderationProvider: ModerationProvider) {
        this.moderationProvider = moderationProvider;
    }

    get textChunkerParams() {
        return this.moderationProvider.textChunkerParams;
    }

    checkModeration(...content: string[]): Promise<void> {
        return this.moderation(...content).then((mrs) => {
            for (const mr of mrs) {
                if (mr.flagged) {
                    throw new ModerationRejectedError(mr.content);
                }
            }
        });
    }

    moderation(...content: string[]): Promise<ModerationResult[]> {
        this.cleanModerationCache();
        const cachedResults = new Map(content.map((c) => [c, this.cache.get(c)?.flagged]));
        for (const r of cachedResults) {
            if (r[1]) {
                return Promise.reject(new ModerationRejectedError(r[0]));
            }
        }
        const contentToCheck = [
            ...new Set([...cachedResults.entries()].filter((r) => r[1] === undefined).map((r) => r[0])),
        ];
        return this.moderationProvider.moderation(...contentToCheck).then((results) => {
            results.forEach((r) => this.cache.set(r.content, { created: Date.now(), flagged: r.flagged }));
            const resultsMap = new Map(results.map((r) => [r.content, r.flagged]));
            return content
                .map((c) => {
                    const flagged = cachedResults.get(c) ?? resultsMap.get(c);
                    return {
                        content: c,
                        flagged: flagged,
                    };
                })
                .filter((mr): mr is ModerationResult => mr.flagged !== undefined);
        });
    }

    private cleanModerationCache() {
        const now = Date.now();
        const moderationCacheSize = this.cache.size;
        let entryExpireLimit = Number.MAX_VALUE;
        if (moderationCacheSize > MODERATION_CACHE_CLEAN_ENTRIES) {
            const createdSorted = Array.from(this.cache.values())
                .map((e) => e.created)
                .sort();
            entryExpireLimit = createdSorted[moderationCacheSize - MODERATION_CACHE_EXPIRE_ENTRIES - 1];
        }
        if (entryExpireLimit < Number.MAX_VALUE || now - this.moderationCacheCleaned > MODERATION_CACHE_CLEAN_MILLIS) {
            const timeExpireLimit = now - MODERATION_CACHE_EXPIRE_MILLIS;
            const expireLimit = Math.min(entryExpireLimit, timeExpireLimit);
            for (const [msg, entry] of this.cache.entries()) {
                if (entry.created <= expireLimit) {
                    this.cache.delete(msg);
                }
            }
            this.moderationCacheCleaned = now;
        }
    }
}

import { OpenAI } from "openai";

/** Signals that content was rejected by moderation */
export class ModerationRejected extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(`Moderation rejected message: ${message}`, options);
        this.name = "ModerationRejected";
    }
}

interface CachedModeration {
    created: number;
    flagged: boolean;
}

type ModerationCache = Map<string, CachedModeration>;

const moderationCache: ModerationCache = new Map();
let moderationCacheCleaned = 0;

const MODERATION_CACHE_EXPIRE_MILLIS = process.env.VW_MODERATION_CACHE_EXPIRE_SECONDS
    ? parseInt(process.env.VW_MODERATION_CACHE_EXPIRE_SECONDS) * 1000
    : 60 * 60 * 1000;
const MODERATION_CACHE_EXPIRE_ENTRIES = process.env.VW_MODERATION_CACHE_EXPIRE_ENTRIES
    ? parseInt(process.env.VW_MODERATION_CACHE_EXPIRE_ENTRIES)
    : 1000;
const MODERATION_CACHE_CLEAN_MILLIS = 60 * 1000;
const MODERATION_CACHE_CLEAN_ENTRIES = 1.1 * MODERATION_CACHE_EXPIRE_ENTRIES;

export function checkModerations(msgs: string[], openai: OpenAI): Promise<void> {
    return Promise.all(msgs.map((m) => checkModeration(m, openai))).then(() => undefined);
}

export function checkModeration(msg: string, openai: OpenAI): Promise<void> {
    cleanModerationCache();
    const cached = moderationCache.get(msg);
    if (cached) {
        return new Promise((resolve, reject) => {
            if (!cached.flagged) {
                resolve();
            } else {
                reject(new ModerationRejected(msg));
            }
        });
    } else {
        return openai.moderations.create({ input: msg }).then((response) => {
            const flagged = response.results
                .map((r) => r.flagged)
                .reduce((accumulator, currentValue) => accumulator || currentValue, false);
            moderationCache.set(msg, { created: Date.now(), flagged: flagged });
            if (flagged) {
                throw new ModerationRejected(msg);
            }
        });
    }
}

function cleanModerationCache() {
    const now = Date.now();
    const moderationCacheSize = moderationCache.size;
    let entryExpireLimit = Number.MAX_VALUE;
    if (moderationCacheSize > MODERATION_CACHE_CLEAN_ENTRIES) {
        const createdSorted = Array.from(moderationCache.values())
            .map((e) => e.created)
            .sort();
        entryExpireLimit = createdSorted[moderationCacheSize - MODERATION_CACHE_EXPIRE_ENTRIES - 1];
    }
    if (entryExpireLimit < Number.MAX_VALUE || now - moderationCacheCleaned > MODERATION_CACHE_CLEAN_MILLIS) {
        const timeExpireLimit = now - MODERATION_CACHE_EXPIRE_MILLIS;
        const expireLimit = Math.min(entryExpireLimit, timeExpireLimit);
        for (const [msg, entry] of moderationCache.entries()) {
            if (entry.created <= expireLimit) {
                moderationCache.delete(msg);
            }
        }
        moderationCacheCleaned = now;
    }
}

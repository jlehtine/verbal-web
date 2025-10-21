import { ComputableMap } from "../shared/ComputableMap";
import { contextFrom } from "./RequestContext";
import { logInfo } from "./log";
import { NextFunction, Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

/** A random error thrown for testing purposes only */
export class RandomError extends Error {
    constructor(errid: string) {
        super(errid);
        this.name = "RandomError";
    }
}

/** Default error rate in number of errors per second */
const DEFAULT_RATE = 1 / 300;

/** Default random delay in seconds */
const DEFAULT_DELAY = 3;

/** Default fixed error probability */
const DEFAULT_PROPABILITY = 0.1;

/** A Poisson distribution of errors */
class PoissonErrorDistribution {
    readonly errid;
    readonly rate;
    private lastErrorTime;
    private nextErrorTime;
    private pausedAt: number | undefined;

    constructor(errid: string, rate: number) {
        this.errid = errid;
        this.rate = rate;
        this.lastErrorTime = Date.now();
        this.nextErrorTime = this.calculateNextErrorTime();
    }

    private calculateNextErrorTime(): number {
        const rnd = Math.random();

        // Interval time in seconds
        const intervalTime = -Math.log(1 - rnd) / this.rate;

        // Next time in millis
        return Math.max(this.lastErrorTime + intervalTime * 1000, Date.now());
    }

    shouldTriggerError(): boolean {
        if (this.pausedAt === undefined) {
            const now = Date.now();
            if (now >= this.nextErrorTime) {
                this.lastErrorTime = this.nextErrorTime;
                this.nextErrorTime = this.calculateNextErrorTime();
                return true;
            }
        }
        return false;
    }

    throwRandomError(): void {
        if (this.shouldTriggerError()) {
            throw new RandomError(this.errid);
        }
    }

    adjustDelay(delay: number): number {
        const toNextError = this.nextErrorTime - Date.now();
        return Math.max(Math.min(delay, toNextError), 0);
    }

    pause(now: number): void {
        this.pausedAt ??= now;
    }

    continue(now: number): void {
        if (this.pausedAt !== undefined) {
            this.nextErrorTime += now - this.pausedAt;
            this.pausedAt = undefined;
        }
    }
}

/** Whether random errors are enabled */
let enabled = false;

/** Initialized error generators */
const errorGenerators = new ComputableMap<string, PoissonErrorDistribution>();

/** Set whether random errors are enabled or not */
export function setRandomErrorsEnabled(randomErrorsEnabled: boolean): void {
    enabled = randomErrorsEnabled;
}

/** Pause random errors */
export function pauseRandomErrors(): void {
    if (!enabled) return;
    const now = Date.now();
    for (const eg of errorGenerators.values()) {
        eg.pause(now);
    }
}

/** Continue random errors */
export function continueRandomErrors(): void {
    if (!enabled) return;
    const now = Date.now();
    for (const eg of errorGenerators.values()) {
        eg.continue(now);
    }
}

function getErrorGenerator(errid: string, rate: number): PoissonErrorDistribution {
    return errorGenerators.computeIfAbsent(errid, (errid) => new PoissonErrorDistribution(errid, rate));
}

/** Check if a random error should be generated */
export function isrnderr(errid: string, rate = DEFAULT_RATE): boolean {
    return enabled && getErrorGenerator(errid, rate).shouldTriggerError();
}

/** Throws an error randomly */
export function throwrnderr(errid: string, rate = DEFAULT_RATE): void {
    if (isrnderr(errid, rate)) {
        throw new RandomError(errid);
    }
}

/** Introduce random errors to immediate results */
export function withrnderr<T>(errid: string, v: T, rate = DEFAULT_RATE): T {
    throwrnderr(errid, rate);
    return v;
}

/** Introduce random errors and random delays on asynchronous results */
export function asyncrnderr<T, R>(
    errid: string,
    f: (v: T) => R,
    delay = DEFAULT_DELAY,
    rate = DEFAULT_RATE,
): (v: T) => R | Promise<R> {
    return enabled
        ? (v: T) =>
              new Promise<R>((resolve, reject) => {
                  setTimeout(
                      () => {
                          if (isrnderr(errid, rate)) {
                              reject(new RandomError(errid));
                          } else {
                              resolve(f(v));
                          }
                      },
                      getErrorGenerator(errid, rate).adjustDelay(delay * 1000 * Math.random()),
                  );
              })
        : f;
}

export function httprnderr(
    req: Request,
    res: Response,
    next: NextFunction,
    delay = DEFAULT_DELAY,
    p = DEFAULT_PROPABILITY,
): void {
    if (enabled) {
        setTimeout(
            () => {
                if (Math.random() < p) {
                    const ctx = contextFrom(req);
                    logInfo("%s %s => Random 503 Service unavailable", ctx, req.method, req.url);
                    res.sendStatus(StatusCodes.SERVICE_UNAVAILABLE);
                } else {
                    next();
                }
            },
            delay * 1000 * Math.random(),
        );
    } else {
        next();
    }
}

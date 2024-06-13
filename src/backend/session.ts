import { ChatServerConfig } from "./ChatServer";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

const COOKIE_NAME = "VWSESSIONKEY";
const COOKIE_VALUE_SEPARATOR = "_";
const AUTH_PATH = "/vw/auth";
const COOKIE_PATH = "/vw";
const BCRYPT_SALT_ROUNDS = 12;

/** Session record */
export interface Session {
    /** Identifier */
    id: string;

    /** Secure hash of session key */
    keyHash: string;

    /** User email address, if authenticated */
    userEmail?: string;

    /** Validity time */
    validUntil: Date;
}

const sessions = new Map<string, Session>();

function generateSessionKey(): string {
    return randomBytes(32).toString("hex");
}

async function hashSessionKey(sessionKey: string): Promise<string> {
    return await bcrypt.hash(sessionKey, BCRYPT_SALT_ROUNDS);
}

export async function startSession(
    config: ChatServerConfig,
    req: Request,
    res: Response,
    userEmail: string,
): Promise<Session> {
    // Generate authenticated session record
    const sessionKey = generateSessionKey();
    const sessionKeyHash = await hashSessionKey(sessionKey);
    let sessionId;
    do {
        sessionId = uuidv4();
    } while (sessions.has(sessionId));
    const session: Session = {
        id: sessionId,
        keyHash: sessionKeyHash,
        userEmail: userEmail,
        validUntil: new Date(Date.now() + config.sessionExpiration),
    };
    sessions.set(sessionId, session);

    // Set session cookie
    const cookieValue = sessionId + COOKIE_VALUE_SEPARATOR + sessionKey;
    setSessionCookie(req, res, cookieValue, session.validUntil);

    return session;
}

export async function checkSession(req: Request): Promise<Session | undefined> {
    let session;

    // Find the session cookie, if any
    const cookieValue: unknown = req.cookies[COOKIE_NAME];
    if (typeof cookieValue === "string") {
        // Parse the session cookie
        const idx = cookieValue.indexOf(COOKIE_VALUE_SEPARATOR);
        if (idx >= 0) {
            const sessionId = cookieValue.substring(0, idx);
            const sessionKey = cookieValue.substring(idx + COOKIE_VALUE_SEPARATOR.length);

            // Find session
            const s = findSessionById(sessionId);
            if (s) {
                // Check session key
                if (await bcrypt.compare(sessionKey, s.keyHash)) {
                    session = s;
                }
            }
        }
    }

    return Promise.resolve(session);
}

export async function endSession(req: Request, res: Response): Promise<void> {
    const session = await checkSession(req);
    if (session) {
        sessions.delete(session.id);
        setSessionCookie(req, res, "", new Date(0));
    }
}

function setSessionCookie(req: Request, res: Response, value: string, expires: Date) {
    const cookiePath = req.path.substring(0, req.path.lastIndexOf(AUTH_PATH)) + COOKIE_PATH;
    res.cookie(COOKIE_NAME, value, {
        httpOnly: true,
        secure: req.secure,
        path: cookiePath,
        expires: expires,
    });
}

function findSessionById(sessionId: string): Session | undefined {
    const session = sessions.get(sessionId);
    const now = new Date();
    if (session && session.validUntil <= now) {
        sessions.delete(session.id);
        return undefined;
    }
    return session;
}

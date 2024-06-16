import { ChatServerConfig } from "./ChatServer";
import bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

const COOKIE_NAME = "VWSESSIONKEY";
const COOKIE_VALUE_SEPARATOR = "_";
const COOKIE_PATH = "/vw/";
const BCRYPT_SALT_ROUNDS = 12;

/** Session record */
export interface Session {
    /** Identifier */
    id: string;

    /** Secure hash of session key, if authenticated */
    keyHash?: string;

    /** User email address, if authenticated */
    userEmail?: string;

    /** Validity time, if authenticated */
    validUntil?: Date;
}

/** Unauthenticated session record */
type UnauthenticatedSession = Omit<Session, "keyHash" | "userEmail" | "validUntil">;

/** Authenticated session record */
type AuthenticatedSession = Required<Session>;

export function isAuthenticatedSession(session: Session): session is AuthenticatedSession {
    return session.keyHash !== undefined && session.userEmail !== undefined && session.validUntil instanceof Date;
}

/** Authenticated sessions */
const sessions = new Map<string, AuthenticatedSession>();

function generateSessionKey(): string {
    return randomBytes(32).toString("hex");
}

async function hashSessionKey(sessionKey: string): Promise<string> {
    return await bcrypt.hash(sessionKey, BCRYPT_SALT_ROUNDS);
}

export async function startSession(
    req: Request,
    res: Response,
    userEmail: string,
    config: ChatServerConfig,
): Promise<AuthenticatedSession>;
export async function startSession(
    req: Request,
    res?: Response,
    userEmail?: undefined,
    config?: ChatServerConfig,
): Promise<UnauthenticatedSession>;

/**
 * Start a new session, either an authenticated one or an unauthenticated one.
 *
 * @param req request
 * @param res response, to set a session cookie
 * @param userEmail user email, if authenticated
 * @param config config, if authenticated
 * @returns
 */
export async function startSession(
    req: Request,
    res?: Response,
    userEmail?: string,
    config?: ChatServerConfig,
): Promise<Session> {
    purgeExpiredSessions();

    // Generate a session key for authenticated sessions
    let sessionKey;
    let sessionKeyHash;
    if (userEmail) {
        sessionKey = generateSessionKey();
        sessionKeyHash = await hashSessionKey(sessionKey);
    }

    // Generate a session id
    let sessionId;
    do {
        sessionId = uuidv4();
    } while (sessions.has(sessionId));

    // Initialize a session and store authenticated sessions
    const session = {
        id: sessionId,
        keyHash: sessionKeyHash,
        userEmail: userEmail,
        validUntil: userEmail && config ? new Date(Date.now() + config.sessionExpiration) : undefined,
    };
    if (isAuthenticatedSession(session)) {
        sessions.set(sessionId, session);
    }

    // Set session cookie
    const cookieValue = sessionKey ? sessionId + COOKIE_VALUE_SEPARATOR + sessionKey : sessionId;
    if (res) {
        setSessionCookie(req, res, cookieValue, session.validUntil);
    }

    return session;
}

/**
 * Returns the existing session associated with the request, if any.
 *
 * @param req request
 * @returns existing session assicated with the request, if any
 */
export async function getSession(req: Request): Promise<Session | undefined> {
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
        } else if (isUUIDv4(cookieValue)) {
            session = { id: cookieValue };
        }
    }

    return session;
}

/**
 * Checks for a valid session and creates an unauthenticated session if none is found.
 *
 * @param req request
 * @param res response, if a cookie should be set upon creating a new session
 * @returns an existing session or a new unauthenticated session
 */
export async function checkSession(req: Request, res?: Response): Promise<Session> {
    // Get the existing session, if any
    let session = await getSession(req);

    // Create an unauthenticated session, if necessary
    if (session === undefined) {
        session = await startSession(req, res);
    }

    return session;
}

function isUUIDv4(str: string): boolean {
    const uuidv4Regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidv4Regex.test(str);
}

export function isValidSession(session?: Session): boolean {
    return session !== undefined && (session.validUntil === undefined || session.validUntil >= new Date());
}

export async function endSession(req: Request, res: Response): Promise<void> {
    const session = await checkSession(req);
    if (session.userEmail) {
        sessions.delete(session.id);
        setSessionCookie(req, res, "", new Date(0));
    }
}

function setSessionCookie(req: Request, res: Response, value: string, expires?: Date) {
    const cookiePath = req.path.substring(0, req.path.lastIndexOf(COOKIE_PATH) + COOKIE_PATH.length);
    res.cookie(COOKIE_NAME, value, {
        httpOnly: true,
        secure: req.secure,
        path: cookiePath,
        expires: expires,
    });
}

function findSessionById(sessionId: string): AuthenticatedSession | undefined {
    const session = sessions.get(sessionId);
    if (session && !isValidSession(session)) {
        sessions.delete(session.id);
        return undefined;
    }
    return session;
}

function purgeExpiredSessions() {
    for (const [sessionId, session] of sessions) {
        if (!isValidSession(session)) {
            sessions.delete(sessionId);
        }
    }
}

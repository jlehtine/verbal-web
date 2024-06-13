import { ChatServerConfig } from "./ChatServer";
import { RequestContext, contextFrom } from "./RequestContext";
import { checkGoogleAuthRequest } from "./authGoogle";
import { logDebug, logInfo, logThrownError } from "./log";
import { checkSession, startSession } from "./session";
import { Request, Response } from "express";
import { StatusCodes } from "http-status-codes";

export async function handleAuthCheck(config: ChatServerConfig, req: Request, res: Response): Promise<void> {
    // Check session
    const session = await checkSession(req);

    // Return response
    res.sendStatus(
        config.allowUsers === undefined || session.userEmail !== undefined ? StatusCodes.OK : StatusCodes.UNAUTHORIZED,
    );
}

export async function handleAuthRequest(
    config: ChatServerConfig,
    req: Request,
    res: Response,
): Promise<string | undefined> {
    const ctx = contextFrom(req);
    let user: string | undefined;

    // Get identity provider
    const idp = req.params.idp;

    // Get bearer token
    const token = getBearerToken(req, res);
    if (token === undefined) return;

    // Google authentication
    if (idp === "google") {
        try {
            user = await checkGoogleAuthRequest(config, token);
            logDebug("Google authenticated %s", ctx, user);
        } catch (err: unknown) {
            logThrownError("Google authentication error", err, ctx);
            sendStatusText(ctx, res, StatusCodes.UNAUTHORIZED, "Google authentication failed");
            return;
        }
    }

    // Unsupported identity provider
    else {
        sendStatusText(ctx, res, StatusCodes.BAD_REQUEST, "Unsupported identity provider");
        return;
    }

    // Check authorization
    if (isAuthorized(config, user)) {
        // Initiate session
        ctx.session = await startSession(req, res, user, config);

        logInfo("User authenticated and authorized", ctx);
        res.sendStatus(StatusCodes.OK);
        return user;
    } else {
        sendStatusText(ctx, res, StatusCodes.UNAUTHORIZED, `Authenticated user ${user} is not authorized`);
        return;
    }
}

const BEARER_PREFIX = "Bearer ";

function getBearerToken(req: Request, res: Response): string | undefined {
    const ctx = contextFrom(req);
    const authz = req.headers.authorization;
    if (!authz) {
        sendStatusText(ctx, res, StatusCodes.UNAUTHORIZED, "Authorization header missing");
        return undefined;
    }
    if (!authz.startsWith(BEARER_PREFIX)) {
        sendStatusText(ctx, res, StatusCodes.BAD_REQUEST, "Authorization header invalid");
        return undefined;
    }
    return authz.substring(BEARER_PREFIX.length);
}

function isAuthorized(config: ChatServerConfig, user: string): boolean {
    if (config.allowUsers === undefined) {
        return true;
    } else {
        const ulc = user.toLowerCase();
        for (const au of config.allowUsers) {
            const aulc = au.toLowerCase();
            if (ulc == aulc || ulc.endsWith("@" + aulc)) {
                return true;
            }
        }
    }
    return false;
}

function sendStatusText(
    ctx: RequestContext,
    res: Response,
    code: StatusCodes.BAD_REQUEST | StatusCodes.UNAUTHORIZED,
    text: string,
): void {
    logInfo(text, ctx);
    const codeText = {
        [StatusCodes.BAD_REQUEST]: "Bad Request",
        [StatusCodes.UNAUTHORIZED]: "Unauthorized",
    }[code];
    res.status(code);
    if (code === StatusCodes.UNAUTHORIZED) {
        res.header("WWW-Authenticate: Bearer");
    }
    res.send(`${codeText}: ${text}`).end();
}

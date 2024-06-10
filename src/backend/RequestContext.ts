import { Session } from "./session";
import { Request } from "express";

/** Details on request context */
export interface RequestContext {
    /** Source IP address of the request */
    sourceIp?: string;

    /** Session information, if authenticated */
    session?: Session;

    /** Chat session identifier */
    chatId?: string;
}

export function contextFrom(req: Request, session?: Session, chatId?: string): RequestContext {
    return { sourceIp: req.ip, session: session, chatId: chatId };
}

import { Session } from "./session";
import { Request } from "express";

/** Details on request context */
export interface RequestContext {
    /** Source IP address of the request */
    sourceIp?: string;

    /** Session information, if authenticated */
    session?: Session;
}

export function contextFrom(req: Request): RequestContext {
    return { sourceIp: req.ip, session: req.vwSession };
}

/** Details on request context */
export interface RequestContext {
    /** Chat session identifier */
    chatId: string;

    /** Source IP address of the request */
    sourceIp?: string;

    /** User email address, if authenticated */
    userEmail?: string;
}

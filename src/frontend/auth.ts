/** Authentication state */
export interface AuthState {
    /** Authenticated user, if any */
    user: string;

    /** Used authentication method */
    authenticatedBy: AuthMethod;
}

/** Authentication method: Google OAuth */
export const AUTH_METHOD_GOOGLE_OAUTH = "Google OAuth";

/** Authentication methods */
export type AuthMethod = typeof AUTH_METHOD_GOOGLE_OAUTH;

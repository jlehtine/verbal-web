export interface BackendRequest {
    query: string;
}

export interface BackendResponse {
    response: string;
}

export function isBackendRequest(value: unknown): value is BackendRequest {
    return typeof value === 'object' && value !== null && typeof (value as BackendRequest).query === 'string';
}
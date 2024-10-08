import { FallbackLng, Resource } from "i18next";

/** Color scheme to be used */
export type ColorScheme = "light" | "dark";

/** Describes the phase of loading components */
export type VerbalWebLoadingPhase =
    /** Loading assistant button and associated dependencies */
    | "initial"
    /** Loading assistant chat dialog */
    | "dialog"
    /** Loading extra features for the chat dialog */
    | "extra";

/** Verbal Web frontend configuration */
export default interface VerbalWebConfiguration {
    /** Backend base URL */
    backendURL: string;

    /** Initial instruction to be sent with the request */
    initialInstruction?: string;

    /** Page content selector to include page content in the initial instruction */
    pageContentSelector?: string;

    /** GPT model to be used */
    useModel?: string;

    /** Color scheme to be used (default is to auto detect) */
    colorScheme?: ColorScheme;

    /** Forced language */
    lng?: string;

    /** Default language */
    fallbackLng?: FallbackLng;

    /** Supported languages */
    supportedLngs?: readonly string[];

    /** Override localized text resources */
    resources?: Resource;

    /** URL to the terms of service page (absolute or relative)*/
    termsOfServiceUrl?: string;

    /** Whether to enable syntax highlighting (default is true) */
    highlight?: boolean;

    /** Whether to enable math markup support (default is true) */
    mathMarkup?: boolean;

    /**
     * Callback for loading state changes.
     * Default indicators for loading progress and loading errors are
     * suppressed if this callback is provided.
     * If loading fails then the callback is called with "not loading"
     * state and a loading error being present.
     *
     * @param loading whether currently loading some components
     * @param phase phase of loading
     * @param err loading error
     * @returns
     */
    onLoading?: (loading: boolean, phase: VerbalWebLoadingPhase, err?: unknown) => void;

    /**
     * Number of milliseconds to delay until loading indicator is displayed or
     * the onLoading callback is called. If loading completes before the delay
     * is over then no loading indication is provided to avoid unnecessary
     * flashes of information. Loading errors are always indicated.
     * The default value is 200 milliseconds.
     */
    onLoadingDelayMillis?: number;
}

/** Default loading indicator delay in millis */
export const DEFAULT_ON_LOADING_DELAY_MILLIS = 200;

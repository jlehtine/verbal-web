import VerbalWebConfiguration from "./VerbalWebConfiguration";

declare global {
    /**
     * Initialize Verbal Web launcher.
     *
     * @param elementId identifier of the containing element
     * @param conf configuration
     */
    function initVerbalWebLauncher(elementId: string, conf: VerbalWebConfiguration): void;

    /**
     * Initialize Verbal Web view.
     *
     * @param elementId identifier of the containing element
     * @param conf configuration
     * @param scrollElemId identifier of the scrolling element, or undefined for document level scrolling
     */
    function initVerbalWebView(elementId: string, conf: VerbalWebConfiguration, scrollElemId?: string): void;
}

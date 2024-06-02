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
     * @param fullHeight whether to render the view in full height relative to the container
     * @param scrollElemId identifier of the scrolling element, or undefined for document level scrolling
     */
    function initVerbalWebView(
        elementId: string,
        conf: VerbalWebConfiguration,
        fullHeight?: boolean,
        scrollElemId?: string,
    ): void;
}

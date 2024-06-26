import { VerbalWebConfigurationError } from "../shared/error";

/** HTML class name for Verbal Web components */
export const VERBAL_WEB_CLASS_NAME = "verbal-web";

export function extract(pageContentSelector?: string): string | undefined {
    if (!pageContentSelector) {
        return undefined;
    }
    // Get the node list
    let elems;
    try {
        elems = document.querySelectorAll(pageContentSelector);
    } catch (err) {
        throw new VerbalWebConfigurationError("Invalid page content selector: " + pageContentSelector, { cause: err });
    }

    // Extract content from nodes
    let pc = "";
    const processedElems: Element[] = [];
    for (const elem of elems) {
        // Ignore if already contained in some other processed element
        if (!isContainedIn(elem, processedElems)) {
            // Include all rendered text
            pc += extractPageContentForElement(elem);

            processedElems.push(elem);
        }
    }

    // Remove content from the assistant elements
    for (const elem of document.querySelectorAll("." + VERBAL_WEB_CLASS_NAME)) {
        if (elem instanceof HTMLElement && isContainedIn(elem, processedElems)) {
            pc = pc.replace(elem.innerText, "");
        }
    }

    return pc;
}

function isContainedIn(elem: Element, elems: Element[]): boolean {
    let n: Element | null = elem;
    while (n) {
        if (elems.includes(n)) {
            return true;
        }
        n = n.parentElement;
    }
    return false;
}

function extractPageContentForElement(elem: Element): string {
    let pc = "";
    if (elem instanceof HTMLElement) {
        pc = elem.innerText;
    } else {
        for (const child of elem.children) {
            pc += extractPageContentForElement(child);
        }
    }
    return pc;
}

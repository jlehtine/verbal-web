import VerbalWebUI, { VerbalWebConfiguration } from './VerbalWebUI';
import React from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var initVerbalWeb: (elementId: string, conf: VerbalWebConfiguration) => void; // eslint-disable-line
}

function initVerbalWeb(elementId: string, conf: VerbalWebConfiguration) {
    const elem = document.getElementById(elementId);
    if (elem !== null) {
        const root = createRoot(elem);
        root.render(<VerbalWebUI conf={conf} />);
    } else {
        console.error('Element not fount: ' + elementId);
    }
}

globalThis.initVerbalWeb = initVerbalWeb;

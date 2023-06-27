import VerbalWebUI from './VerbalWebUI';
import React from 'react';
import { createRoot } from 'react-dom/client';

declare global {
    var initVerbalWeb: any;
}

function initVerbalWeb(elementId: string) {
    const elem = document.getElementById(elementId);
    if (elem !== null) {
        const root = createRoot(elem);
        root.render(<VerbalWebUI />);
    } else {
        console.error('Element not fount: ' + elementId);
    }
}

globalThis.initVerbalWeb = initVerbalWeb;

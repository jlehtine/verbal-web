import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { createContext } from "react";

/** General application state */
export interface VerbalWebState {
    /** Configuration */
    conf: VerbalWebConfiguration;
}

/** Application context */
export const VerbalWebContext = createContext<VerbalWebState>({ conf: { backendURL: "" } });

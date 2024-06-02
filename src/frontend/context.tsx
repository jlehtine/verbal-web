import { VerbalWebError } from "../shared/error";
import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { PropsWithChildren, createContext, useContext } from "react";
import React from "react";

/** Configuration context */
const VerbalWebConfigurationContext = createContext<VerbalWebConfiguration | null>(null);

export interface VerbalWebConfigurationProviderProps {
    conf: VerbalWebConfiguration;
}

/** Provides configuration for the wrapped elements */
export function VerbalWebConfigurationProvider({
    conf,
    children,
}: PropsWithChildren<VerbalWebConfigurationProviderProps>) {
    return <VerbalWebConfigurationContext.Provider value={conf}>{children}</VerbalWebConfigurationContext.Provider>;
}

/** Use Verbal Web configuration */
export function useConfiguration() {
    const ctx = useContext(VerbalWebConfigurationContext);
    if (ctx === null) {
        throw new VerbalWebError("Verbal Web configuration not provided");
    }
    return ctx;
}

import VerbalWebConfiguration from "./VerbalWebConfiguration";
import { createContext } from "react";

export const ConfigContext = createContext<VerbalWebConfiguration>({ backendURL: "" });

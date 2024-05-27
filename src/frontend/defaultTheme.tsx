import { PaletteMode, createTheme, useMediaQuery } from "@mui/material";
import React from "react";

export function defaultTheme() {
    const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
    const mode: PaletteMode = prefersDarkMode ? "dark" : "light";
    return React.useMemo(
        () =>
            createTheme({
                palette: {
                    mode: mode,
                    ...(mode === "light"
                        ? {
                              text: {
                                  primary: "#333333",
                              },
                              background: {
                                  default: "#f5f5f5",
                                  paper: "#f5f5f5",
                              },
                          }
                        : {
                              text: {
                                  primary: "#cccccc",
                              },
                              background: {
                                  default: "#121212",
                                  paper: "#121212",
                              },
                          }),
                },
            }),
        [prefersDarkMode],
    );
}

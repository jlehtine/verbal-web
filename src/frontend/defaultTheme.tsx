import { createTheme, useMediaQuery } from "@mui/material";
import React from "react";

export function defaultTheme() {
    const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
    return React.useMemo(
        () =>
            createTheme({
                palette: {
                    mode: prefersDarkMode ? "dark" : "light",
                },
            }),
        [prefersDarkMode],
    );
}

import VerbalWebConfiguration, { ColorScheme } from "./VerbalWebConfiguration";
import { ThemeProvider, createTheme, useMediaQuery } from "@mui/material";
import React, { PropsWithChildren } from "react";

export function defaultTheme(colorScheme: ColorScheme) {
    return createTheme({
        palette: {
            mode: colorScheme,
            ...(colorScheme === "light"
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
    });
}

export interface DefaultThemedProps extends PropsWithChildren {
    readonly conf: VerbalWebConfiguration;
}

export function DefaultThemed({ conf, children }: DefaultThemedProps) {
    const prefersDarkMode = useMediaQuery("(prefers-color-scheme: dark)");
    const autoColorScheme = prefersDarkMode ? "dark" : "light";
    const colorScheme = conf.colorScheme ? conf.colorScheme : autoColorScheme;
    const theme = React.useMemo(() => defaultTheme(colorScheme), [colorScheme]);
    return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

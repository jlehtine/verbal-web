import { DEFAULT_ON_LOADING_DELAY_MILLIS } from "./VerbalWebConfiguration";
import { VerbalWebContext } from "./context";
import { Backdrop, CircularProgress } from "@mui/material";
import React, { useContext, useEffect, useState } from "react";

/**
 * Displays a loading indicator dialog, unless custom indicators are active.
 * The dialog is displayed with a slight delay to avoid unnecessary flashes.
 */
export default function LoadingIndicator() {
    const { conf } = useContext(VerbalWebContext);
    const [open, setOpen] = useState(false);
    useEffect(() => {
        const timeout = setTimeout(() => {
            setOpen(true);
        }, conf.onLoadingDelayMillis ?? DEFAULT_ON_LOADING_DELAY_MILLIS);
        return () => {
            clearTimeout(timeout);
        };
    }, []);
    if (conf.onLoading == undefined && open) {
        return (
            <Backdrop open={true} sx={{ color: "#fff", zIndex: (theme) => theme.zIndex.drawer + 1 }}>
                <CircularProgress color="inherit" />
            </Backdrop>
        );
    } else {
        return null;
    }
}

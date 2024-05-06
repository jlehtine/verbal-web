let enableLogInterfaces = true;

export function setEnableLogInterfaces(enable: boolean) {
    enableLogInterfaces = enable;
}

export function logInterfaceData(msg: string, data: unknown) {
    if (enableLogInterfaces) {
        console.debug(msg, data);
    }
}

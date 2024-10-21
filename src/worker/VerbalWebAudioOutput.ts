import { isFloat32Array3, isObject } from "../shared/util";

class VerbalWebAudioOutput extends AudioWorkletProcessor {
    private closed = false;
    private readonly buffers: Float32Array[][][] = [];
    private bufferCount = 0;
    private bufferTail = 0;

    constructor() {
        super();
        this.port.onmessage = (event) => {
            const data: unknown = event.data;
            if (isObject(data)) {
                if (isFloat32Array3(data.outputs) && data.outputs[0]?.[0]?.length > 0) {
                    const outputlen = data.outputs[0][0].length;
                    if (data.outputs.every((stream) => stream.every((channel) => channel.length === outputlen))) {
                        this.buffers.push(data.outputs);
                        this.bufferCount += outputlen;
                    }
                }
                if (data.closed === true) {
                    this.closed = true;
                }
            }
        };
    }

    process(inputs: unknown, outputs: Float32Array[][]) {
        // Check if closed or no output expected anymore
        if (this.closed || !outputs[0]?.length) {
            return false;
        }

        // Return buffered data
        const outputlen = outputs[0][0].length;
        let produced = Math.max(outputlen - this.bufferCount, 0);
        while (produced < outputlen && this.buffers.length > 0) {
            const buffer0 = this.buffers[0];
            const bufferlen = buffer0[0][0].length;
            const remaining = bufferlen - this.bufferTail;
            const toCopy = Math.min(remaining, outputlen - produced);

            // Copy data to output
            for (let i = 0; i < buffer0.length && i < outputs.length; i++) {
                const bufferstream = buffer0[i];
                const output = outputs[i];
                for (let j = 0; j < bufferstream.length && j < output.length; j++) {
                    output[j].set(bufferstream[j].subarray(this.bufferTail, this.bufferTail + toCopy), produced);
                }

                // Copy first channel to other channels if only one channel available
                if (bufferstream.length == 1 && output.length > 1) {
                    for (let j = 1; j < output.length; j++) {
                        output[j].set(output[0].subarray(produced, produced + toCopy), produced);
                    }
                }
            }

            produced += toCopy;
            this.bufferCount -= toCopy;
            this.bufferTail += toCopy;
            if (this.bufferTail >= bufferlen) {
                this.buffers.shift();
                this.bufferTail = 0;
            }
        }

        // Continue while data available
        return true;
    }
}

registerProcessor("VerbalWebAudioOutput", VerbalWebAudioOutput);

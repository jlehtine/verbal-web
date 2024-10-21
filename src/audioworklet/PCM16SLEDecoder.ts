/**
 * Decode PCM 16-bit signed little-endian audio.
 */
class PCM16SLEDecoder extends AudioWorkletProcessor {
    private closed = false;
    private buffers: Int16Array[] = [];
    private bufferCount = 0;
    private bufferTail = 0;
    private readonly littleEndian;

    constructor() {
        super();
        this.littleEndian = new Int16Array(new Uint8Array([1, 0]).buffer)[0] === 1;
        this.port.onmessage = (event) => {
            if (isInt16ArrayArray(event.data)) {
                this.buffers.push(...event.data);
                this.bufferCount += event.data.reduce((acc, buf) => acc + buf.length, 0);
            } else if (event.data === "close") {
                this.closed = true;
            }
        };
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
        // Convert buffered PCM 16-bit signed audio to Float32
        const output = outputs[0];
        const channum = output.length;
        if (this.closed || channum === 0) return false;

        // Handle first channel
        const output0 = output[0];
        const outputlen = output0.length;
        let converted = Math.max(outputlen - this.bufferCount, 0);
        while (converted < outputlen && this.buffers.length > 0) {
            const buffer0 = this.buffers[0];
            const remaining = buffer0.length - this.bufferTail;
            const toConvert = Math.min(remaining, outputlen - converted);
            this.pcm16sleToFloat32(buffer0, this.bufferTail, toConvert, output0, converted);
            converted += toConvert;
            this.bufferTail += toConvert;
            if (this.bufferTail >= buffer0.length) {
                this.buffers.shift();
                this.bufferTail = 0;
            }
        }

        // Copy same audio to all channels
        for (let i = 1; i < channum; i++) {
            output[i].set(output0);
        }

        return true;
    }

    private pcm16sleToFloat32(
        buffer: Int16Array,
        offset: number,
        length: number,
        output: Float32Array,
        outputOffset = 0,
    ) {
        if (this.littleEndian) {
            for (let i = 0; i < length; i++) {
                output[outputOffset + i] = buffer[offset + i] / 32768;
            }
        } else {
            for (let i = 0; i < length; i++) {
                const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
                output[outputOffset + i] = view.getInt16(offset + i * 2, true) / 32768;
            }
        }
    }
}

function isInt16ArrayArray(v: unknown): v is Int16Array[] {
    return Array.isArray(v) && v.every((i) => i instanceof Int16Array);
}

// Register the processor
registerProcessor("PCM16SLEDecoder", PCM16SLEDecoder);

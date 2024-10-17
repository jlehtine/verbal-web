const AUDIO_BUFFER_LENGTH = 131072;

/**
 * Decode PCM 16-bit signed little-endian audio.
 */
class PCM16SLEDecoder extends AudioWorkletProcessor {
    private closed = false;
    private buffers: Int16Array[] = [new Int16Array(AUDIO_BUFFER_LENGTH)];
    private view: DataView = new DataView(this.buffers[0].buffer);
    private bufferHead = 0;
    private bufferTail = 0;
    private littleEndian;

    constructor() {
        super();
        this.port.onmessage = (event) => {
            if (event.data instanceof ArrayBuffer) {
                const data = new Int16Array(event.data);
                const datalen = data.length;
                let consumed = 0;
                while (consumed < datalen) {
                    const remaining = AUDIO_BUFFER_LENGTH - this.bufferHead;
                    const toCopy = Math.min(remaining, datalen - consumed);
                    const buffer = this.buffers[this.buffers.length - 1];
                    buffer.set(data.subarray(consumed, consumed + toCopy), this.bufferHead);
                    this.bufferHead += toCopy;
                    consumed += toCopy;
                    if (this.bufferHead >= AUDIO_BUFFER_LENGTH) {
                        this.buffers.push(new Int16Array(AUDIO_BUFFER_LENGTH));
                        this.bufferHead = 0;
                    }
                }
            } else if (event.data === "close") {
                this.closed = true;
            }
        };
        this.littleEndian = new Int16Array(new Uint8Array([1, 0]).buffer)[0] === 1;
    }

    process(inputs: Float32Array[][], outputs: Float32Array[][]) {
        // Convert buffered PCM 16-bit signed little-endian audio to Float32
        const output = outputs[0];
        const channum = output.length;
        if (this.closed || channum === 0) return false;
        const output0 = output[0];
        const outputlen = output0.length;
        const buflen = (this.buffers.length - 1) * AUDIO_BUFFER_LENGTH + this.bufferHead - this.bufferTail;
        let converted = Math.max(outputlen - buflen, 0);
        while (converted < outputlen) {
            const remaining =
                this.buffers.length == 1 ? this.bufferHead - this.bufferTail : AUDIO_BUFFER_LENGTH - this.bufferTail;
            const toConvert = Math.min(remaining, outputlen - converted);
            this.pcm16sleToFloat32(this.buffers[0], this.view, this.bufferTail, toConvert, output0, converted);
            converted += toConvert;
            this.bufferTail += toConvert;
            if (this.bufferTail >= AUDIO_BUFFER_LENGTH) {
                this.buffers.shift();
                this.bufferTail = 0;
                this.view = new DataView(this.buffers[0].buffer);
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
        view: DataView,
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
                output[outputOffset + i] = view.getInt16(offset + i * 2, true) / 32768;
            }
        }
    }
}

// Register the processor
registerProcessor("PCM16SLEDecoder", PCM16SLEDecoder);

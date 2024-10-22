import { alaw } from "alawmulaw";

export class G711AEncoder {
    private targetSampleRate;
    private offset = 0;
    private readonly littleEndian = new Uint16Array(new Uint8Array([1, 0]).buffer)[0] === 1;

    constructor(targetSampleRate?: number) {
        this.targetSampleRate = targetSampleRate;
    }

    encodeFloat32(buffers: Float32Array[][], sampleRate?: number): Uint8Array {
        // Calculate output buffer length
        const rateRatio =
            sampleRate !== undefined && this.targetSampleRate !== undefined ? sampleRate / this.targetSampleRate : 1;
        const buflen = buffers.reduce((acc, buffer) => acc + buffer[0].length, 0);
        const off = this.offset;
        const outlen = Math.floor((buflen - off) / rateRatio);

        // Fill intermediate PCM 16-bit signed int buffer
        const pcm16 = new Int16Array(outlen);
        let outoff = 0;
        for (const buffer of buffers) {
            const input = this.mono(this.resample(buffer, rateRatio));
            for (const i of input) {
                pcm16[outoff++] = Math.round(i * 32767);
            }
        }

        // Encode to G.711 A-law
        return alaw.encode(pcm16);
    }

    encodeInt16le(buffer: ArrayBuffer): Uint8Array {
        // Convert to int16
        const pcm16 = this.int16leToInt16(buffer);

        // Encode to G.711 A-law
        return alaw.encode(pcm16);
    }

    private int16leToInt16(input: ArrayBuffer): Int16Array {
        // Check if already using correct byte order
        if (this.littleEndian) return new Int16Array(input);

        // Swap bytes
        const int16 = new Int16Array(input.byteLength / 2);
        const src = new Uint8Array(input);
        const dst = new Uint8Array(int16.buffer);
        const buflen = input.byteLength;
        for (let off = 0; off < buflen; off += 2) {
            dst[off] = src[off + 1];
            dst[off + 1] = src[off];
        }

        return int16;
    }

    private mono(input: Float32Array[]): Float32Array {
        // Check if input usabled as is
        const numchan = input.length;
        if (numchan === 1) return input[0];

        const buflen = input[0].length;
        const mono = new Float32Array(buflen);

        // Optimized for stereo
        if (numchan === 2) {
            const inputl = input[0];
            const inputr = input[1];
            for (let i = 0; i < buflen; i++) {
                mono[i] = (inputl[i] + inputr[i]) / 2;
            }
        }

        // Arbitrary number of channels
        else {
            for (let i = 0; i < buflen; i++) {
                let sum = 0;
                for (let j = 0; j < numchan; j++) {
                    sum += input[j][i];
                }
                mono[i] = sum / numchan;
            }
        }

        return mono;
    }

    private resample(input: Float32Array[], rateRatio: number): Float32Array[] {
        // Check if input usable as is
        if (rateRatio === 1) return input;

        // Handle each channel
        const outputs = [];
        let off = this.offset;
        const buflen = input[0].length;
        const outlen = Math.floor((buflen - off) / rateRatio);
        for (const channel of input) {
            off = this.offset;

            // Allocate output buffer
            const resampled = new Float32Array(outlen);

            // Optimized for multiples of target rate
            if (rateRatio > 1 && rateRatio % 1 === 0) {
                for (let i = 0; i < outlen; i++, off += rateRatio) {
                    resampled[i] = channel[off];
                }
            }

            // Arbitrary sample rate, coarse resampling
            else {
                for (let i = 0; i < outlen; i++, off += rateRatio) {
                    resampled[i] = channel[Math.floor(off)];
                }
            }

            outputs.push(resampled);
        }
        this.offset = off % rateRatio;

        return outputs;
    }
}

import { alaw } from "alawmulaw";

const TARGET_SAMPLE_RATE = 8000;
const AUDIO_BUFFER_LENGTH = 1024;

/**
 * Encodes raw audio data to G.711 A-law format and publishes it to the main thread as message port events.
 */
class G711AEncoder extends AudioWorkletProcessor {
    private offset = 0;
    private array = new Uint8Array(AUDIO_BUFFER_LENGTH);
    private bufferBytes = 0;

    process(inputs: Float32Array[][]) {
        const input = inputs[0];

        // Check if no more data available
        if (input.length === 0) {
            return false;
        }

        // Convert to mono and target rate
        const inp = this.toSampleRate(this.toMono(input), sampleRate, TARGET_SAMPLE_RATE);

        // Convert to PCM 16-bit signed integer
        const buflen = inp.length;
        const pcm16 = new Int16Array(buflen);
        for (let i = 0; i < buflen; i++) {
            pcm16[i] = Math.round(inp[i] * 32767);
        }

        // Encode to G.711 A-law
        const pcma = alaw.encode(pcm16);

        // Buffer and publish to main thread
        if (this.bufferBytes == 0 && pcma.byteLength >= AUDIO_BUFFER_LENGTH) {
            this.port.postMessage(pcma);
        } else {
            let bytesConsumed = 0;
            while (bytesConsumed < pcma.length) {
                const remaining = AUDIO_BUFFER_LENGTH - this.bufferBytes;
                const toCopy = Math.min(remaining, pcma.length - bytesConsumed);
                this.array.set(pcma.subarray(bytesConsumed, bytesConsumed + toCopy), this.bufferBytes);
                this.bufferBytes += toCopy;
                bytesConsumed += toCopy;
                if (this.bufferBytes === AUDIO_BUFFER_LENGTH) {
                    this.port.postMessage(this.array);
                    this.bufferBytes = 0;
                }
            }
        }

        return true;
    }

    private toMono(input: Float32Array[]): Float32Array {
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

    private toSampleRate(input: Float32Array, fromRate: number, toRate: number): Float32Array {
        // Check if input usable as is
        if (fromRate === toRate) return input;

        const buflen = input.length;
        let resampled;

        // Optimized for multiples of target rate
        const ratio = fromRate / toRate;
        if (fromRate > toRate && ratio % 1 === 0) {
            let off = this.offset;
            const outlen = Math.floor((buflen - off) / ratio);
            resampled = new Float32Array(outlen);
            for (let i = 0; i < outlen; i++, off += ratio) {
                resampled[i] = input[off];
            }
            this.offset = off % ratio;
        }

        // Arbitrary sample rate, coarse resampling
        else {
            let off = this.offset;
            const outlen = Math.floor((buflen - off) / ratio);
            resampled = new Float32Array(outlen);
            for (let i = 0; i < outlen; i++, off += ratio) {
                resampled[i] = input[Math.floor(off)];
            }
            this.offset = off % ratio;
        }

        return resampled;
    }
}

// Register the processor
registerProcessor("G711AEncoder", G711AEncoder);

import { alaw } from "alawmulaw";

const TARGET_SAMPLE_RATE = 8000;

/**
 * Encodes raw audio data to G.711 A-law format and publishes it to the main thread as message port events.
 */
class G711AEncoder extends AudioWorkletProcessor {
    private offset = 0;

    process(inputs: Float32Array[][]) {
        const input = inputs[0];

        // Convert to mono and target rate
        const inp = this.toSampleRate(this.toMono(input), sampleRate, TARGET_SAMPLE_RATE);

        // Convert to PCM 16-bit signed integer
        const buflen = inp.length;
        const pcm16Input = new Int16Array(buflen);
        for (let i = 0; i < buflen; i++) {
            pcm16Input[i] = Math.round(inp[i] * 32767);
        }

        // Encode to G.711 A-law
        const g711aOutput = alaw.encode(pcm16Input);

        // Publish to main thread as ArrayBuffer
        this.port.postMessage({ g711aOutput });

        return false;
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
        let resampled: Float32Array;

        // Optimized for multiples of target rate
        const ratio = fromRate / toRate;
        if (fromRate > toRate && ratio % 1 === 0 && buflen % ratio === 0) {
            const outlen = buflen / ratio;
            resampled = new Float32Array(outlen);
            for (let i = 0, j = 0; i < outlen; i++, j += ratio) {
                resampled[i] = input[j];
            }
        }

        // Arbitrary sample rate, coarse resampling
        else {
            let off = this.offset;
            const outlen = Math.ceil((buflen + off) / ratio);
            resampled = new Float32Array(outlen);
            for (let i = 0; i < outlen && off < buflen; i++, off += ratio) {
                resampled[i] = input[Math.floor(off)];
            }
            this.offset = off - buflen;
        }

        return resampled;
    }
}

// Register the processor
registerProcessor("G711AEncoder", G711AEncoder);

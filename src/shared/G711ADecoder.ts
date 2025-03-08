import { alaw } from "alawmulaw";

export class G711ADecoder {
    decodeToFloat32(pcma: Uint8Array): Float32Array {
        // Decode G.711 A-law
        const pcm16 = alaw.decode(pcma);

        // Convert to float32
        const buflen = pcm16.length;
        const out = new Float32Array(buflen);
        for (let i = 0; i < buflen; i++) {
            out[i] = pcm16[i] / 32767;
        }

        return out;
    }
}

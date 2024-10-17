#include <stddef.h>
#include <stdint.h>
#include <emscripten/emscripten.h>

/**
 * Decode PCM 16-bit signed little-endian audio data to float32.
 */
extern "C" EMSCRIPTEN_KEEPALIVE void vw_pcm16sleDecode(const uint8_t* src, float* dst, size_t numSamples) {
    const uint16_t one = 1;
    if (reinterpret_cast<const uint8_t*>(&one)[0] == 1) {
        const uint16_t* src16 = reinterpret_cast<const uint16_t*>(src);
        for (int i = 0; i < numSamples; i++) {
            dst[i] = src16[i] / 32768.0f;
        }
    } else {
        for (int i = 0; i < numSamples; i++) {
            int16_t sample = (src[2 * i] << 8) | src[2 * i + 1];
            dst[i] = sample / 32768.0f;
        }
    }
}

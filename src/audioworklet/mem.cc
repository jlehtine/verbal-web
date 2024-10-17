#include <stdlib.h>
#include <emscripten/emscripten.h>

/**
 * Allocate memory.
 */
extern "C" EMSCRIPTEN_KEEPALIVE void *vw_alloc(size_t numBytes) {
    return malloc(numBytes);
}

/**
 * Free memory.
 */
extern "C" EMSCRIPTEN_KEEPALIVE void vw_free(void *ptr) {
    free(ptr);
}

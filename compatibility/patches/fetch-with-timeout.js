function(module, exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    exports.fetchWithTimeout = async function(url, options = {}) {
        const { timeout = 8000, ...requestOptions } = options;
        const controller = new AbortController();
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, timeout);
        try {
            return await fetch(url, { ...requestOptions, signal: controller.signal });
        } catch (error) {
            if (timedOut) {
                throw new Error(`SyncShare server request timed out after ${timeout} ms`);
            }
            throw error;
        } finally {
            clearTimeout(timer);
        }
    };
}

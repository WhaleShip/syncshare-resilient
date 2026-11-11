function(module, exports, require) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    const DataSource = require(573).default;

    function positiveId(value) {
        if (typeof value !== "number" && typeof value !== "string") return null;
        if (!/^[1-9]\d*$/.test(String(value))) return null;
        const id = Number(value);
        return Number.isSafeInteger(id) ? id : null;
    }

    exports.default = class UserDataSource extends DataSource {
        async load() {
            // Moodle emits its current-user configuration as JSON. Read the
            // script text without evaluating it or accessing privileged objects.
            // This also works in a quiz popup with no user/profile navigation.
            for (const script of document.querySelectorAll("script:not([src])")) {
                const match = script.textContent.match(/\bM\.cfg\s*=\s*(\{[\s\S]*?\})\s*;/);
                if (!match) continue;
                try {
                    const config = JSON.parse(match[1]);
                    if (config.userId === 0 || config.userId === "0") return;
                    const id = positiveId(config.userId);
                    if (id !== null) {
                        this.data.moodleId = id;
                        return;
                    }
                } catch (_) {
                    // A custom non-JSON script is not a usable source.
                }
            }

            // Preserve the legacy profile-link fallback.
            const profile = document.querySelector('a[href*="profile.php"]');
            if (profile) {
                const id = positiveId(new URL(profile.href).searchParams.get("id"));
                if (id !== null) {
                    this.data.moodleId = id;
                    return;
                }
            }

            for (const attribute of ["data-userid", "data-user-id"]) {
                for (const element of document.querySelectorAll(`[${attribute}]`)) {
                    const id = positiveId(element.getAttribute(attribute));
                    if (id !== null) {
                        // 1.1.6 incorrectly used this.data.userId for data-user-id.
                        this.data.moodleId = id;
                        return;
                    }
                }
            }
        }
    };
}

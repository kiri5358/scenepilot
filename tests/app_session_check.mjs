// Which message a failed call gets: a session the server no longer knows (it restarted) must not look like "something went wrong".
import assert from "node:assert/strict";
import { ApiError, errorKey } from "../src/scenepilot/static/app/js/core/api.js";

assert.equal(errorKey(new ApiError("network", 0)), "err.network");
assert.equal(errorKey(new ApiError("busy", 429)), "err.busy");
assert.equal(errorKey(new ApiError("Session not found.", 404)), "err.sessionLost");
assert.equal(errorKey(new ApiError("boom", 502)), "err.server");
assert.equal(errorKey(new Error("other")), "err.server");
console.log("app session checks passed");

/**
 * Host half of the Full Copy bundle.
 *
 * The feature is entirely a Web UI addition: `client.js` registers the
 * 「完全复制」 action into `conversation.chat.turnTail` and reads the completed
 * turn's data in the browser. The Host therefore owns no services, tools, or
 * listeners and only needs a plugin row so the Client half is loaded for the
 * profile.
 */
export function apply() {}

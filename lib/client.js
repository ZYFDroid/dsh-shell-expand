window.__ModuleLoader__.load({
	id: "dsh-shell-expand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region src/client/index.ts
		/** No cordis services needed by this fiber. */
		const inject = [];
		/**
		* One selector per surface that renders a shell row: the shipped bash row's
		* header and the generic Tool row's variant/name markers. `querySelectorAll`
		* returns each element once however many alternatives match it.
		*/
		const SHELL_ROW = [
			"[data-sample=\"bash\"]",
			"[data-variant=\"bash\"]",
			"[data-tool=\"bash\"]",
			"[data-variant=\"pwsh\"]",
			"[data-tool=\"pwsh\"]"
		].join(", ");
		/**
		* A disclosure target: the element that carries both the expandable marker and
		* the expanded state. `querySelector` returns the first in document order, and
		* a row's own header always precedes anything inside its body — so an inner
		* control that happens to be expandable is never mistaken for the row's.
		*/
		const EXPANDABLE_DISCLOSURE = "[aria-expanded][data-expandable]";
		/**
		* The node wrapper that carries one Tool call's identity. A row and its
		* sub-calls each sit in their own wrapper, so `closest` from a row names that
		* row's call and never its parent's.
		*/
		const CALL_HOST = "[data-chat-call-id]";
		/**
		* A folded Turn's node wrapper. The harness hides a folded Turn's rows with CSS
		* instead of unmounting them, so their DOM — and any expanded card's body —
		* stays mounted. Its own disclosure reset collapses them; reopening one here
		* would undo the user's collapse-timing setting and keep that body rendered
		* behind a hidden dialogue row.
		*/
		const FOLDED_TURN = "[data-turn-process-hidden]";
		/** Attribute recording what this plugin did to a row, for inspection. */
		const MARKER = "data-shell-expand";
		/**
		* The element that toggles this row's body, or null when the row has none yet.
		* The shipped bash row IS its own header; every other surface nests a
		* disclosure row inside the row element.
		* @param row - one element matching {@link SHELL_ROW}.
		* @returns the disclosure target, or null while the row has nothing to expand.
		*/
		function toggleOf(row) {
			if (row.hasAttribute("data-expandable")) return row;
			return row.querySelector(EXPANDABLE_DISCLOSURE);
		}
		/**
		* True while the row's call is still executing. A settled row that arrives in
		* the DOM is history — a replayed session, or an older page loaded by scrolling
		* — and history belongs to the collapse-timing setting, not to this plugin.
		* @param row - one element matching {@link SHELL_ROW}.
		* @returns whether the row reports a running state.
		*/
		function isRunning(row) {
			return row.getAttribute("data-state") === "running";
		}
		/**
		* Open one shell row, at most once per call.
		*
		* A row that already has an expandable body counts as decided whatever its
		* state, so the collapse gesture belongs to the user from then on. Clicking is
		* the published interaction: the disclosure row's own `onClick` toggles it, and
		* a synthetic click on a React-managed element is an ordinary user gesture.
		* @param row - one element matching {@link SHELL_ROW}.
		* @param decisions - rows and calls this observer has already decided about.
		*/
		function openOnce(row, decisions) {
			const toggle = toggleOf(row);
			if (toggle === null) return;
			const callId = row.closest(CALL_HOST)?.getAttribute("data-chat-call-id") ?? null;
			if (callId === null) {
				if (decisions.rows.has(row)) return;
				decisions.rows.add(row);
			} else {
				if (decisions.calls.has(callId)) return;
				decisions.calls.add(callId);
			}
			if (row.closest(FOLDED_TURN) !== null) return;
			if (toggle.getAttribute("aria-expanded") !== "false") return;
			row.setAttribute(MARKER, "opened");
			toggle.click();
		}
		/**
		* Watch the transcript for shell rows the user is actually watching, and open
		* each one the first time it has something to expand.
		*
		* Only two things trigger an expansion: a running row entering the DOM, and a
		* row gaining its expandable body while the observer is watching (a preparing
		* call that dispatches). Everything already present at load, and everything
		* inserted as an already-settled row, is history.
		* @returns the disposer that detaches the observer.
		*/
		function watchShellRows() {
			const root = document.body;
			if (root === null) return () => {};
			const decisions = {
				calls: /* @__PURE__ */ new Set(),
				rows: /* @__PURE__ */ new WeakSet()
			};
			const consider = (node) => {
				if (node.matches(SHELL_ROW) && isRunning(node)) openOnce(node, decisions);
				for (const row of node.querySelectorAll(SHELL_ROW)) if (isRunning(row)) openOnce(row, decisions);
			};
			const observer = new MutationObserver((records) => {
				for (const record of records) {
					if (record.type === "attributes") {
						const target = record.target;
						if (!(target instanceof Element)) continue;
						const row = target.closest(SHELL_ROW);
						if (row !== null) openOnce(row, decisions);
						continue;
					}
					for (const added of record.addedNodes) if (added instanceof Element) consider(added);
				}
			});
			observer.observe(root, {
				childList: true,
				subtree: true,
				attributes: true,
				attributeFilter: ["aria-expanded", "data-expandable"]
			});
			for (const row of root.querySelectorAll(SHELL_ROW)) if (isRunning(row)) openOnce(row, decisions);
			return () => {
				observer.disconnect();
			};
		}
		/**
		* Apply the shell-expand behavior.
		* @param ctx - client root context (used for effect-scoped teardown).
		*/
		function apply(ctx) {
			ctx.effect(() => watchShellRows(), "dsh-shell-expand: open shell rows");
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

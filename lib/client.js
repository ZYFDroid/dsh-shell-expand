window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-shell-expand",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#region node_modules/clsx/dist/clsx.mjs
		function r(e) {
			var t, f, n = "";
			if ("string" == typeof e || "number" == typeof e) n += e;
			else if ("object" == typeof e) if (Array.isArray(e)) {
				var o = e.length;
				for (t = 0; t < o; t++) e[t] && (f = r(e[t])) && (n && (n += " "), n += f);
			} else for (f in e) e[f] && (n && (n += " "), n += f);
			return n;
		}
		function clsx() {
			for (var e, t, f = 0, n = "", o = arguments.length; f < o; f++) (e = arguments[f]) && (t = r(e)) && (n && (n += " "), n += t);
			return n;
		}
		//#endregion
		//#region src/client/spill-notice.ts
		/**
		* Recognition of the spill-policy footer a retained preview carries.
		*
		* The marker is a text convention the Host's spill policy writes, not a wire
		* field: a notice is a parenthesized final paragraph naming the omitted bytes,
		* the stored location, and the retrieval guidance. This is a copy of
		* `dsh-spill-policy`'s recognizer, kept local so the shell row's bundle carries
		* no second package's module graph; the convention it matches is the persisted
		* one, and a notice it fails to recognize leaves the call on the generic path
		* rather than mis-reporting an exit status.
		*/
		const OPEN = "(";
		const CLOSE = ")";
		const LOCATION = " Full formatted result stored at: ";
		const GUIDANCE_SEPARATOR = ". ";
		const SEPARATOR = "\n\n";
		/** `Omitted <count> bytes.` — the standardized omission clause for an exact count. */
		const OMISSION = /^Omitted (\d+) bytes\.(?: Omitted ([1-9]\d*) images\.)?$/;
		/**
		* Recognize a final spill-policy notice in persisted text.
		* @param text - the complete recorded result text.
		* @returns whether a complete notice occupies the end of the result.
		*/
		function hasSpillNotice(text) {
			if (!text.endsWith(CLOSE)) return false;
			let start = 0;
			while (true) {
				const next = text.indexOf(`${SEPARATOR}${OPEN}`, start);
				const candidate = text.slice(start, next < 0 ? -1 : next);
				const location = candidate.indexOf(LOCATION, 1);
				if (candidate.startsWith(OPEN) && location >= 0 && isOmission(candidate.slice(1, location))) return text.indexOf(GUIDANCE_SEPARATOR, start + location + 34) >= 0;
				if (next < 0) return false;
				start = next + 2;
			}
		}
		/**
		* Whether a notice's leading clause is the standardized omission wording with a
		* count the formatter can produce.
		* @param text - the clause, before the stored location.
		* @returns whether it is a well-formed omission clause.
		*/
		function isOmission(text) {
			const match = OMISSION.exec(text);
			if (match === null) return false;
			const bytes = Number(match[1]);
			return Number.isSafeInteger(bytes) && bytes >= 0;
		}
		//#endregion
		//#region src/client/model.ts
		/**
		* Derive the lifecycle state of one shell call.
		* @param facts - the phase and settlement facts of the call.
		* @returns the row state.
		*/
		function shellState(facts) {
			if (!facts.settled) return facts.preparing ? "preparing" : "running";
			if (facts.errorCode === "interrupted") return "stopped";
			return facts.isError ? "error" : "ok";
		}
		/**
		* Derive the header model for one shell call.
		* @param facts - the phase, argument, and settlement facts of the call.
		* @param streamed - the streamed argument prefix (empty outside the preparing phase).
		* @returns the header model.
		*/
		function shellRowModel(facts, streamed) {
			const partial = facts.argsRaw === null ? streamed : "";
			return {
				state: shellState(facts),
				description: readArgument(facts.argsRaw, partial, "description"),
				command: readArgument(facts.argsRaw, partial, "command")
			};
		}
		/**
		* Read one string argument from the current argument material: the frozen
		* `argsRaw` when the call has dispatched arguments, otherwise the streamed
		* prefix. A blank or absent value reads as undefined.
		* @param argsRaw - frozen arguments, or null before dispatch.
		* @param partial - the streamed argument prefix.
		* @param key - the argument name.
		* @returns the argument text.
		*/
		function readArgument(argsRaw, partial, key) {
			const value = argsRaw === null ? partialString(partial, key) : stringMember(parseObject$1(argsRaw), key);
			return value === void 0 || value.trim() === "" ? void 0 : value;
		}
		/**
		* Parse one string member of a partially streamed JSON object. A prefix such as
		* `{"command": "git status", "desc` has no usable `JSON.parse`, yet the members
		* it has already completed are exactly what a running row has to show. A member
		* whose own closing quote has not arrived reads as absent, so the row never
		* shows a half-written escape sequence as literal text.
		* @param partial - the raw argument prefix.
		* @param key - the JSON member name.
		* @returns the member's decoded text, or undefined while it has not arrived.
		*/
		function partialString(partial, key) {
			const marker = `"${key}"`;
			let index = partial.indexOf(marker);
			if (index === -1) return void 0;
			index += marker.length;
			while (index < partial.length && isSpace(partial[index])) index += 1;
			if (partial[index] !== ":") return void 0;
			index += 1;
			while (index < partial.length && isSpace(partial[index])) index += 1;
			if (partial[index] !== "\"") return void 0;
			index += 1;
			let raw = "";
			while (index < partial.length) {
				const char = partial[index];
				if (char === "\\") {
					const escaped = partial[index + 1];
					if (escaped === void 0) return void 0;
					raw += char + escaped;
					index += 2;
					continue;
				}
				if (char === "\"") break;
				raw += char;
				index += 1;
			}
			if (partial[index] !== "\"") return void 0;
			try {
				return JSON.parse(`"${raw}"`);
			} catch {
				return raw;
			}
		}
		/** Character test for the streamed-prefix scanner. */
		function isSpace(char) {
			return char !== void 0 && /\s/.test(char);
		}
		/**
		* Parse a frozen argument payload, or undefined when it is not a JSON object.
		* @param argsRaw - the call's `argsRaw`.
		* @returns the parsed object.
		*/
		function parseObject$1(argsRaw) {
			try {
				const parsed = JSON.parse(argsRaw);
				return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : void 0;
			} catch {
				return;
			}
		}
		/** One string member of a parsed argument object. */
		function stringMember(args, key) {
			const value = args?.[key];
			return typeof value === "string" && value !== "" ? value : void 0;
		}
		/**
		* Build the terminal primitive's display copy from the conversation locale seat.
		* @param t - the render site's conversation locale seat.
		* @returns the full label set for {@link TerminalBlockProps}'s `labels`.
		*/
		function terminalBlockLabels(t) {
			return {
				signal: (signal) => t("terminal.signal", { signal }),
				exitCode: (code) => t("terminal.exitCode", { code }),
				noExitCode: t("terminal.noExitCode"),
				running: t("terminal.running"),
				failed: t("terminal.failed"),
				done: t("terminal.done"),
				copy: t("copy"),
				copied: t("copied"),
				noOutput: t("terminal.noOutput"),
				collapseAria: t("terminal.collapseAria"),
				collapse: t("collapse"),
				expandAria: (hidden) => t("terminal.expandAria", { n: hidden }),
				expand: (hidden) => t("terminal.expandRest", { n: hidden })
			};
		}
		/**
		* True when a settled terminal card reports a failing exit — a non-zero code or
		* a terminating signal. The shell tool settles a failing command as a completed
		* call (`isError` stays false: the exit status is result data), so this is the
		* row's only failure signal for that case.
		* @param model - a derived terminal card.
		* @returns whether the card's exit status is a failure.
		*/
		function terminalFailed(model) {
			const { exitCode, signal, running } = model.card;
			return running !== true && (exitCode !== void 0 && exitCode !== 0 || signal !== void 0);
		}
		/**
		* Validate a shell tool's arguments. A missing `description` is the
		* persistent-shell provider's schema, not a malformed call.
		* @param name - the wire Tool name.
		* @param args - the parsed arguments.
		* @returns the shell call, or null for another tool or malformed input.
		*/
		function shellCall(name, args) {
			if (name !== "bash" && name !== "pwsh") return null;
			const { command, description, timeoutMs, workdir, run_in_background: background } = args;
			if (typeof command !== "string" || command.trim() === "") return null;
			if (timeoutMs !== void 0 && (typeof timeoutMs !== "number" || !Number.isFinite(timeoutMs) || timeoutMs <= 0)) return null;
			if (workdir !== void 0 && typeof workdir !== "string") return null;
			if (background !== void 0 && typeof background !== "boolean") return null;
			if (!validEscalationFields(args)) return null;
			if (description === void 0) return {
				kind: "shell",
				command,
				description: void 0,
				workdir: void 0,
				persistent: true,
				background: false
			};
			if (typeof description !== "string" || description.trim() === "") return null;
			return {
				kind: "shell",
				command,
				description,
				workdir,
				persistent: false,
				background: background === true
			};
		}
		/**
		* Validate the optional escalation pair the shell tools share.
		* @param args - the parsed arguments.
		* @returns whether the declared escalation fields form a valid pair.
		*/
		function validEscalationFields(args) {
			const permission = args["sandbox_permissions"];
			const justification = args["justification"];
			if (permission === void 0 && justification === void 0) return true;
			if (permission !== "workspace-write" && permission !== "danger-full-access") return false;
			return typeof justification === "string" && justification.trim() !== "";
		}
		/**
		* Validate a persistent-terminal `terminal_send` call.
		* @param name - the wire Tool name.
		* @param args - the parsed arguments.
		* @returns the call, or null for another tool or malformed input.
		*/
		function terminalSendCall(name, args) {
			if (name !== "terminal_send") return null;
			const { sessionId, text, submit, run_in_background: background } = args;
			if (typeof sessionId !== "string" || sessionId === "" || typeof text !== "string") return null;
			if (submit !== void 0 && typeof submit !== "boolean") return null;
			if (background !== void 0 && typeof background !== "boolean") return null;
			return {
				kind: "terminal-send",
				text,
				sessionId,
				background: background === true
			};
		}
		/**
		* Parse the call head paired with one tool block.
		* @param block - preparing, dispatched, or settled tool block.
		* @returns the name and object arguments, or null during preparation or for a windowless call.
		*/
		function parsedToolCall(block) {
			const head = block.argsRaw === void 0 ? block.call : block.name === void 0 ? null : {
				name: block.name,
				argsRaw: block.argsRaw
			};
			if (head === null || head === void 0) return null;
			const args = parseObject$1(head.argsRaw);
			return args === void 0 ? null : {
				name: head.name,
				args
			};
		}
		/**
		* The exact single text block the first-party card derivations consume.
		* @param block - a settled tool result.
		* @returns its text, or undefined for any other content layout.
		*/
		function singleResultText(block) {
			if (block.content.length !== 1) return void 0;
			const only = block.content[0];
			return only?.type === "text" ? only.text : void 0;
		}
		/**
		* Flatten a settled result's content blocks to display text (the shipped
		* `resultText`): text blocks verbatim, other block shapes as pretty JSON, with
		* the structured error's `name: code` line standing in for empty content.
		* @param node - the settled result node.
		* @returns the flattened result text (may be empty).
		*/
		function resultText(node) {
			const parts = [];
			for (const block of node.content) if (block.type === "text") parts.push(block.text);
			else parts.push(JSON.stringify(block, null, 2));
			if (parts.length === 0 && node.error !== void 0) parts.push(`${node.error.name}: ${node.error.code}`);
			return parts.join("\n");
		}
		/**
		* Parse the shell renderer's trailing status marker.
		* @param text - the rendered shell result text.
		* @returns the output with its exit code or signal extracted.
		*/
		function parseExitStatus(text) {
			const signal = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text);
			if (signal?.[1] !== void 0) return {
				output: text.slice(0, signal.index),
				signal: signal[1]
			};
			const exit = /\n\[exit code: (\d+)\]$/.exec(text);
			if (exit?.[1] !== void 0) return {
				output: text.slice(0, exit.index),
				exitCode: Number(exit[1])
			};
			return {
				output: text,
				exitCode: 0
			};
		}
		/**
		* Derive the terminal card for a shell or terminal-send call.
		* @param block - running or settled tool block.
		* @param sessionCwd - session workspace root used to resolve a relative workdir.
		* @returns locale-neutral terminal-card data, or null when the generic path owns the call.
		*/
		function terminalCardModel(block, sessionCwd) {
			const parsed = parsedToolCall(block);
			if (parsed === null) return null;
			const call = shellCall(parsed.name, parsed.args) ?? terminalSendCall(parsed.name, parsed.args);
			if (call === null || call.background) return null;
			const copy = call.kind === "shell" ? {
				kind: "shell",
				command: call.command,
				description: call.description
			} : {
				kind: "terminal-send",
				text: call.text,
				sessionId: call.sessionId
			};
			const cwd = resolveTerminalCwd(call.kind === "shell" ? call.workdir : void 0, sessionCwd);
			if (block.kind === void 0) return {
				copy,
				card: {
					cwd,
					output: void 0,
					exitCode: void 0,
					signal: void 0,
					running: true
				}
			};
			if (block.isError === true || call.kind === "shell" && call.persistent) return null;
			if (isSpilledShellCall(parsed.name, block)) return null;
			if (block.content === void 0) return null;
			const output = singleResultText({ content: block.content });
			if (output === void 0) return null;
			const status = call.kind === "terminal-send" ? { output } : parseExitStatus(output);
			return {
				copy,
				card: {
					cwd,
					output: status.output,
					exitCode: status.exitCode,
					signal: status.signal,
					running: false
				}
			};
		}
		/**
		* A running call as {@link terminalCardModel} reads it: the dispatched arguments
		* beside the call's wire name, with no settlement discriminant — which is exactly
		* the "still running" marker the derivation keys on. Without this the row has no
		* card while a command runs, and therefore no command banner, leaving the
		* bare-argument fallback as the only thing on screen.
		* The name is always `bash`: both shell tools share one row and one argument
		* schema, and the derivation accepts either wire name.
		* @param argsRaw - the dispatched call's argument JSON, or null before dispatch.
		* @returns the running block, or null when no arguments have arrived.
		*/
		function runningCallBlock(argsRaw) {
			return argsRaw === null || argsRaw === "" ? null : {
				name: "bash",
				argsRaw
			};
		}
		/**
		* Format a shell call's argument payload for the IN/OUT fallback card. The
		* payload is reproduced WHOLE, `command` included: this card is reached only
		* when the terminal card refused the call (a persistent shell's call, a spill
		* preview, a cancellation), and then nothing else on the row says what the
		* command was. When a terminal card does exist, the command renders in that
		* card's banner and this body is not used at all.
		* @param argsRaw - the frozen argument JSON.
		* @returns the pretty-printed arguments, or the raw text when they do not parse.
		*/
		function formatArguments(argsRaw) {
			const args = parseObject$1(argsRaw);
			return args === void 0 ? argsRaw : JSON.stringify(args, null, 2);
		}
		/**
		* Whether a settled result carries a spill-policy footer, which puts the call
		* on the generic path: the footer can hide the exit marker the terminal card
		* reads its status from.
		* @param name - the wire Tool name.
		* @param block - the settled result.
		* @returns whether the shell output must stay generic.
		*/
		function isSpilledShellCall(name, block) {
			const parsed = parsedToolCall(block);
			if (parsed === null) return false;
			const call = shellCall(name, parsed.args);
			if (call === null || call.background) return false;
			if (block.content === void 0) return false;
			const output = singleResultText({ content: block.content });
			return output !== void 0 && hasSpillNotice(output);
		}
		/**
		* Whether a settled root call comes from a persistent shell, whose result can
		* report resets and partial output without one process exit status and
		* therefore stays on the generic path.
		* @param block - the settled tool result.
		* @returns whether it is a persistent-shell call.
		*/
		function isSettledPersistentShellCall(block) {
			if (block.parentCallId !== void 0) return false;
			const parsed = parsedToolCall(block);
			if (parsed === null) return false;
			return shellCall(parsed.name, parsed.args)?.persistent === true;
		}
		/**
		* Resolve a shell call's workdir for display: an absolute path as-is, a
		* relative one joined under the session workspace, and an omitted one as the
		* session workspace itself.
		* @param workdir - the raw call's workdir, if any.
		* @param sessionCwd - the session workspace root, if known.
		* @returns the working directory for the prompt label.
		*/
		function resolveTerminalCwd(workdir, sessionCwd) {
			if (workdir === void 0 || workdir === "") return sessionCwd;
			if (sessionCwd === void 0 || sessionCwd === "") return normalizeSegments(workdir);
			return normalizeSegments(resolveWorkspacePath(sessionCwd, workdir));
		}
		/**
		* Collapse `.` and `..` segments so the prompt label names the directory the
		* command actually ran in. Separators stay as authored; a `..` that would climb
		* past a root is dropped, which is what a filesystem does with it.
		* @param path - a joined or absolute path, possibly carrying `.`/`..` segments.
		* @returns the same path with those segments resolved.
		*/
		function normalizeSegments(path) {
			if (!/(?:^|[/\\])\.\.?(?:[/\\]|$)/.test(path)) return path;
			const unc = /^[/\\]{2}([^/\\]+)[/\\]+([^/\\]+)/.exec(path);
			if (unc !== null) {
				const [matched, server, share] = unc;
				const root = `\\\\${String(server)}\\${String(share)}`;
				const rest = collapse(path.slice(matched.length), true);
				return rest === "" ? root : `${root}\\${rest}`;
			}
			const separator = path.includes("\\") && !path.includes("/") ? "\\" : "/";
			const rooted = /^[/\\]/.test(path);
			const drive = /^[A-Za-z]:/.exec(path)?.[0] ?? "";
			const body = collapse(path.slice(drive.length), rooted || drive !== "", separator);
			const leading = rooted ? separator : "";
			return drive === "" ? `${leading}${body}` : `${drive}${rooted ? leading : separator}${body}`;
		}
		/**
		* Collapse the `.`/`..` segments of a path body against a known root state.
		* @param body - the path after any drive letter or UNC root.
		* @param rooted - whether a `..` at the body's top is dropped.
		* @param separator - separator to rejoin with.
		* @returns the collapsed body.
		*/
		function collapse(body, rooted, separator = "/") {
			const kept = [];
			for (const segment of body.split(/[/\\]/)) {
				if (segment === "" || segment === ".") continue;
				if (segment === "..") {
					if (kept.length > 0 && kept[kept.length - 1] !== "..") kept.pop();
					else if (!rooted) kept.push(segment);
					continue;
				}
				kept.push(segment);
			}
			return kept.join(separator);
		}
		/** Known tool name -> variant. */
		const TOOL_VARIANTS = {
			bash: "bash",
			pwsh: "bash",
			read: "read",
			read_image: "read",
			web_fetch: "read",
			web_search: "search",
			grep: "search",
			glob: "search",
			write: "write",
			edit: "edit",
			run_code: "code"
		};
		/** Locale key per generic row variant. */
		const VARIANT_TITLE_KEYS = {
			search: "tool.title.search",
			read: "tool.title.read",
			bash: "tool.title.bash",
			write: "tool.title.write",
			edit: "tool.title.edit",
			code: "tool.title.code",
			others: "tool.title.generic"
		};
		/** Tool-owned titles that refine a generic row variant without replacing it. */
		const TOOL_TITLE_KEYS = {
			pwsh: "tool.title.pwsh",
			read_image: "tool.title.readImage"
		};
		/**
		* Classify a tool name into its row variant.
		* @param toolName - wire tool name.
		* @returns the matching variant, `others` when unknown.
		*/
		function classifyTool(toolName) {
			return TOOL_VARIANTS[toolName] ?? "others";
		}
		/**
		* Select a tool-owned or generic title key without reading arguments.
		* @param toolName - wire tool name.
		* @returns the locale key for the row title.
		*/
		function toolTitleKey(toolName) {
			return TOOL_TITLE_KEYS[toolName] ?? VARIANT_TITLE_KEYS[classifyTool(toolName)];
		}
		/** Summary key preference per variant. */
		const SUMMARY_KEYS = {
			bash: ["description", "command"],
			read: [
				"path",
				"file_path",
				"url"
			],
			search: [
				"query",
				"pattern",
				"url"
			],
			write: ["path", "file_path"],
			edit: ["path", "file_path"],
			code: ["description"],
			others: []
		};
		/** The first line of a possibly multi-line value. */
		function firstLine(text) {
			const newline = text.indexOf("\n");
			return newline === -1 ? text : text.slice(0, newline);
		}
		/** The first non-empty string argument among `keys`. */
		function pickString(args, keys) {
			for (const key of keys) {
				const value = args[key];
				if (typeof value === "string" && value !== "") return value;
			}
		}
		/**
		* Derive a row's one-line summary from its argument payload (the shipped rule:
		* the variant's preferred keys first, then any string the call carries).
		* @param variant - the row variant.
		* @param argsRaw - the frozen argument JSON.
		* @returns the summary text.
		*/
		function deriveSummary(variant, argsRaw) {
			const args = parseObject$1(argsRaw);
			if (args === void 0) return firstLine(argsRaw);
			if (variant === "search" && Array.isArray(args["queries"])) {
				const queries = args["queries"].filter((query) => typeof query === "string" && query !== "");
				if (queries.length > 0) return queries.map(firstLine).join(", ");
			}
			const picked = pickString(args, SUMMARY_KEYS[variant]);
			if (picked !== void 0) return firstLine(picked);
			for (const value of Object.values(args)) if (typeof value === "string" && value !== "") return firstLine(value);
			return firstLine(argsRaw);
		}
		/**
		* Derive a row's display summary, relative to the session workspace and with a
		* POSIX home root abbreviated to `~`.
		* @param variant - the row variant.
		* @param argsRaw - the frozen argument JSON.
		* @param cwd - session workspace root.
		* @param home - host account home.
		* @returns the display summary.
		*/
		function rowSummary(variant, argsRaw, cwd, home) {
			return abbreviateHomePath(relativizeToCwd(deriveSummary(variant, argsRaw), cwd), home);
		}
		/** Whether a path uses a Windows drive or UNC prefix. */
		function isWindowsStylePath(value) {
			return /^[A-Za-z]:[/\\]/.test(value) || value.startsWith("\\\\");
		}
		/**
		* Strip the workspace root from a workspace-rooted absolute path (display only).
		* @param text - the path to shorten.
		* @param cwd - session workspace root; absent or empty leaves the path unchanged.
		* @returns the path relative to the workspace root, or unchanged when it is not rooted there.
		*/
		function relativizeToCwd(text, cwd) {
			if (cwd === void 0 || cwd === "") return text;
			const root = cwd.replace(/[/\\]+$/, "");
			if (text.startsWith(`${root}/`) || text.startsWith(`${root}\\`)) return text.slice(root.length + 1);
			return text;
		}
		/**
		* Abbreviate a POSIX home directory for display.
		* @param path - absolute or already-short display path.
		* @param home - host account home; absent skips abbreviation.
		* @returns `~` or `~/…` for the POSIX home and its descendants, otherwise `path`.
		*/
		function abbreviateHomePath(path, home) {
			if (home === void 0 || home === "") return path;
			if (isWindowsStylePath(path) || isWindowsStylePath(home)) return path;
			const root = home.replace(/\/+$/, "");
			if (root === "" || root === "/") return path;
			if (path.replace(/\/+$/, "") === root) return "~";
			if (path.startsWith(`${root}/`)) return `~${path.slice(root.length)}`;
			return path;
		}
		/**
		* Resolve a workspace-relative path into the spelling the Host uses.
		* @param cwd - session workspace root, when known.
		* @param path - absolute or workspace-relative path.
		* @returns an absolute path when a workspace root is available, otherwise the original path.
		*/
		function resolveWorkspacePath(cwd, path) {
			if (path.startsWith("/") || isWindowsStylePath(path)) return path;
			if (cwd === void 0 || cwd === "") return path;
			const separator = isWindowsStylePath(cwd) && cwd.includes("\\") ? "\\" : "/";
			return `${cwd.replace(/[/\\]+$/, "")}${separator}${path.replace(/^[/\\]+/, "")}`;
		}
		//#endregion
		//#region src/client/running-time.ts
		/**
		* Running-call clock: how long the current command has been going, and the
		* deadline it was given.
		*
		* The start instant is the tool call's own `time` — the epoch milliseconds the
		* dispatch stage began, which the framework stamps on every call block. The tick
		* is a plain 1-second interval, owned by the row and stopped the moment the call
		* settles, so a finished command never keeps a timer alive.
		*
		* The timeout side reports only what the command itself states. See
		* {@link timeoutLabel} for why the executor's default is deliberately not
		* substituted.
		*/
		/** How often the elapsed label refreshes, in milliseconds. */
		const ELAPSED_TICK_MS = 1e3;
		/**
		* Parse an argument payload into an object, or undefined when it is not one.
		* `JSON.parse` returns `any`, so the value is narrowed before use; this module
		* stays dependency-free rather than importing the model's parser.
		* @param argsRaw - the frozen argument JSON.
		* @returns the parsed object, or undefined.
		*/
		function parseObject(argsRaw) {
			try {
				const parsed = JSON.parse(argsRaw);
				return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : void 0;
			} catch {
				return;
			}
		}
		/** One second in milliseconds. */
		const SECOND = 1e3;
		/**
		* Format a duration for display. Sub-minute durations read in whole seconds (the
		* tick's own resolution); a minute or more reads as `Nm Ns`, and an hour or more
		* as `Nh Nm`. Note that the seconds component is truncated while the minutes
		* component derives from the same whole-second total, so the final seconds of a
		* minute read `1m 0s` rather than `0m 59s`. A duration that is not finite or is
		* negative reads as zero, so a clock skew between the Host's stamp and this
		* browser cannot render a negative age.
		* @param durationMs - the duration in milliseconds.
		* @returns the compact duration label.
		*/
		function formatElapsed(durationMs) {
			const total = Number.isFinite(durationMs) && durationMs > 0 ? Math.floor(durationMs / SECOND) : 0;
			if (total < 60) return `${total}s`;
			if (total < 3600) return `${Math.floor(total / 60)}m ${total % 60}s`;
			return `${Math.floor(total / 3600)}h ${Math.floor(total % 3600 / 60)}m`;
		}
		/**
		* Milliseconds between a call's start stamp and now.
		* @param startedAt - the call's `time`, or undefined when the block carries none.
		* @param now - the current epoch milliseconds.
		* @returns the elapsed duration, never negative.
		*/
		function elapsedSince(startedAt, now) {
			if (startedAt === void 0) return 0;
			return Math.max(0, now - startedAt);
		}
		/**
		* The effective timeout label for a shell call, or null when the call does not
		* state one.
		*
		* Only an EXPLICIT `timeoutMs` is reported. Reading the executor's own default
		* would mean guessing: the deadline is resolved below this layer from the
		* executor's config, clamped by that executor's `maxTimeoutMs`, and the
		* persistent providers default elsewhere again. A value the command did not
		* state would therefore be an invented one, so an absent argument shows nothing
		* and the row falls back to the elapsed readout alone.
		* @param argsRaw - the call's argument JSON, or null before dispatch.
		* @returns the formatted timeout, or null when the call states none.
		*/
		function timeoutLabel(argsRaw) {
			if (argsRaw === null || argsRaw === "") return null;
			const requested = parseObject(argsRaw)?.["timeoutMs"];
			if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) return null;
			return formatElapsed(requested);
		}
		//#endregion
		//#region \0dsh-css:src/client/shell-row.module.css.mjs
		const css = ".shell-row-module_card{--dsh-content-font-delta:0px;flex-direction:column;display:flex}.shell-row-module_root{height:auto;min-height:calc(24px + var(--dsh-content-font-delta,0px));min-width:0;color:var(--dsw-alias-label-tertiary);align-items:flex-start;transition:color .1s;display:flex;overflow:visible}.shell-row-module_root[data-expandable]{cursor:pointer}.shell-row-module_root:hover{color:var(--dsw-alias-label-secondary)}@media (prefers-reduced-motion:reduce){.shell-row-module_root{transition:none}}.shell-row-module_leading{width:calc(16px + var(--dsh-content-font-delta,0px));height:calc(16px + var(--dsh-content-font-delta,0px));margin-right:6px;margin-top:calc(12px + var(--dsh-content-font-delta,0px) / 2 - 8px);color:inherit;flex:none;justify-content:center;align-items:center;display:inline-flex;position:relative}.shell-row-module_leading svg:not([data-state]){width:calc(14px + var(--dsh-content-font-delta,0px));height:calc(14px + var(--dsh-content-font-delta,0px))}.shell-row-module_chevron{color:inherit}.shell-row-module_iconIdle{opacity:1;transition:opacity .1s;display:inline-flex}.shell-row-module_chevronHover{opacity:0;margin:auto;transition:opacity .1s;position:absolute;inset:0}.shell-row-module_root:hover .shell-row-module_iconIdle{opacity:0}.shell-row-module_root:hover .shell-row-module_chevronHover{opacity:1}.shell-row-module_contentLayout{flex:auto;align-items:center;min-width:0;display:flex}.shell-row-module_content{min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));flex:auto;align-items:center;display:flex}.shell-row-module_title{font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));flex:none}.shell-row-module_sep{background:var(--dsw-alias-label-caption);border-radius:1px;flex:none;width:2px;height:2px;margin:0 8px}.shell-row-module_summary{text-overflow:ellipsis;white-space:nowrap;min-width:0;font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));flex:auto;overflow:hidden}.shell-row-module_errorSummary{color:var(--dsw-alias-state-error-primary)}.shell-row-module_terminal{--dsl-terminal-font:var(--dsw-font-markdown-code-block-small);--dsl-terminal-line-height:18px;--dsl-terminal-output-max-height:224px;--dsl-terminal-command-whitespace:pre-wrap;--dsl-terminal-line-whitespace:pre-wrap;border:.5px solid var(--dsw-alias-border-l1);margin:4px 0 4px 4px}.shell-row-module_elapsed{color:var(--dsw-alias-label-caption);font-family:var(--ds-font-family-code,monospace);font-size:var(--dsh-content-font-size-secondary,13px);line-height:calc(24px + var(--dsh-content-font-delta,0px));font-variant-numeric:tabular-nums;flex:none;margin-left:8px}.shell-row-module_syntheticBody{flex-direction:column;display:flex}.shell-row-module_ioCard{border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-lg);background:var(--dsw-alias-markdown-code-block);font:var(--dsw-font-markdown-code-block-small);flex-direction:column;margin:4px 0 4px 4px;display:flex}.shell-row-module_ioSection{grid-template-columns:max-content 1fr;align-items:baseline;column-gap:14px;max-height:150px;padding:12px 16px;display:grid;overflow-y:auto}.shell-row-module_ioSection::-webkit-scrollbar-thumb{border-radius:var(--dsw-radius-sm);background-clip:padding-box;border:2px solid #0000}.shell-row-module_ioSection::-webkit-scrollbar-track{margin:6px 0}.shell-row-module_ioLabel{color:var(--dsw-alias-label-caption);align-self:start;position:sticky;top:0}.shell-row-module_ioDivider{background:var(--dsw-alias-border-l2);flex:none;height:.5px}.shell-row-module_ioText{white-space:pre-wrap;word-break:break-word;min-width:0;color:var(--dsw-alias-label-secondary)}.shell-row-module_ioText[data-error]{color:var(--dsw-alias-state-error-primary)}.shell-row-module_bodyWrap{flex-direction:column;display:flex}.shell-row-module_inspectButton{border:.5px solid var(--dsw-alias-border-l4);corner-shape:round;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-secondary);cursor:pointer;opacity:0;border-radius:999px;align-self:flex-start;align-items:center;gap:4px;margin:4px 0 2px 4px;padding:2px 8px;font-size:11px;line-height:16px;transition:opacity .1s;display:inline-flex}.shell-row-module_card:hover .shell-row-module_inspectButton,.shell-row-module_inspectButton:focus-visible{opacity:1}.shell-row-module_inspectButton:hover{background:var(--dsw-alias-interactive-bg-hover-solid);color:var(--dsw-alias-label-primary)}.shell-row-module_visuallyHidden{clip:rect(0 0 0 0);white-space:nowrap;width:1px;height:1px;position:absolute;overflow:hidden}";
		const tagId = "@dsh-external/dsh-shell-expand/shell-row.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-shell-expand";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var shell_row_module_css_default = {
			"bodyWrap": "shell-row-module_bodyWrap",
			"card": "shell-row-module_card",
			"chevron": "shell-row-module_chevron",
			"chevronHover": "shell-row-module_chevronHover",
			"content": "shell-row-module_content",
			"contentLayout": "shell-row-module_contentLayout",
			"elapsed": "shell-row-module_elapsed",
			"errorSummary": "shell-row-module_errorSummary",
			"iconIdle": "shell-row-module_iconIdle",
			"inspectButton": "shell-row-module_inspectButton",
			"ioCard": "shell-row-module_ioCard",
			"ioDivider": "shell-row-module_ioDivider",
			"ioLabel": "shell-row-module_ioLabel",
			"ioSection": "shell-row-module_ioSection",
			"ioText": "shell-row-module_ioText",
			"leading": "shell-row-module_leading",
			"root": "shell-row-module_root",
			"sep": "shell-row-module_sep",
			"summary": "shell-row-module_summary",
			"syntheticBody": "shell-row-module_syntheticBody",
			"terminal": "shell-row-module_terminal",
			"title": "shell-row-module_title",
			"visuallyHidden": "shell-row-module_visuallyHidden"
		};
		//#endregion
		//#region src/client/shell-row.tsx
		/**
		* The taken-over shell row (one implementation for `bash` and `pwsh`).
		*
		* It reproduces the shipped bash toolview's chrome — the same `ToolRow`-family
		* geometry and `--dsw-*` tokens, the same leading icon that yields to a state
		* dot, the same hover-chevron disclosure, the same `TerminalBlock` for output
		* (ANSI colors, copy control, exit-status pill, height cap), and the same IN/OUT
		* fallback for shell calls that carry no terminal-card material — and changes
		* exactly two behaviors:
		*
		* 1. **Open by default.** The row expands itself on mount, including for a
		*    replayed historical session, and again whenever the enclosing Turn resets
		*    the disclosure seat. A collapse the user performed holds until then.
		* 2. **The command wraps.** The shipped row's collapsed content is the call's
		*    `description` in a single non-wrapping ellipsized line, and the command
		*    lives in the terminal card's banner, which wraps only when a caller
		*    rebinds its CSS variable. This row renders the command in the header where
		*    it wraps onto as many lines as it needs, and rebinds that variable so the
		*    banner wraps too.
		*/
		/** The row's business glyph, shared by every phase. */
		const SHELL_ICON = /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconApiOutlineRegular, { size: 14 });
		/** A preparing call's facts: no argument payload has arrived yet. */
		const PREPARING_FACTS = {
			settled: false,
			argsRaw: null,
			preparing: true,
			isError: false,
			errorCode: void 0
		};
		/**
		* Visually hidden lifecycle label for the state that color alone would carry.
		* @param state - the row's lifecycle state.
		* @param t - the conversation locale seat.
		* @returns the label, or null for the states that need none.
		*/
		function stateStatus(state, t) {
			switch (state) {
				case "preparing": return t("row.preparing");
				case "running": return t("bash.running");
				case "error": return t("bash.failed");
				case "stopped": return t("bash.stopped");
				default: return null;
			}
		}
		/**
		* Leading-slot substitution for the state a shell call reports through its
		* result rather than its settlement: an error dot replaces the business glyph,
		* a warning dot marks an interruption.
		* @param state - the row's lifecycle state.
		* @returns the leading node.
		*/
		function leadingFor(state) {
			switch (state) {
				case "error": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "error" });
				case "stopped": return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, { state: "warning" });
				default: return SHELL_ICON;
			}
		}
		/**
		* Tick once a second while a command is running, and hand back the current
		* epoch milliseconds so the elapsed label re-renders.
		*
		* Called unconditionally — the Hook order must not depend on the phase — with
		* `running` as the plain value that decides whether the interval is armed. A
		* settled call leaves the interval torn down and the last tick's stamp in place,
		* which nothing reads.
		* @param running - whether the call is still executing.
		* @returns the latest tick's epoch milliseconds.
		*/
		function useRunningTick(running) {
			const [now, setNow] = (0, react.useState)(() => Date.now());
			(0, react.useEffect)(() => {
				if (!running) return () => {};
				setNow(Date.now());
				const timer = setInterval(() => {
					setNow(Date.now());
				}, ELAPSED_TICK_MS);
				return () => {
					clearInterval(timer);
				};
			}, [running]);
			return now;
		}
		/**
		* The registered shell toolview: one explicit phase per dispatch, exactly like
		* the shipped bash row.
		*
		* Dispatching to a per-phase component is not a style choice — it is what keeps
		* the Hook order stable. A keyed row's component instance survives the
		* `preparing → start → result` transitions, and the preparing phase is the only
		* one that may call `useToolCallArgumentsPartial` (the seat is a no-op outside
		* it). Calling that Hook from a single component that also renders the later
		* phases renders FEWER Hooks on the transition than on the first render, which
		* React rejects with error #300 ("Rendered fewer hooks than expected") and the
		* slot surfaces as `slot entry crashed in 'tool.call.toolview'`. Switching the
		* element TYPE instead unmounts the preparing component, so each component's
		* own Hook list stays fixed for its whole life.
		* @param props - keyed toolview owner currency plus the locale seat.
		* @returns the preparing row, or the dispatched/settled row.
		*/
		function ShellRow(props) {
			return props.phase === "preparing" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PreparingShellRow, { ...props }) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(StartedShellRow, { ...props });
		}
		/**
		* The preparing prefix: a named call whose arguments have not arrived. It shows
		* the call's title and lifecycle state and nothing else — there is no command
		* to show yet, and no body to expand.
		* @param props - preparing-phase row inputs.
		* @returns the non-expandable preparing row.
		*/
		function PreparingShellRow({ toolName, useDisclosure, useToolCallArgumentsPartial, t }) {
			const streamed = useToolCallArgumentsPartial();
			const { expanded, toggle } = useDisclosure();
			const model = shellRowModel(PREPARING_FACTS, streamed);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellRowChrome, {
				toolName,
				model,
				t,
				expanded,
				toggle,
				argsRaw: null,
				settledBlock: void 0,
				running: false,
				startedAt: void 0,
				sessionCwd: void 0,
				home: void 0,
				inspect: void 0
			});
		}
		/**
		* The dispatched and settled row.
		* @param props - start- or result-phase row inputs.
		* @returns the disclosure row.
		*/
		function StartedShellRow({ phase, toolName, block, cwd, home, inspect, useDisclosure, t }) {
			const { expanded, setExpanded, toggle } = useDisclosure();
			(0, react.useEffect)(() => {
				setExpanded(true);
			}, [setExpanded]);
			const settled = phase === "result";
			const argsRaw = settled ? block.call?.argsRaw ?? "" : block.argsRaw;
			const model = shellRowModel(settled ? {
				settled: true,
				argsRaw,
				preparing: false,
				isError: block.isError,
				errorCode: block.error?.code
			} : {
				settled: false,
				argsRaw,
				preparing: false,
				isError: false,
				errorCode: void 0
			}, "");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(ShellRowChrome, {
				toolName,
				model,
				t,
				expanded,
				toggle,
				argsRaw,
				settledBlock: settled ? block : void 0,
				running: !settled,
				startedAt: block.time,
				sessionCwd: cwd,
				home,
				inspect
			});
		}
		/**
		* The shell row's chrome, split from the disclosure seat so it takes only the
		* inputs it reads.
		* @param props - the narrowed row inputs.
		* @returns the disclosure row and its expanded body.
		*/
		function ShellRowChrome({ toolName, model, t, expanded, toggle, argsRaw, settledBlock, running, startedAt, sessionCwd, home, inspect }) {
			const now = useRunningTick(running);
			const elapsed = running ? formatElapsed(elapsedSince(startedAt, now)) : null;
			const timeout = timeoutLabel(argsRaw);
			const clock = elapsed === null ? null : timeout === null ? elapsed : `${elapsed} / ${timeout}`;
			const cardSource = (0, react.useMemo)(() => settledBlock ?? runningCallBlock(argsRaw), [settledBlock, argsRaw]);
			const card = (0, react.useMemo)(() => cardSource === null ? null : terminalCardModel(cardSource, sessionCwd), [cardSource, sessionCwd]);
			const state = model.state === "ok" && card !== null && terminalFailed(card) ? "error" : model.state;
			const output = (0, react.useMemo)(() => settledBlock === void 0 ? null : resultText(settledBlock) || null, [settledBlock]);
			const body = (0, react.useMemo)(() => argsRaw === null || argsRaw === "" ? null : formatArguments(argsRaw), [argsRaw]);
			const synthetic = running && card === null && body !== null && model.command !== void 0;
			const labels = (0, react.useMemo)(() => terminalBlockLabels(t), [t]);
			const terminal = (0, react.useMemo)(() => {
				if (card === null) return null;
				return {
					...card.copy.kind === "shell" ? {
						command: card.copy.command,
						description: card.copy.description
					} : {
						command: card.copy.text === "" ? t("terminal.sendInput") : card.copy.text,
						description: t("terminal.session", { sessionId: card.copy.sessionId })
					},
					...card.card
				};
			}, [card, t]);
			const summary = (0, react.useMemo)(() => model.description ?? (argsRaw === null || argsRaw === "" ? "" : rowSummary(classifyTool(toolName), argsRaw, sessionCwd, home)), [
				model.description,
				argsRaw,
				toolName,
				sessionCwd,
				home
			]);
			settledBlock !== void 0 && isSpilledShellCall(toolName, settledBlock);
			settledBlock !== void 0 && isSettledPersistentShellCall(settledBlock);
			const hasGeneric = synthetic || body !== null || output !== null;
			const expandable = terminal !== null || hasGeneric;
			const open = expanded && expandable;
			const status = stateStatus(state, t);
			const onKeyDown = (0, react.useCallback)((event) => {
				if (!expandable || event.key !== "Enter" && event.key !== " ") return;
				event.preventDefault();
				toggle();
			}, [expandable, toggle]);
			const shimmering = state === "running" || state === "preparing";
			const fallback = output === null ? t("bash.running") : output.split("\n")[0] ?? "";
			const branch = terminal !== null ? "terminal" : synthetic ? "running" : hasGeneric ? "arguments" : "empty";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: shell_row_module_css_default.card,
				"data-shell-row": "",
				"data-wraps": "",
				"data-tool": toolName,
				"data-state": state,
				"data-shell-branch": branch,
				"data-shell-stage": running ? "running" : settledBlock === void 0 ? "preparing" : "settled",
				"data-shell-args": argsRaw === null || argsRaw === "" ? "empty" : "present",
				"data-shell-card": card === null ? "none" : card.copy.kind,
				children: [status !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: shell_row_module_css_default.visuallyHidden,
					children: status
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.DisclosureRow, {
					rowClassName: shell_row_module_css_default.root,
					leadingClassName: shell_row_module_css_default.leading,
					contentClassName: shell_row_module_css_default.content,
					contentLayoutClassName: shell_row_module_css_default.contentLayout,
					chevronClassName: shell_row_module_css_default.chevron,
					titleClassName: shell_row_module_css_default.title,
					icon: leadingFor(state),
					title: t(toolTitleKey(toolName)),
					running: shimmering,
					open,
					expandable,
					expandOnRowClick: true,
					keepContentWhenOpen: true,
					onToggle: toggle,
					collapsedContent: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: shell_row_module_css_default.sep,
							"aria-hidden": true
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: clsx(shell_row_module_css_default.summary, state === "error" && shell_row_module_css_default.errorSummary),
							children: summary !== "" ? summary : fallback
						}),
						clock !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: shell_row_module_css_default.elapsed,
							children: clock
						})
					] }),
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: shell_row_module_css_default.bodyWrap,
						"data-shell-body": "",
						onKeyDown,
						children: [terminal !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
							command: terminal.command,
							cwd: terminal.cwd,
							home,
							output: terminal.output,
							exitCode: terminal.exitCode,
							signal: terminal.signal,
							running: terminal.running,
							maxLines: Infinity,
							labels,
							className: shell_row_module_css_default.terminal
						}) : synthetic && model.command !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: shell_row_module_css_default.syntheticBody,
							"data-shell-running-body": "",
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.TerminalBlock, {
								command: model.command,
								cwd: sessionCwd,
								home,
								running: true,
								runStateDot: false,
								maxLines: Infinity,
								labels,
								className: shell_row_module_css_default.terminal
							})
						}) : (body !== null || output !== null) && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: shell_row_module_css_default.ioCard,
							children: [
								body !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: shell_row_module_css_default.ioSection,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: shell_row_module_css_default.ioLabel,
										children: t("row.input")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: shell_row_module_css_default.ioText,
										children: body
									})]
								}),
								body !== null && output !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: shell_row_module_css_default.ioDivider,
									"aria-hidden": true
								}),
								output !== null && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: shell_row_module_css_default.ioSection,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: shell_row_module_css_default.ioLabel,
										children: t("row.output")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: shell_row_module_css_default.ioText,
										"data-error": state === "error" || void 0,
										children: output
									})]
								})
							]
						}), inspect !== void 0 && /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: shell_row_module_css_default.inspectButton,
							onClick: inspect,
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconInspectOutlineRegular, {}), t("row.inspect")]
						})]
					})
				})]
			});
		}
		//#endregion
		//#region src/client/index.tsx
		/** Required service: the slot registry. */
		const inject = ["slots"];
		/** The wire tools rendered as shell calls (both share one command row). */
		const SHELL_TOOLS = ["bash", "pwsh"];
		/**
		* Dictionary namespace this row's copy is translated through. The shipped bash
		* row registers under the same one, so titles, states, and the IN/OUT/inspect
		* chrome follow the active locale exactly as the row it replaces does.
		*/
		const NS = "conversation";
		/**
		* Mount the shell rows into the keyed atomic Tool view slot at a priority that
		* shadows the shipped `bash` row.
		* @param ctx - client root context.
		*/
		function apply(ctx) {
			ctx.slots.inject("tool.call.toolview", function* () {
				for (const key of SHELL_TOOLS) yield ctx.slots.register({
					name: "tool.call.toolview",
					key,
					locale: NS,
					priority: -1
				}, ShellRow);
			});
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

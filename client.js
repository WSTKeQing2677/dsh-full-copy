/**
 * full-copy — Client half of the Full Copy bundle.
 *
 * Every completed Turn gets one 「完全复制」 entry in
 * `conversation.chat.turnTail`, which the Chat view renders just before the
 * host's own copy / branch action row. Clicking it writes one Markdown
 * document to the clipboard:
 *
 *   ## 思考      every reasoning block of the Turn, verbatim
 *   ## 正文      every assistant text block, in order
 *   ## 工具调用  one line per Tool call: `- [name] key=value`
 *
 * Tool results are never copied — only the call head is summarized. The Turn's
 * finalized `assistant-step` data is read from the Chat target at click time
 * (no subscription is needed because a turn-tail exists only for a completed
 * Turn); the Turn's `turn-tail` closing blocks are the fallback when the
 * loaded window carries no step data. Clipboard access degrades from
 * `navigator.clipboard.writeText` to a `document.execCommand('copy')` helper.
 */
window.__ModuleLoader__.load({
  id: 'dsh-full-copy',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'full-copy';
    /** Style tag identity used for the one injectable stylesheet. */
    const STYLE_ID = 'dsh-full-copy/styles';
    /** How long the transient copied / failed label stays visible. */
    const RESET_MS = 2000;
    /** Empty icon-adjacent copy fallbacks, used only if the locale seat is missing. */
    const FALLBACK = {
      label: '完全复制',
      copied: '已复制',
      failed: '复制失败',
      title: '复制本回合的思考、正文与工具调用摘要',
    };

    /** Simplified Chinese dictionary (the key-set source of truth). */
    const zh = {
      'button.label': '完全复制',
      'button.copied': '已复制',
      'button.failed': '复制失败',
      'button.title': '复制本回合的思考、正文与工具调用摘要',
    };

    /** English dictionary, checked complete against the zh key set. */
    const en = {
      'button.label': 'Copy full turn',
      'button.copied': 'Copied',
      'button.failed': 'Copy failed',
      'button.title': "Copy this turn's reasoning, response, and tool-call summaries",
    };

    /**
     * Only `--dsw-*` theme tokens are used, so light/dark and user skins style
     * the action without a second color source. The button stays a text action:
     * transparent until hover, like the icon actions it sits above.
     */
    const CSS = [
      '.dsh-full-copy-row{display:flex;align-items:center;gap:8px;margin-left:-6px}',
      '.dsh-full-copy-btn{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;height:28px;margin:0;padding:4px 8px;border:0;border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-tertiary);font:inherit;font-size:12px;line-height:18px;cursor:pointer;transition:color 80ms ease,background-color 80ms ease}',
      '.dsh-full-copy-btn:hover{color:var(--dsw-alias-label-secondary);background:var(--dsw-alias-interactive-bg-hover)}',
      '.dsh-full-copy-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:2px}',
      '.dsh-full-copy-btn[data-state="copied"]{color:var(--dsw-alias-state-business-primary)}',
      '.dsh-full-copy-btn[data-state="failed"]{color:var(--dsw-alias-state-error-primary)}',
    ].join('');

    /**
     * Argument keys worth showing as the call's "key parameters", most
     * informative first. Only the first three present scalar fields are used.
     * The leading four identify a Cordis inspection call; without them the line
     * shows fixed values like `platform=client, method=listSubTree` and hides
     * which provider or root was actually queried.
     */
    const ARG_KEYS = [
      'provider',
      'root',
      'event',
      'service',
      'description',
      'command',
      'file_path',
      'path',
      'pattern',
      'query',
      'url',
      'prompt',
      'goal',
      'name',
      'title',
      'label',
      'skill',
      'code',
      'language',
      'session_id',
    ];

    /**
     * Argument keys that are bodies, not identifiers. Printing them turns a tool line
     * into a wall of source code (`edit` / `write`), so they never appear as
     * "key parameters" — the call's identity is its path, not its payload.
     */
    const NOISE_KEYS = new Set(['old_string', 'new_string', 'content', 'content_base64', 'data']);

    /** Collapse whitespace and bound one argument value to a single short line. */
    function oneLine(value, max) {
      const text = String(value === null || value === undefined ? '' : value)
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length <= max) return text;
      return text.slice(0, max - 1) + '…';
    }

    /**
     * Summarize one Tool call's raw JSON arguments without copying its result.
     * @param raw - `argsRaw` string from the assistant tool-call block.
     * @returns `key=value, key=value`, or a bounded raw prefix when unparsable.
     */
    function summarizeArgs(raw) {
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (text === '') return '';
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (error) {
        return oneLine(text, 120);
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return oneLine(text, 120);
      }
      // One level of nesting carries real meaning: `cordis_inspect_query` puts the
      // discriminator (`root`, `entry`, `service`) inside `input`. Flatten that level so
      // it can compete for a slot; skip anything deeper, arrays, and body keys.
      const flat = new Map();
      for (const [key, value] of Object.entries(parsed)) {
        if (NOISE_KEYS.has(key)) continue;
        if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
          for (const [childKey, childValue] of Object.entries(value)) {
            if (NOISE_KEYS.has(childKey)) continue;
            if (childValue === null || childValue === undefined || typeof childValue === 'object') continue;
            flat.set(flat.has(childKey) ? key + '.' + childKey : childKey, childValue);
          }
          continue;
        }
        if (Array.isArray(value)) continue;
        flat.set(key, value);
      }

      const parts = [];
      /**
       * @param key - flattened argument name.
       * @param allowLong - priority keys may be long (`command`); generic fallback
       *   keys are skipped when their text is bulky.
       */
      const push = (key, allowLong) => {
        if (parts.length >= 3) return;
        if (!flat.has(key)) return;
        const value = flat.get(key);
        const text = String(value);
        if (!allowLong && text.length > 60) return;
        flat.delete(key);
        parts.push(key + '=' + oneLine(value, 120));
      };
      for (const key of ARG_KEYS) push(key, true);
      if (parts.length < 3) {
        for (const key of Array.from(flat.keys())) push(key, false);
      }
      return parts.join(', ');
    }

    /** Format one Tool call as a single bullet line. */
    function callLine(block) {
      const name = typeof block.name === 'string' && block.name !== '' ? block.name : 'tool';
      const summary = summarizeArgs(block.argsRaw);
      return summary === '' ? '- [' + name + ']' : '- [' + name + '] ' + summary;
    }

    /** Append every object block of one list, preserving order. */
    function appendBlocks(list, out) {
      if (!Array.isArray(list)) return;
      for (const block of list) {
        if (block !== null && typeof block === 'object') out.push(block);
      }
    }

    /**
     * Flatten the Turn's per-step Assistant data into one ordered block list.
     * `finalNode.blocks` covers a step whose streaming `blocks` were cleared.
     * @param steps - `assistant-step` data values for the Turn.
     * @param closingBlocks - fallback blocks from the Turn-tail closing assistant.
     * @returns ordered assistant blocks.
     */
    function collectBlocks(steps, closingBlocks) {
      const blocks = [];
      if (Array.isArray(steps)) {
        for (const step of steps) {
          if (step === null || typeof step !== 'object') continue;
          const own = Array.isArray(step.blocks) && step.blocks.length > 0
            ? step.blocks
            : step.finalNode && step.finalNode.blocks;
          appendBlocks(own, blocks);
        }
      }
      if (blocks.length === 0) appendBlocks(closingBlocks, blocks);
      return blocks;
    }

    /**
     * Read the closing assistant's blocks from Turn-scoped Location data. This
     * is the last-resort source when the Chat node store has no step data.
     * @param turn - TurnLocation owner currency.
     * @returns assistant blocks, or an empty list.
     */
    function closingBlocks(turn) {
      try {
        const data = turn && turn.data && typeof turn.data.get === 'function'
          ? turn.data.get('turn-tail')
          : undefined;
        const closing = data && data.closing;
        if (closing === null || closing === undefined) return [];
        if (Array.isArray(closing.blocks) && closing.blocks.length > 0) return closing.blocks;
        if (closing.finalNode && Array.isArray(closing.finalNode.blocks)) return closing.finalNode.blocks;
        return [];
      } catch (error) {
        console.warn('[full-copy] could not read turn-tail data', error);
        return [];
      }
    }

    /**
     * Build the copied Markdown. Empty sections are omitted; the caller treats
     * an empty result as "nothing to copy".
     */
    function buildMarkdown(blocks) {
      const reasoning = [];
      const body = [];
      const calls = [];
      for (const block of blocks) {
        const text = typeof block.text === 'string' ? block.text : '';
        if (block.kind === 'reasoning') {
          const trimmed = text.trim();
          if (trimmed !== '') reasoning.push(trimmed);
        } else if (block.kind === 'text') {
          const trimmed = text.trim();
          if (trimmed !== '') body.push(trimmed);
        } else if (block.kind === 'tool-call') {
          calls.push(callLine(block));
        }
      }
      const sections = [];
      if (reasoning.length > 0) sections.push('## 思考\n\n' + reasoning.join('\n\n'));
      if (body.length > 0) sections.push('## 正文\n\n' + body.join('\n\n'));
      if (calls.length > 0) sections.push('## 工具调用\n\n' + calls.join('\n'));
      return sections.join('\n\n');
    }

    /** Copy through a temporary off-screen textarea when the async API is absent. */
    function fallbackCopy(text) {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.top = '-9999px';
        area.style.left = '-9999px';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.focus();
        const selection = document.getSelection();
        const saved = selection !== null && selection !== undefined && selection.rangeCount > 0
          ? selection.getRangeAt(0)
          : null;
        area.select();
        area.setSelectionRange(0, area.value.length);
        const ok = document.execCommand('copy') === true;
        document.body.removeChild(area);
        if (saved !== null && selection !== null && selection !== undefined) {
          selection.removeAllRanges();
          selection.addRange(saved);
        }
        return ok;
      } catch (error) {
        console.warn('[full-copy] execCommand copy failed', error);
        return false;
      }
    }

    /** Write text to the clipboard, preferring the async Clipboard API. */
    async function copyText(text) {
      const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
      if (clipboard && typeof clipboard.writeText === 'function') {
        try {
          await clipboard.writeText(text);
          return true;
        } catch (error) {
          console.warn('[full-copy] clipboard.writeText failed, falling back', error);
        }
      }
      return fallbackCopy(text);
    }

    /**
     * Read the finalized Assistant blocks of one Turn from the Chat node store.
     * Resolved lazily on click so a session binding that appears after slot
     * registration is still usable.
     * @param ctx - Client plugin context.
     * @param sessionId - Session owning the rendered Turn.
     * @returns reader returning the Turn's `assistant-step` data values.
     */
    function createStepReader(ctx, sessionId) {
      return (turn) => {
        try {
          const binding = ctx.sessions.binding(sessionId);
          if (binding === undefined) return [];
          const chat = ctx.uiConversation.binding(binding).target('chat');
          if (chat === undefined) return [];
          const snapshot = chat.getSnapshot();
          if (snapshot === undefined) return [];
          const turnNumber = turn && typeof turn.turn === 'number' ? turn.turn : Number(turn);
          if (!Number.isSafeInteger(turnNumber)) return [];
          const source = snapshot.nodes.turnDataSource(turnNumber, 'assistant-step');
          const steps = source && typeof source.getSnapshot === 'function' ? source.getSnapshot() : [];
          return Array.isArray(steps) ? steps : [];
        } catch (error) {
          console.warn('[full-copy] could not read Chat step data', error);
          return [];
        }
      };
    }

    /**
     * One completed Turn's copy action.
     * @param props - Turn owner currency, locale seat, and the step reader.
     */
    function FullCopyButton({ turn, t, readAssistantBlocks }) {
      const [state, setState] = React.useState('idle');
      const timer = React.useRef(0);

      React.useEffect(() => () => {
        if (timer.current) clearTimeout(timer.current);
      }, []);

      const translate = (key, fallback) => {
        if (typeof t === 'function') {
          try {
            const value = t(key);
            if (typeof value === 'string' && value !== '') return value;
          } catch (error) {
            // Fall through to the built-in copy.
          }
        }
        return fallback;
      };

      const flash = (next) => {
        setState(next);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = 0;
          setState('idle');
        }, RESET_MS);
      };

      const onClick = async () => {
        let steps = [];
        if (typeof readAssistantBlocks === 'function') {
          try {
            steps = readAssistantBlocks(turn);
          } catch (error) {
            console.warn('[full-copy] step reader failed', error);
          }
        }
        const markdown = buildMarkdown(collectBlocks(steps, closingBlocks(turn)));
        const turnNumber = turn && typeof turn.turn === 'number' ? turn.turn : '?';
        if (markdown === '') {
          console.warn('[full-copy] turn ' + turnNumber + ' has no copyable content');
          flash('failed');
          return;
        }
        const ok = await copyText(markdown);
        if (!ok) console.warn('[full-copy] copy failed for turn ' + turnNumber);
        flash(ok ? 'copied' : 'failed');
      };

      const title = translate('button.title', FALLBACK.title);
      const label = state === 'copied'
        ? translate('button.copied', FALLBACK.copied)
        : state === 'failed'
          ? translate('button.failed', FALLBACK.failed)
          : translate('button.label', FALLBACK.label);

      return h(
        'div',
        { className: 'dsh-full-copy-row', 'data-full-copy': '1' },
        h(
          'button',
          {
            type: 'button',
            className: 'dsh-full-copy-btn',
            'data-state': state,
            title,
            'aria-label': title,
            onClick,
          },
          label,
        ),
      );
    }

    /** Services needed to resolve the Chat target of the rendered Session. */
    const inject = ['slots', 'locale', 'sessions', 'uiConversation'];

    /**
     * Register the dictionaries, the one stylesheet, and the turn-tail entry.
     * @param ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'full-copy: dictionaries');

      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.plugin = 'dsh-full-copy';
        style.dataset.pluginCss = STYLE_ID;
        style.textContent = CSS;
        document.head.appendChild(style);
        return () => {
          style.remove();
        };
      }, 'full-copy: styles');

      ctx.slots.inject('conversation.chat.turnTail', () => ctx.slots.register({
        name: 'conversation.chat.turnTail',
        id: 'full-copy',
        label: 'Full Copy',
        order: 10,
        locale: NS,
        inject: (sessionId) => ({ readAssistantBlocks: createStepReader(ctx, sessionId) }),
      }, FullCopyButton));
    }

    return { inject, apply };
  },
});

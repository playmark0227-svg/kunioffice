/* ============================================================
   KUNI OFFICE 管理画面 — HTML ソースエンジン（DOM を使いません）
   ページの HTML を「何文字目から何文字目か」の位置つきで読み取り、
   編集を元のソースへの最小限の書き換えとして適用します。
   触っていない部分は 1 バイトも変わりません。
   ブラウザでは window.CMSCore、Node では require() で使えます。
   ============================================================ */
(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CMSCore = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const words = (s) => new Set(s.trim().split(/\s+/));

    /* ---------------- Tag tables ---------------- */
    // The first 14 are the spec's list; the rest are also void in browsers.
    const VOID_TAGS = words('area base br col embed hr img input link meta source track wbr basefont bgsound frame keygen param');
    const RAW_TEXT_TAGS = words('script style xmp iframe noembed noframes noscript plaintext'); // no markup, no char refs
    const RCDATA_TAGS = words('title textarea');                                                // no markup, char refs decoded
    const INLINE_OK = words('br wbr span em strong b i s u small mark sup sub a abbr time code q cite ruby rt rp');
    const TEXT_TAGS = words('h1 h2 h3 h4 h5 h6 p li dt dd th td caption figcaption blockquote span a em strong small div summary b i');
    const EXCLUDED_TAGS = words('header footer nav script style noscript template svg math iframe video audio canvas form button select textarea input option label');
    const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

    // Tree-construction subsets (WHATWG "in body" rules, only the parts real pages hit).
    const CLOSES_P = words('address article aside blockquote center details dialog dir div dl fieldset figcaption figure footer form header hgroup hr h1 h2 h3 h4 h5 h6 li dd dt listing main menu nav ol p plaintext pre search section summary table ul xmp');
    const SPECIAL = words('address applet area article aside base basefont bgsound blockquote body br button caption center col colgroup dd details dir div dl dt embed fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hgroup hr html iframe img input keygen li link listing main marquee menu meta nav noembed noframes noscript object ol p param plaintext pre script search section select source style summary table tbody td template textarea tfoot th thead title tr track ul wbr xmp');
    const BUTTON_SCOPE = words('applet caption html table td th marquee object template button');
    const TABLE_SCOPE = words('html table template');
    const HEAD_CONTENT = words('base basefont bgsound link meta title style script noscript template noframes');
    const HEADINGS = words('h1 h2 h3 h4 h5 h6');
    // HTML start tags that end an open <svg>/<math> (foreign content) in browsers.
    const FOREIGN_BREAKOUT = words('b big blockquote body br center code dd div dl dt em embed h1 h2 h3 h4 h5 h6 head hr i img li listing menu meta nobr ol p pre ruby s small span strong strike sub sup table tt u ul var');

    // serializeInline: browser-made elements that start a new line / that are dropped with their content.
    const BLOCK_TAGS = words('address article aside blockquote dd div dl dt figcaption figure footer h1 h2 h3 h4 h5 h6 header hr li main nav ol p pre section table tbody td th tr ul');
    const DROP_TAGS = words('script style template noscript iframe object embed svg math img picture video audio canvas input textarea select button head meta link title base');
    // Applied edits: new list items may not contain these.
    const UNSAFE_TAGS = words('script style iframe object embed link meta base form input button textarea select option template frame frameset noscript svg math');
    // Preview markers written by buildPreview; stripped from the page source in the preview.
    const MARKER_ATTRS = words('data-cms-id data-cms-text data-cms-img data-cms-listroot data-cms-collection data-cms-item');

    const DEFAULT_COLLECTIONS = { works: { itemSelector: '.work-item' } };

    /* ---------------- Small helpers ---------------- */
    const isWsCode = (c) => c === 32 || c === 10 || c === 9 || c === 13 || c === 12;
    const isAlphaCode = (c) => (c >= 65 && c <= 90) || (c >= 97 && c <= 122);
    const HTML_WS_ONLY = /^[ \t\n\f\r]*$/;
    const hasNonWs = (s) => !HTML_WS_ONLY.test(s);
    const hasVisibleText = (s) => /[^ \t\n\f\r\u00a0]/.test(s); // an &nbsp;-only spacer is not text
    const trimHtmlWs = (s) => s.replace(/^[ \t\n\f\r]+|[ \t\n\f\r]+$/g, '');
    const collapseWs = (s) => trimHtmlWs(String(s == null ? '' : s).replace(/[ \t\n\f\r]+/g, ' '));

    function escapeText(s) {
        return String(s).replace(/[&<>\u00a0]/g, (c) =>
            c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&nbsp;');
    }

    function escapeAttr(s) {
        return String(s).replace(/[&"<>]/g, (c) =>
            c === '&' ? '&amp;' : c === '"' ? '&quot;' : c === '<' ? '&lt;' : '&gt;');
    }

    // Plain text (e.g. from a textarea) → inline HTML; line breaks become <br>.
    function textToInlineHtml(s) {
        return String(s == null ? '' : s).replace(/\r\n?/g, '\n').split('\n').map(escapeText).join('<br>');
    }

    function detectNewline(src) {
        const k = src.indexOf('\n');
        return k > 0 && src[k - 1] === '\r' ? '\r\n' : '\n';
    }

    // Indentation in front of `pos` when only spaces/tabs precede it on its line, else null.
    function lineIndentAt(src, pos) {
        let k = pos;
        while (k > 0 && (src[k - 1] === ' ' || src[k - 1] === '\t')) k--;
        return k === 0 || src[k - 1] === '\n' || src[k - 1] === '\r' ? src.slice(k, pos) : null;
    }

    /* ---------------- Character references ---------------- */
    const NAMED_REFS = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0', copy: '\u00a9', reg: '\u00ae',
        trade: '\u2122', yen: '\u00a5', euro: '\u20ac', cent: '\u00a2', pound: '\u00a3', curren: '\u00a4',
        times: '\u00d7', divide: '\u00f7', deg: '\u00b0', plusmn: '\u00b1', middot: '\u00b7', para: '\u00b6',
        sect: '\u00a7', laquo: '\u00ab', raquo: '\u00bb', shy: '\u00ad', macr: '\u00af', acute: '\u00b4',
        micro: '\u00b5', cedil: '\u00b8', ordf: '\u00aa', ordm: '\u00ba', sup1: '\u00b9', sup2: '\u00b2',
        sup3: '\u00b3', frac12: '\u00bd', frac14: '\u00bc', frac34: '\u00be', iexcl: '\u00a1', iquest: '\u00bf',
        uml: '\u00a8', brvbar: '\u00a6', not: '\u00ac', hellip: '\u2026', mdash: '\u2014', ndash: '\u2013',
        lsquo: '\u2018', rsquo: '\u2019', sbquo: '\u201a', ldquo: '\u201c', rdquo: '\u201d', bdquo: '\u201e',
        bull: '\u2022', prime: '\u2032', Prime: '\u2033', larr: '\u2190', rarr: '\u2192', uarr: '\u2191',
        darr: '\u2193', harr: '\u2194', ensp: '\u2002', emsp: '\u2003', thinsp: '\u2009', zwnj: '\u200c',
        zwj: '\u200d', lrm: '\u200e', rlm: '\u200f', minus: '\u2212', sim: '\u223c', ne: '\u2260',
        le: '\u2264', ge: '\u2265', infin: '\u221e', hearts: '\u2665', spades: '\u2660', clubs: '\u2663',
        diams: '\u2666', check: '\u2713', star: '\u2606', starf: '\u2605', dagger: '\u2020', Dagger: '\u2021',
        permil: '\u2030', loz: '\u25ca', circ: '\u02c6', tilde: '\u02dc', Tab: '\t', NewLine: '\n',
        AMP: '&', LT: '<', GT: '>', QUOT: '"', COPY: '\u00a9', REG: '\u00ae'
    };
    // Names browsers also accept without the trailing ';'.
    const LEGACY_REFS = ['amp', 'lt', 'gt', 'quot', 'nbsp', 'copy', 'reg', 'yen', 'times', 'divide', 'deg',
        'plusmn', 'middot', 'para', 'sect', 'laquo', 'raquo', 'shy', 'macr', 'acute', 'micro', 'cedil', 'ordf',
        'ordm', 'sup1', 'sup2', 'sup3', 'frac12', 'frac14', 'frac34', 'iexcl', 'iquest', 'uml', 'brvbar', 'not',
        'cent', 'pound', 'curren', 'AMP', 'LT', 'GT', 'QUOT', 'COPY', 'REG'].sort((a, b) => b.length - a.length);
    const C1_REMAP = { 0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020,
        0x87: 0x2021, 0x88: 0x02c6, 0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d,
        0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c, 0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
        0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a, 0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178 };

    // Decodes character references the way browsers do for text (inAttr=false) or attribute values.
    function decodeEntities(s, inAttr) {
        if (s.indexOf('&') < 0) return s;
        return s.replace(/&(#[0-9]+;?|#[xX][0-9a-fA-F]+;?|[A-Za-z][A-Za-z0-9]*;?)/g, (m, body, offset, whole) => {
            if (body[0] === '#') {
                const hex = body[1] === 'x' || body[1] === 'X';
                let cp = parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
                if (cp >= 0x80 && cp <= 0x9f && C1_REMAP[cp]) cp = C1_REMAP[cp];
                if (!(cp > 0) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return '\ufffd';
                return String.fromCodePoint(cp);
            }
            const semi = body[body.length - 1] === ';';
            const name = semi ? body.slice(0, -1) : body;
            if (semi && Object.prototype.hasOwnProperty.call(NAMED_REFS, name)) return NAMED_REFS[name];
            const legacy = LEGACY_REFS.find((l) => name.startsWith(l));
            if (!legacy) return m;
            if (inAttr) {
                // "&copy=" / "&copyx" stay literal inside attribute values
                const next = legacy.length < name.length ? name[legacy.length] : whole[offset + m.length];
                if (legacy.length < name.length || next === '=') return m;
            }
            return NAMED_REFS[legacy] + body.slice(legacy.length);
        });
    }

    /* ---------------- Parser ---------------- */
    // Reads a start or end tag beginning at `lt` (the '<'). Returns null on end of input inside the tag.
    function readTag(src, lt, isEnd) {
        const n = src.length;
        let j = lt + (isEnd ? 2 : 1);
        const nameStart = j;
        while (j < n && !isWsCode(src.charCodeAt(j)) && src[j] !== '/' && src[j] !== '>') j++;
        const tag = { name: src.slice(nameStart, j).toLowerCase(), start: lt, end: -1, attrs: [], selfClosing: false, attrInsert: -1 };
        for (;;) {
            while (j < n && isWsCode(src.charCodeAt(j))) j++;
            if (j >= n) return null;
            const ch = src[j];
            if (ch === '>') { tag.attrInsert = j; tag.end = j + 1; return tag; }
            if (ch === '/') {
                if (src[j + 1] === '>') { tag.selfClosing = true; tag.attrInsert = j; tag.end = j + 2; return tag; }
                j++;
                continue;
            }
            const aStart = j;
            j++; // the first character always belongs to the name (even '=')
            while (j < n && !isWsCode(src.charCodeAt(j)) && src[j] !== '/' && src[j] !== '>' && src[j] !== '=') j++;
            const attr = { name: src.slice(aStart, j).toLowerCase(), value: '', start: aStart, end: j, nameEnd: j,
                valueStart: -1, valueEnd: -1, quote: null };
            let k = j;
            while (k < n && isWsCode(src.charCodeAt(k))) k++;
            if (src[k] === '=') {
                k++;
                while (k < n && isWsCode(src.charCodeAt(k))) k++;
                if (k >= n) return null;
                const q = src[k];
                if (q === '"' || q === "'") {
                    const close = src.indexOf(q, k + 1);
                    if (close < 0) return null;
                    attr.valueStart = k + 1; attr.valueEnd = close; attr.quote = q; attr.end = close + 1;
                } else if (q === '>') {
                    attr.valueStart = attr.valueEnd = attr.end = k; attr.quote = ''; attr.missingValue = true;
                } else {
                    let e = k;
                    while (e < n && !isWsCode(src.charCodeAt(e)) && src[e] !== '>') e++;
                    if (e >= n) return null;
                    attr.valueStart = k; attr.valueEnd = e; attr.quote = ''; attr.end = e;
                }
                attr.value = decodeEntities(src.slice(attr.valueStart, attr.valueEnd), true);
                j = attr.end;
            }
            if (tag.attrs.some((a) => a.name === attr.name)) attr.duplicate = true; // browsers keep the first
            tag.attrs.push(attr);
        }
    }

    function commentEnd(src, from) {
        if (src[from] === '>') return from + 1;            // <!-->
        if (src.startsWith('->', from)) return from + 2;  // <!--->
        for (let k = from; ;) {
            const d = src.indexOf('--', k);
            if (d < 0) return -1;
            if (src[d + 2] === '>') return d + 3;
            if (src[d + 2] === '!' && src[d + 3] === '>') return d + 4;
            k = d + 1;
        }
    }

    /**
     * parse(src) → doc. Elements only in doc.nodes (id = index, document order, parent id < child id).
     * Offsets: start ('<'), openEnd (after '>'), closeStart ('</'), end (after the end tag's '>').
     * Void / self-closed / implicitly closed elements have closeStart === end (no end tag) and explicitClose false.
     * node.content = ordered children: {type:'element', id} | {type:'text', start, end, text} | {type:'comment', start, end}.
     */
    function parse(src) {
        src = String(src);
        const n = src.length;
        const nodes = [];
        const stack = [];
        const doc = { src, nodes, roots: [], content: [], byTag: Object.create(null), errors: [],
            html: null, head: null, body: null, main: null, title: null, doctypeEnd: 0 };
        let textStart = 0;

        const current = () => (stack.length ? nodes[stack[stack.length - 1]] : null);
        const addContent = (entry) => { const c = current(); (c ? c.content : doc.content).push(entry); };
        const addText = (start, end, decode) => {
            if (end <= start) return;
            const raw = src.slice(start, end);
            const entry = { type: 'text', start, end, text: decode ? decodeEntities(raw, false) : raw };
            addContent(entry);
            const c = current();
            if (c) c.textChildren.push(entry);
        };
        const flushText = (upto) => { addText(textStart, upto, true); textStart = upto; };

        const closeImplicit = (id, at) => {
            const nd = nodes[id];
            nd.closeStart = nd.end = at;
            nd.explicitClose = false;
        };
        // Pops every open element at stack index >= idx (implicit close at `at`).
        const popTo = (idx, at) => { while (stack.length > idx) closeImplicit(stack.pop(), at); };
        const findOpen = (match, stop) => {
            for (let k = stack.length - 1; k >= 0; k--) {
                const nd = nodes[stack[k]];
                if (match(nd)) return k;
                if (stop && stop(nd)) return -1;
            }
            return -1;
        };
        const htmlTag = (nd, names) => nd.ns === 'html' && (typeof names === 'string' ? nd.tag === names : names.has(nd.tag));

        function closePInButtonScope(at) {
            const k = findOpen((nd) => htmlTag(nd, 'p'), (nd) => nd.ns !== 'html' || BUTTON_SCOPE.has(nd.tag));
            if (k >= 0) popTo(k, at);
        }

        function impliedEnds(name, at) {
            if (!HEAD_CONTENT.has(name)) {
                const k = findOpen((nd) => htmlTag(nd, 'head'));
                if (k >= 0) popTo(k, at);
            }
            if (name === 'li' || name === 'dd' || name === 'dt') {
                const same = name === 'li' ? (nd) => htmlTag(nd, 'li') : (nd) => htmlTag(nd, 'dd') || htmlTag(nd, 'dt');
                const k = findOpen(same, (nd) => nd.ns !== 'html' || (SPECIAL.has(nd.tag) && nd.tag !== 'address' && nd.tag !== 'div' && nd.tag !== 'p'));
                if (k >= 0) popTo(k, at);
            }
            if (CLOSES_P.has(name)) closePInButtonScope(at);
            const cur = current();
            if (HEADINGS.has(name) && cur && htmlTag(cur, HEADINGS)) popTo(stack.length - 1, at);
            if ((name === 'option' || name === 'optgroup') && cur && htmlTag(cur, 'option')) popTo(stack.length - 1, at);
            if (name === 'optgroup' && current() && htmlTag(current(), 'optgroup')) popTo(stack.length - 1, at);
            if (name === 'a') { // nested <a>: the browser closes the outer one
                const k = findOpen((nd) => htmlTag(nd, 'a'), (nd) => nd.ns !== 'html' || TABLE_SCOPE.has(nd.tag) || nd.tag === 'td' || nd.tag === 'th' || nd.tag === 'caption');
                if (k >= 0) popTo(k, at);
            }
            if (name === 'button') {
                const k = findOpen((nd) => htmlTag(nd, 'button'), (nd) => nd.ns !== 'html' || BUTTON_SCOPE.has(nd.tag) && nd.tag !== 'button');
                if (k >= 0) popTo(k, at);
            }
            if (name === 'tr' || name === 'tbody' || name === 'thead' || name === 'tfoot') {
                const rows = name === 'tr' ? words('tr') : words('tr tbody thead tfoot');
                const k = findOpen((nd) => htmlTag(nd, rows), (nd) => nd.ns !== 'html' || TABLE_SCOPE.has(nd.tag));
                if (k >= 0) popTo(k, at);
            }
            if (name === 'td' || name === 'th') {
                const k = findOpen((nd) => htmlTag(nd, 'td') || htmlTag(nd, 'th'), (nd) => nd.ns !== 'html' || TABLE_SCOPE.has(nd.tag) || nd.tag === 'tr');
                if (k >= 0) popTo(k, at);
            }
        }

        // svg foreignObject/desc/title and MathML text elements hold HTML content
        const htmlIntegration = (nd) => (nd.ns === 'svg' && (nd.tag === 'foreignobject' || nd.tag === 'desc' || nd.tag === 'title')) ||
            (nd.ns === 'math' && /^(mi|mo|mn|ms|mtext)$/.test(nd.tag));

        function nsFor(name, parent) {
            if (name === 'svg') return 'svg';
            if (name === 'math') return 'math';
            if (!parent || htmlIntegration(parent)) return 'html';
            return parent.ns;
        }

        function startTag(tag) {
            const name = tag.name;
            const fontBreak = name === 'font' && tag.attrs.some((a) => a.name === 'color' || a.name === 'face' || a.name === 'size');
            if (FOREIGN_BREAKOUT.has(name) || fontBreak) {
                while (current() && current().ns !== 'html' && !htmlIntegration(current())) closeImplicit(stack.pop(), tag.start);
            }
            const parentBefore = current();
            if (nsFor(name, parentBefore) === 'html' && (!parentBefore || parentBefore.ns === 'html')) impliedEnds(name, tag.start);
            const parent = current();
            const ns = nsFor(name, parent);
            const node = {
                id: nodes.length, type: 'element', tag: name, ns,
                start: tag.start, openEnd: tag.end, closeStart: tag.end, end: tag.end,
                explicitClose: false, void: false, selfClosing: false,
                attrs: tag.attrs, attrInsert: tag.attrInsert,
                parent: parent ? parent.id : null, depth: stack.length,
                children: [], textChildren: [], content: [],
                openTag: src.slice(tag.start, tag.end), closeTag: ''
            };
            nodes.push(node);
            (parent ? parent.children : doc.roots).push(node.id);
            addContent({ type: 'element', id: node.id });
            (doc.byTag[name] || (doc.byTag[name] = [])).push(node.id);
            if (ns === 'html') {
                if (name === 'html' && doc.html === null) doc.html = node.id;
                if (name === 'head' && doc.head === null) doc.head = node.id;
                if (name === 'body' && doc.body === null) doc.body = node.id;
                if (name === 'main' && doc.main === null) doc.main = node.id;
                if (name === 'title' && doc.title === null) doc.title = node.id;
            }
            if (ns === 'html' && VOID_TAGS.has(name)) node.void = true;
            else if (ns !== 'html' && tag.selfClosing) node.selfClosing = true;
            else stack.push(node.id);
            return node;
        }

        function endTag(tag) {
            const k = findOpen((nd) => nd.tag === tag.name);
            if (k < 0) {
                doc.errors.push({ code: 'stray-end-tag', pos: tag.start, tag: tag.name });
                return;
            }
            popTo(k + 1, tag.start);
            const nd = nodes[stack.pop()];
            nd.closeStart = tag.start;
            nd.end = tag.end;
            nd.explicitClose = true;
            nd.closeTag = src.slice(tag.start, tag.end);
        }

        // Raw text / RCDATA content up to the matching end tag.
        function rawText(node) {
            const from = node.openEnd;
            let at = -1;
            if (node.tag !== 'plaintext') {
                const re = new RegExp('</' + node.tag + '[\\t\\n\\f\\r />]', 'ig');
                re.lastIndex = from;
                const m = re.exec(src);
                if (m) at = m.index;
            }
            const close = at >= 0 ? readTag(src, at, true) : null;
            if (!close) {
                if (at >= 0) doc.errors.push({ code: 'eof-in-tag', pos: at });
                addText(from, n, RCDATA_TAGS.has(node.tag));
                return n;
            }
            addText(from, at, RCDATA_TAGS.has(node.tag));
            endTag(close);
            return close.end;
        }

        let i = 0;
        while (i < n) {
            const lt = src.indexOf('<', i);
            if (lt < 0) break;
            const next = src[lt + 1];
            if (next === '!') {
                flushText(lt);
                let end;
                if (src.startsWith('<!--', lt)) {
                    end = commentEnd(src, lt + 4);
                    const entry = { type: 'comment', start: lt, end: end < 0 ? n : end };
                    if (end < 0) { entry.unterminated = true; doc.errors.push({ code: 'eof-in-comment', pos: lt }); }
                    addContent(entry);
                    end = entry.end;
                } else if (/^<!doctype/i.test(src.slice(lt, lt + 9))) {
                    end = src.indexOf('>', lt);
                    end = end < 0 ? n : end + 1;
                    addContent({ type: 'doctype', start: lt, end });
                    if (!nodes.length) doc.doctypeEnd = end; // only a leading doctype is a safe insert point
                } else if (src.startsWith('<![CDATA[', lt) && current() && current().ns !== 'html') {
                    end = src.indexOf(']]>', lt);
                    end = end < 0 ? n : end + 3;
                    addContent({ type: 'cdata', start: lt, end });
                } else {
                    end = src.indexOf('>', lt);
                    end = end < 0 ? n : end + 1;
                    addContent({ type: 'comment', start: lt, end, bogus: true });
                }
                i = textStart = end;
            } else if (next === '?') {
                flushText(lt);
                let end = src.indexOf('>', lt);
                end = end < 0 ? n : end + 1;
                addContent({ type: 'comment', start: lt, end, bogus: true });
                i = textStart = end;
            } else if (next === '/') {
                const c2 = src.charCodeAt(lt + 2);
                if (src[lt + 2] === '>') { // "</>" is dropped
                    flushText(lt);
                    i = textStart = lt + 3;
                } else if (isAlphaCode(c2)) {
                    const tag = readTag(src, lt, true);
                    flushText(lt);
                    if (!tag) { doc.errors.push({ code: 'eof-in-tag', pos: lt }); i = textStart = n; break; }
                    endTag(tag);
                    i = textStart = tag.end;
                } else if (lt + 2 >= n) {
                    i = n;
                } else {
                    flushText(lt);
                    let end = src.indexOf('>', lt);
                    end = end < 0 ? n : end + 1;
                    addContent({ type: 'comment', start: lt, end, bogus: true });
                    i = textStart = end;
                }
            } else if (isAlphaCode(src.charCodeAt(lt + 1))) {
                const tag = readTag(src, lt, false);
                flushText(lt);
                if (!tag) { doc.errors.push({ code: 'eof-in-tag', pos: lt }); i = textStart = n; break; }
                const node = startTag(tag);
                i = textStart = tag.end;
                if (node.ns === 'html' && !node.void && (RAW_TEXT_TAGS.has(node.tag) || RCDATA_TAGS.has(node.tag))) {
                    i = textStart = rawText(node);
                }
            } else {
                i = lt + 1; // a literal '<'
            }
        }
        flushText(n);
        popTo(0, n);
        return doc;
    }

    /* ---------------- Node helpers ---------------- */
    function getAttr(node, name) {
        const a = node && node.attrs.find((x) => x.name === name);
        return a ? a.value : null;
    }

    function hasClass(node, cls) {
        const v = getAttr(node, 'class');
        return v !== null && v.split(/[ \t\n\f\r]+/).indexOf(cls) >= 0;
    }

    function textContent(doc, id) {
        const nd = doc.nodes[id];
        return nd.content.map((c) => (c.type === 'text' ? c.text : c.type === 'element' ? textContent(doc, c.id) : '')).join('');
    }

    function isDescendant(doc, id, ancestorId) {
        for (let p = doc.nodes[id].parent; p !== null; p = doc.nodes[p].parent) if (p === ancestorId) return true;
        return false;
    }

    /* ---------------- Simple selectors (tag, .class, #id, [attr], [attr=v], descendant, >) ---------------- */
    const selectorCache = new Map();

    function compileSelector(selector) {
        if (selectorCache.has(selector)) return selectorCache.get(selector);
        const list = String(selector).split(',').map((part) => {
            const tokens = part.replace(/\s*>\s*/g, ' > ').trim().split(/\s+/);
            const seq = [];
            let comb = ' ';
            for (const t of tokens) {
                if (t === '>') { comb = '>'; continue; }
                const m = /^([a-zA-Z][a-zA-Z0-9-]*|\*)?((?:[.#][-\w]+|\[[^\]]+\])*)$/.exec(t);
                if (!m || (!m[1] && !m[2])) throw new Error('未対応のセレクタです: ' + selector);
                const compound = { tag: m[1] && m[1] !== '*' ? m[1].toLowerCase() : null, classes: [], id: null, attrs: [] };
                const re = /([.#])([-\w]+)|\[\s*([-\w:]+)\s*(?:(~?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*\]/g;
                let p;
                while ((p = re.exec(m[2]))) {
                    if (p[1] === '.') compound.classes.push(p[2]);
                    else if (p[1] === '#') compound.id = p[2];
                    else compound.attrs.push({ name: p[3].toLowerCase(), op: p[4] || null, value: p[5] !== undefined ? p[5] : p[6] !== undefined ? p[6] : p[7] });
                }
                seq.push({ comb, compound });
                comb = ' ';
            }
            return seq;
        });
        selectorCache.set(selector, list);
        return list;
    }

    function matchCompound(node, c) {
        if (c.tag && node.tag !== c.tag) return false;
        if (c.id !== null && getAttr(node, 'id') !== c.id) return false;
        for (const cls of c.classes) if (!hasClass(node, cls)) return false;
        for (const a of c.attrs) {
            const v = getAttr(node, a.name);
            if (v === null) return false;
            if (a.op === '=' && v !== a.value) return false;
            if (a.op === '~=' && v.split(/[ \t\n\f\r]+/).indexOf(a.value) < 0) return false;
        }
        return true;
    }

    function matchSeq(doc, node, seq, idx) {
        if (!matchCompound(node, seq[idx].compound)) return false;
        if (idx === 0) return true;
        const parentOf = (nd) => (nd.parent === null ? null : doc.nodes[nd.parent]);
        if (seq[idx].comb === '>') {
            const p = parentOf(node);
            return !!p && matchSeq(doc, p, seq, idx - 1);
        }
        for (let p = parentOf(node); p; p = parentOf(p)) if (matchSeq(doc, p, seq, idx - 1)) return true;
        return false;
    }

    function matches(doc, id, selector) {
        const node = doc.nodes[id];
        return compileSelector(selector).some((seq) => matchSeq(doc, node, seq, seq.length - 1));
    }

    // Descendants of rootId (or the whole document when rootId is null) matching selector, in document order.
    function select(doc, rootId, selector) {
        const compiled = compileSelector(selector);
        const out = [];
        const whole = rootId === null || rootId === undefined;
        // ids are in document order, so a subtree is one contiguous id range
        for (let id = whole ? 0 : rootId + 1; id < doc.nodes.length; id++) {
            if (!whole && !isDescendant(doc, id, rootId)) break;
            const node = doc.nodes[id];
            if (compiled.some((seq) => matchSeq(doc, node, seq, seq.length - 1))) out.push(id);
        }
        return out;
    }

    /* ---------------- Paths ---------------- */
    function safeDecode(seg) {
        try { return decodeURIComponent(seg); } catch (e) { return seg; }
    }

    // Resolves an <img src> (relative URL) against the page path → repository path, or null.
    function resolvePath(pagePath, src) {
        if (src === null || src === undefined) return null;
        let s = String(src).replace(/^[\u0000-\u0020]+|[\u0000-\u0020]+$/g, '').replace(/[\t\n\r]/g, '').replace(/\\/g, '/');
        if (!s || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(s) || s[0] === '/') return null;
        s = s.split('#')[0].split('?')[0];
        if (!s) return null;
        const page = String(pagePath || '').replace(/\\/g, '/');
        const dir = page.slice(0, page.lastIndexOf('/') + 1);
        const parts = [];
        for (const raw of (dir + s).split('/')) {
            const seg = safeDecode(raw);
            if (seg === '' || seg === '.') continue;
            if (seg === '..') {
                if (!parts.length) return null;
                parts.pop();
                continue;
            }
            if (seg.indexOf('/') >= 0) return null;
            parts.push(seg);
        }
        if (!parts.length) return null;
        return parts.join('/') + (s[s.length - 1] === '/' ? '/' : ''); // "a.jpg/" is a folder URL, not the file
    }

    function entriesOf(sourcesByPath) {
        return sourcesByPath instanceof Map ? Array.from(sourcesByPath.entries()) : Object.entries(sourcesByPath || {});
    }

    // Pages that show the image at repoPath (<img src> only) → [{pagePath, count}].
    function findImageUsages(repoPath, sourcesByPath) {
        const out = [];
        for (const [pagePath, text] of entriesOf(sourcesByPath)) {
            if (!/\.html?$/i.test(pagePath) || typeof text !== 'string') continue;
            const doc = parse(text);
            let count = 0;
            for (const id of doc.byTag.img || []) {
                if (resolvePath(pagePath, getAttr(doc.nodes[id], 'src')) === repoPath) count++;
            }
            if (count) out.push({ pagePath, count });
        }
        return out;
    }

    /* ---------------- Classification ---------------- */
    function excludedSelf(node) {
        if (node.ns !== 'html' || EXCLUDED_TAGS.has(node.tag)) return true;
        for (const a of node.attrs) {
            if (a.name === 'data-cms-lock' || a.name === 'hidden') return true;
            if (a.name === 'aria-hidden' && trimHtmlWs(a.value).toLowerCase() === 'true') return true;
            if (a.name.startsWith('data-') && !a.name.startsWith('data-cms-') && a.name !== 'data-category') return true;
        }
        return false;
    }

    /**
     * classify(doc, {pagePath, collections}) → {texts, images, lists, collections, locked, excluded}
     *   texts: [id]; images: [{id, src, repoPath}]; lists: [id]; collections: [{id, type, items:[id]}]
     *   locked: Set of in-scope ids under data-cms-lock; excluded: Set of in-scope ids never editable.
     */
    function classify(doc, opts) {
        opts = opts || {};
        const pagePath = opts.pagePath || '';
        const collectionCfg = opts.collections || DEFAULT_COLLECTIONS;
        const nodes = doc.nodes;
        const count = nodes.length;
        const inScope = new Uint8Array(count);
        const blocked = new Uint8Array(count);
        const lockedFlag = new Uint8Array(count);
        const inlineClean = new Uint8Array(count);
        const textful = new Uint8Array(count);
        const insideTarget = new Uint8Array(count);
        const isText = new Uint8Array(count);

        // Top-down flags (parents always come before children).
        for (let id = 0; id < count; id++) {
            const nd = nodes[id];
            const p = nd.parent;
            inScope[id] = p !== null && (inScope[p] || (nodes[p].tag === 'main' && nodes[p].ns === 'html')) ? 1 : 0;
            blocked[id] = (p !== null && blocked[p]) || excludedSelf(nd) ? 1 : 0;
            lockedFlag[id] = (p !== null && lockedFlag[p]) || nd.attrs.some((a) => a.name === 'data-cms-lock') ? 1 : 0;
        }
        // Bottom-up: "only clean inline markup inside" and "has visible text".
        for (let id = count - 1; id >= 0; id--) {
            const nd = nodes[id];
            let clean = true;
            let hasText = nd.textChildren.some((t) => hasVisibleText(t.text));
            for (const c of nd.children) {
                const ch = nodes[c];
                if (!INLINE_OK.has(ch.tag) || ch.ns !== 'html' || blocked[c] || !(ch.explicitClose || ch.void) || !inlineClean[c]) clean = false;
                if (textful[c]) hasText = true;
            }
            inlineClean[id] = clean ? 1 : 0;
            textful[id] = hasText ? 1 : 0;
        }

        const texts = [];
        const images = [];
        const locked = new Set();
        const excluded = new Set();
        for (let id = 0; id < count; id++) {
            const nd = nodes[id];
            const p = nd.parent;
            insideTarget[id] = p !== null && (isText[p] || insideTarget[p]) ? 1 : 0;
            if (!inScope[id]) continue;
            if (lockedFlag[id]) locked.add(id);
            if (blocked[id]) { excluded.add(id); continue; }
            if (!insideTarget[id] && TEXT_TAGS.has(nd.tag) && nd.explicitClose && textful[id] && inlineClean[id]) {
                isText[id] = 1;
                texts.push(id);
            }
            if (nd.tag === 'img' && getAttr(nd, 'srcset') === null && !(p !== null && nodes[p].tag === 'picture')) {
                const src = getAttr(nd, 'src');
                const repoPath = resolvePath(pagePath, src); // null for absolute / data: / external URLs
                if (repoPath && IMAGE_EXT.test(repoPath)) images.push({ id, src, repoPath });
            }
        }

        const onlyWsText = (nd) => nd.textChildren.every((t) => !hasNonWs(t.text));
        const lists = [];
        for (const tag of ['ul', 'ol']) {
            for (const id of doc.byTag[tag] || []) {
                const nd = nodes[id];
                if (!inScope[id] || blocked[id] || insideTarget[id] || !nd.explicitClose || nd.ns !== 'html') continue;
                if (nd.children.length && onlyWsText(nd) && nd.children.every((c) => nodes[c].tag === 'li' && isText[c])) lists.push(id);
            }
        }
        lists.sort((a, b) => a - b);

        const collections = [];
        for (let id = 0; id < count; id++) {
            const nd = nodes[id];
            const type = getAttr(nd, 'data-cms-list');
            if (type === null || !inScope[id] || blocked[id] || !nd.explicitClose) continue;
            const cfg = Object.prototype.hasOwnProperty.call(collectionCfg, type) ? collectionCfg[type] : null;
            if (!cfg || !onlyWsText(nd)) continue;
            const items = nd.children.filter((c) => matches(doc, c, cfg.itemSelector || '*'));
            // every element child must be an item, so add/remove/reorder can't drop anything else
            if (items.length !== nd.children.length || !items.every((c) => nodes[c].explicitClose)) continue;
            collections.push({ id, type, items });
        }

        return { texts, images, lists, collections, locked, excluded };
    }

    /* ---------------- Patching ---------------- */
    function checkDoc(src, doc) {
        if (!doc || !Array.isArray(doc.nodes)) throw new Error('doc がありません（parse(src) の結果を渡してください）');
        if (doc.src !== undefined && doc.src !== src) throw new Error('doc と src が一致しません');
    }

    // Patch order: by start; at the same start inserts (zero-length) first, then the outer patch.
    const isInsert = (p) => (p.end === p.start ? 1 : 0);
    const patchOrder = (a, b) => a.start - b.start || isInsert(b) - isInsert(a) || b.end - a.end;

    // Applies non-overlapping {start, end, text} patches (zero-length = insert).
    function applyPatches(src, patches) {
        const sorted = patches.slice().sort(patchOrder);
        let out = '';
        let pos = 0;
        for (const p of sorted) {
            if (p.start < pos) throw new Error('重なった書き換えがあります');
            out += src.slice(pos, p.start) + p.text;
            pos = p.end;
        }
        return out + src.slice(pos);
    }

    // Text to insert at node.attrInsert; guards "<a href=>" so the new attribute can't become its value.
    function attrInsertText(node, text, skipAttr) {
        const last = node.attrs[node.attrs.length - 1];
        if (last && last !== skipAttr && last.missingValue && last.end === node.attrInsert) return '""' + text;
        return text;
    }

    /**
     * buildPreview(src, doc, cls, {baseHref, headInject}) → HTML for the preview iframe (srcdoc).
     * Adds data-cms-id (+ role markers) to body elements; strips scripts, meta refresh and on* handlers.
     */
    function buildPreview(src, doc, cls, opts) {
        checkDoc(src, doc);
        opts = opts || {};
        cls = cls || classify(doc, opts);
        const nodes = doc.nodes;
        const roles = new Map();
        const addRole = (id, text) => roles.set(id, (roles.get(id) || '') + text);
        cls.texts.forEach((id) => addRole(id, ' data-cms-text'));
        cls.images.forEach((img) => addRole(img.id, ' data-cms-img'));
        cls.lists.forEach((id) => addRole(id, ' data-cms-listroot'));
        cls.collections.forEach((c) => {
            addRole(c.id, ' data-cms-collection="' + escapeAttr(c.type) + '"');
            c.items.forEach((id) => addRole(id, ' data-cms-item'));
        });

        const patches = [];
        const removed = new Uint8Array(nodes.length);
        const inHead = new Uint8Array(nodes.length);
        for (const nd of nodes) {
            const p = nd.parent;
            inHead[nd.id] = nd.tag === 'html' || nd.tag === 'head' || (p !== null && inHead[p] && nodes[p].tag !== 'html') ? 1 : 0;
            if (p !== null && removed[p]) { removed[nd.id] = 1; continue; }
            const refresh = nd.tag === 'meta' && /^refresh$/i.test(trimHtmlWs(getAttr(nd, 'http-equiv') || ''));
            if (nd.tag === 'script' || refresh) {
                removed[nd.id] = 1;
                patches.push({ start: nd.start, end: nd.end, text: '' });
                continue;
            }
            let lastRemoved = null;
            for (const a of nd.attrs) {
                if (a.name.startsWith('on') || MARKER_ATTRS.has(a.name)) {
                    patches.push({ start: a.start, end: a.end, text: '' });
                    lastRemoved = a;
                }
            }
            if (!inHead[nd.id]) {
                const markers = ' data-cms-id="' + nd.id + '"' + (roles.get(nd.id) || '');
                patches.push({ start: nd.attrInsert, end: nd.attrInsert, text: attrInsertText(nd, markers, lastRemoved) });
            }
        }

        const base = opts.baseHref ? '<base href="' + escapeAttr(opts.baseHref) + '">' : '';
        const inject = opts.headInject || '';
        if (doc.head !== null) {
            const head = nodes[doc.head];
            patches.push({ start: head.openEnd, end: head.openEnd, text: base });
            const at = head.explicitClose ? head.closeStart : head.end;
            patches.push({ start: at, end: at, text: inject });
        } else {
            const at = doc.html !== null ? nodes[doc.html].openEnd : doc.doctypeEnd;
            patches.push({ start: at, end: at, text: '<head>' + base + inject + '</head>' });
        }
        return applyPatches(src, patches);
    }

    /* ---------------- Serializing an edited text target ---------------- */
    function openTagSource(rec) {
        let s = rec.openTag;
        const cut = rec.attrs.filter((a) => a.name.startsWith('data-cms-'));
        for (let k = cut.length - 1; k >= 0; k--) {
            let from = cut[k].start - rec.start;
            while (from > 0 && isWsCode(s.charCodeAt(from - 1))) from--;
            s = s.slice(0, from) + s.slice(cut[k].end - rec.start);
        }
        return s;
    }

    function endsWithBr(rec, lookup) {
        for (let k = rec.content.length - 1; k >= 0; k--) {
            const c = rec.content[k];
            if (c.type === 'text') { if (hasNonWs(c.text)) return false; continue; }
            if (c.type !== 'element') continue;
            const r = lookup(c.id);
            if (!r) return false;
            if (r.tag === 'br') return true;
            return INLINE_OK.has(r.tag) && !r.void ? endsWithBr(r, lookup) : false;
        }
        return false;
    }

    function safeComment(v) {
        return !/^-?>|--!?>|-$/.test(v);
    }

    /**
     * serializeInline(domEl, lookup) → new inner HTML of a text target, built from the live (edited) DOM.
     * Original inline elements (found via data-cms-id) are re-emitted from their source; everything the
     * browser created is unwrapped, with div/p blocks turned into <br> line breaks.
     */
    function serializeInline(domEl, lookup) {
        const idOf = (el) => {
            const raw = el.getAttribute ? el.getAttribute('data-cms-id') : null;
            return raw !== null && /^[0-9]+$/.test(raw) ? Number(raw) : null;
        };
        const selfId = idOf(domEl);
        const selfRec = selfId !== null ? lookup(selfId) || null : null;
        const tokens = []; // {kind:'text'|'br'|'open'|'close'|'comment', html, blank}
        let lineHasContent = false;
        let pendingBreak = false;

        const flushBreak = () => {
            if (!pendingBreak) return;
            tokens.push({ kind: 'br', html: '<br>' });
            pendingBreak = false;
            lineHasContent = false;
        };
        const requestBreak = () => { if (lineHasContent) pendingBreak = true; };

        function walk(parent) {
            const kids = parent.childNodes || [];
            for (let k = 0; k < kids.length; k++) {
                const child = kids[k];
                if (child.nodeType === 3 || child.nodeType === 4) {
                    const v = child.nodeValue || '';
                    if (!v) continue;
                    const blank = !hasNonWs(v);
                    if (!blank) { flushBreak(); lineHasContent = true; }
                    tokens.push({ kind: 'text', html: escapeText(v), blank });
                } else if (child.nodeType === 8) {
                    const v = child.nodeValue || '';
                    if (safeComment(v)) tokens.push({ kind: 'comment', html: '<!--' + v + '-->' });
                } else if (child.nodeType === 1) {
                    element(child);
                }
            }
        }

        function element(el) {
            const name = String(el.nodeName || '').toLowerCase();
            const id = idOf(el);
            const rec = id !== null && id !== selfId ? lookup(id) || null : null;
            const known = !!rec && rec.type === 'element' && rec.tag === name && INLINE_OK.has(name);
            if (name === 'br') {
                flushBreak();
                tokens.push({ kind: 'br', html: known ? openTagSource(rec) : '<br>' });
                lineHasContent = false;
                return;
            }
            if (known) {
                flushBreak();
                tokens.push({ kind: 'open', html: openTagSource(rec) });
                if (!rec.void) {
                    walk(el);
                    tokens.push({ kind: 'close', html: rec.closeTag || '</' + rec.tag + '>' });
                }
                return;
            }
            if (DROP_TAGS.has(name)) return;
            if (BLOCK_TAGS.has(name)) {
                requestBreak();
                walk(el);
                requestBreak();
                return;
            }
            walk(el); // browser-made span/font/b/… → keep only the content
        }

        walk(domEl);

        // Drop one trailing <br> (the browser's placeholder) unless the original ended with one.
        if (!(selfRec && endsWithBr(selfRec, lookup))) {
            let k = tokens.length - 1;
            while (k >= 0 && ((tokens[k].kind === 'text' && tokens[k].blank) || tokens[k].kind === 'close' || tokens[k].kind === 'comment')) k--;
            if (k >= 0 && tokens[k].kind === 'br') tokens.splice(k, 1);
        }
        return tokens.map((t) => t.html).join('');
    }

    /* ---------------- Validation of HTML written into pages ---------------- */
    function textEntries(doc) {
        const out = doc.content.filter((c) => c.type === 'text');
        for (const nd of doc.nodes) for (const c of nd.content) if (c.type === 'text') out.push(c);
        return out;
    }

    // Throws unless html is balanced inline markup (INLINE_OK tags, comments, escaped text).
    function validateInlineHtml(html) {
        if (typeof html !== 'string') throw new Error('文章の内容が文字列ではありません');
        if (html.indexOf('<') < 0) return;
        const d = parse(html);
        const bad = d.errors.length ||
            d.nodes.some((nd) => nd.ns !== 'html' || !INLINE_OK.has(nd.tag) || !(nd.explicitClose || nd.void)) ||
            d.content.concat(...d.nodes.map((nd) => nd.content)).some((c) => c.type === 'doctype' || c.type === 'cdata' || c.bogus) ||
            textEntries(d).some((t) => html.slice(t.start, t.end).indexOf('<') >= 0);
        if (bad) throw new Error('文章に使えないタグが含まれています');
    }

    // Throws unless html is exactly one closed element without scripts / handlers.
    function validateBlockHtml(html, expectTag) {
        if (typeof html !== 'string') throw new Error('追加する項目の内容が文字列ではありません');
        const d = parse(html);
        const topText = d.content.some((c) => (c.type === 'text' && hasNonWs(c.text)) || c.type === 'doctype' || c.bogus);
        const rootNode = d.roots.length === 1 ? d.nodes[d.roots[0]] : null;
        const bad = d.errors.length || topText || !rootNode || !(rootNode.explicitClose || rootNode.void) ||
            (expectTag && rootNode.tag !== expectTag) ||
            d.nodes.some((nd) => UNSAFE_TAGS.has(nd.tag) || nd.attrs.some((a) =>
                a.name.startsWith('on') || (/^(href|src|action|formaction|xlink:href)$/.test(a.name) && /^[\u0000-\u0020]*javascript:/i.test(a.value)))) ||
            textEntries(d).some((t) => html.slice(t.start, t.end).indexOf('<') >= 0);
        if (bad) throw new Error('追加する項目の HTML が正しくありません');
    }

    /* ---------------- Applying edits ---------------- */
    const ATTR_NAME = /^[a-zA-Z_:][-a-zA-Z0-9_:.]*$/;

    function reindent(html, indent, nl) {
        const lines = trimHtmlWs(String(html).replace(/\r\n?/g, '\n')).split('\n');
        if (lines.length === 1) return lines[0];
        const rest = lines.slice(1);
        const used = rest.filter(hasNonWs).map((l) => /^[ \t]*/.exec(l)[0].length);
        const min = used.length ? Math.min.apply(null, used) : 0;
        return [lines[0]].concat(rest.map((l) => (hasNonWs(l) ? indent + l.slice(min) : ''))).join(nl);
    }

    // Collects the patches for `edits` and returns render(a, b): src[a, b) with the patches applied.
    function makeRenderer(src, doc, edits) {
        checkDoc(src, doc);
        edits = edits || {};
        const nodes = doc.nodes;
        const nl = detectNewline(src);
        const patches = [];
        const nodeOf = (key) => {
            const id = typeof key === 'number' ? key : /^[0-9]+$/.test(String(key)) ? Number(key) : NaN;
            const nd = nodes[id];
            if (!nd) throw new Error('見つからない要素です: ' + key);
            return nd;
        };
        const innerPatch = (nd, extra) => {
            if (!nd.explicitClose) throw new Error('閉じタグのない要素は書き換えできません: <' + nd.tag + '>');
            return Object.assign({ start: nd.openEnd, end: nd.closeStart }, extra);
        };

        for (const key of Object.keys(edits.texts || {})) {
            const html = edits.texts[key];
            validateInlineHtml(html);
            patches.push(innerPatch(nodeOf(key), { text: html }));
        }

        const attrPatches = (nd, values) => {
            const inserts = [];
            let lastRemoved = null;
            for (const name of Object.keys(values || {})) {
                const lname = name.toLowerCase();
                if (!ATTR_NAME.test(name) || lname.startsWith('on')) throw new Error('この属性は変更できません: ' + name);
                const value = values[name];
                const a = nd.attrs.find((x) => x.name === lname);
                if (value === null || value === undefined) {
                    if (!a) continue;
                    let from = a.start;
                    while (isWsCode(src.charCodeAt(from - 1))) from--;
                    patches.push({ start: from, end: a.end, text: '' });
                    lastRemoved = a;
                } else if (a && a.quote === '"') {
                    patches.push({ start: a.valueStart, end: a.valueEnd, text: escapeAttr(value) });
                } else if (a && a.quote === "'") {
                    patches.push({ start: a.valueStart, end: a.valueEnd, text: escapeAttr(value).replace(/'/g, '&#39;') });
                } else if (a) {
                    patches.push({ start: a.start, end: a.end, text: src.slice(a.start, a.nameEnd) + '="' + escapeAttr(value) + '"' });
                } else {
                    inserts.push(' ' + lname + '="' + escapeAttr(value) + '"');
                }
            }
            if (inserts.length) {
                patches.push({ start: nd.attrInsert, end: nd.attrInsert, text: attrInsertText(nd, inserts.join(''), lastRemoved) });
            }
        };
        for (const key of Object.keys(edits.attrs || {})) attrPatches(nodeOf(key), edits.attrs[key]);

        for (const key of Object.keys(edits.lists || {})) {
            const rootNode = nodeOf(key);
            const order = edits.lists[key];
            if (!Array.isArray(order)) throw new Error('並び順の指定が正しくありません');
            const seen = new Set();
            const expectTag = rootNode.children.length ? nodes[rootNode.children[0]].tag : null;
            for (const item of order) {
                if (item && item.id !== undefined && item.id !== null) {
                    const id = Number(item.id);
                    if (rootNode.children.indexOf(id) < 0) throw new Error('この一覧の項目ではありません: ' + item.id);
                    if (seen.has(id)) throw new Error('同じ項目が二重に指定されています: ' + item.id);
                    seen.add(id);
                } else if (item && typeof item.html === 'string') {
                    validateBlockHtml(item.html, expectTag);
                } else {
                    throw new Error('並び順の指定が正しくありません');
                }
            }
            patches.push(innerPatch(rootNode, { list: { root: rootNode, order } }));
        }

        if (edits.meta) metaPatches(src, doc, edits.meta, patches, attrPatches, nl);

        // Check nesting: only a list patch may contain other patches (re-applied inside each kept child).
        patches.sort(patchOrder);
        const open = [];
        for (const p of patches) {
            while (open.length && p.start >= open[open.length - 1].end) open.pop();
            const o = open[open.length - 1];
            if (o) {
                if (p.end > o.end || (p.start === o.start && p.end === o.end) || !o.list) {
                    throw new Error('同じ場所への編集が重なっています');
                }
            }
            if (p.end > p.start) open.push(p);
        }

        function renderRange(a, b) {
            let out = '';
            let pos = a;
            for (const p of patches) {
                // a zero-length insert at b belongs to the following range (except at the very end)
                if (p.start < a || p.end > b || (p.start === b && b < src.length)) continue;
                if (p.start < pos) continue; // nested inside the patch just applied
                out += src.slice(pos, p.start) + (p.list ? renderList(p.list) : p.text);
                pos = p.end;
            }
            return out + src.slice(pos, b);
        }

        function renderList(spec) {
            const rootNode = spec.root;
            const kids = rootNode.children.map((id) => nodes[id]);
            const renderChild = (nd) => renderRange(nd.start, nd.end);
            const existing = spec.order.filter((x) => x.id !== undefined && x.id !== null).map((x) => Number(x.id));

            if (!kids.length) {
                if (!spec.order.length) return src.slice(rootNode.openEnd, rootNode.closeStart);
                const rootIndent = lineIndentAt(src, rootNode.start) || '';
                const indent = rootIndent + (rootIndent.indexOf('\t') >= 0 ? '\t' : '    ');
                return nl + indent + spec.order.map((x) => reindent(x.html, indent, nl)).join(nl + indent) + nl + rootIndent;
            }

            const first = kids[0];
            const last = kids[kids.length - 1];
            const indent = lineIndentAt(src, first.start);
            const gap = kids.length > 1 ? src.slice(first.end, kids[1].start) : null;
            const sep = gap !== null && HTML_WS_ONLY.test(gap) ? gap : indent !== null ? nl + indent : '';
            const fresh = (html) => reindent(html, indent || '', nl);
            const unchangedOrder = existing.length === kids.length && existing.every((id, k) => id === kids[k].id);

            if (unchangedOrder) {
                // Only additions: keep everything (comments too) and slot new items in place.
                let out = '';
                let pos = rootNode.openEnd;
                let pending = [];
                for (const item of spec.order) {
                    if (typeof item.html === 'string' && (item.id === undefined || item.id === null)) { pending.push(item.html); continue; }
                    const nd = nodes[Number(item.id)];
                    out += src.slice(pos, nd.start) + pending.map((h) => fresh(h) + sep).join('') + renderChild(nd);
                    pos = nd.end;
                    pending = [];
                }
                return out + pending.map((h) => sep + fresh(h)).join('') + src.slice(pos, rootNode.closeStart);
            }

            // Restructured: original leading/trailing whitespace, children joined by sep, comments dropped.
            const lead = src.slice(rootNode.openEnd, first.start);
            let leadWs = /[ \t\n\f\r]*$/.exec(lead)[0];
            if (leadWs !== lead && !/[\r\n]/.test(leadWs)) leadWs = /^[ \t\n\f\r]*/.exec(lead)[0];
            const trail = src.slice(last.end, rootNode.closeStart);
            let trailWs = /[ \t\n\f\r]*$/.exec(trail)[0]; // the run before the closing tag sets its indent
            if (trailWs !== trail && !/[\r\n]/.test(trailWs)) trailWs = /^[ \t\n\f\r]*/.exec(trail)[0];
            if (!spec.order.length) return trailWs;
            const parts = spec.order.map((item) =>
                item.id !== undefined && item.id !== null ? renderChild(nodes[Number(item.id)]) : fresh(item.html));
            return leadWs + parts.join(sep) + trailWs;
        }

        return { count: patches.length, render: renderRange };
    }

    /**
     * applyEdits(src, doc, edits) → new source. edits = {
     *   texts: {id: innerHtml}, attrs: {id: {name: value|null}}, lists: {rootId: [{id} | {html}]},
     *   meta: {title, description} }
     * Every untouched byte is kept; applyEdits(src, doc, {}) === src.
     */
    function applyEdits(src, doc, edits) {
        const r = makeRenderer(src, doc, edits);
        return r.count ? r.render(0, src.length) : src;
    }

    // Source of one element (its original slice) with the edits inside it applied.
    function renderNode(src, doc, edits, id) {
        const nd = doc.nodes[id];
        if (!nd) throw new Error('見つからない要素です: ' + id);
        return makeRenderer(src, doc, edits).render(nd.start, nd.end);
    }

    /* ---------------- Page meta (title / description) ---------------- */
    function findDescriptionMeta(doc) {
        for (const id of doc.byTag.meta || []) {
            const nd = doc.nodes[id];
            if ((getAttr(nd, 'name') || '').toLowerCase() === 'description' && nd.ns === 'html') return nd;
        }
        return null;
    }

    function getPageMeta(src, doc) {
        checkDoc(src, doc);
        const title = doc.title !== null ? collapseWs(textContent(doc, doc.title)) : '';
        const meta = findDescriptionMeta(doc);
        return { title, description: meta ? collapseWs(getAttr(meta, 'content')) : '' };
    }

    function metaPatches(src, doc, meta, patches, attrPatches, nl) {
        const current = getPageMeta(src, doc);
        const clean = (v) => collapseWs(String(v).replace(/[\r\n]+/g, ' '));
        const head = doc.head !== null ? doc.nodes[doc.head] : null;
        const titleNode = doc.title !== null ? doc.nodes[doc.title] : null;
        const descNode = findDescriptionMeta(doc);
        const headInserts = [];

        // indentation of head children (from the first one)
        const firstChild = head && head.children.length ? doc.nodes[head.children[0]] : null;
        const childIndent = (firstChild && lineIndentAt(src, firstChild.start)) || '';

        if (meta.title !== undefined && meta.title !== null && clean(meta.title) !== current.title) {
            if (titleNode) {
                if (!titleNode.explicitClose) throw new Error('<title> に閉じタグがありません');
                patches.push({ start: titleNode.openEnd, end: titleNode.closeStart, text: escapeText(clean(meta.title)) });
            } else {
                headInserts.push('<title>' + escapeText(clean(meta.title)) + '</title>');
            }
        }
        if (meta.description !== undefined && meta.description !== null && clean(meta.description) !== current.description) {
            if (descNode) {
                attrPatches(descNode, { content: clean(meta.description) });
            } else {
                const tag = '<meta name="description" content="' + escapeAttr(clean(meta.description)) + '">';
                if (titleNode && headInserts.length === 0) {
                    const ind = lineIndentAt(src, titleNode.start);
                    patches.push({ start: titleNode.end, end: titleNode.end, text: (ind !== null ? nl + ind : '') + tag });
                } else {
                    headInserts.push(tag);
                }
            }
        }
        if (headInserts.length) {
            if (!head) throw new Error('ページに <head> がありません');
            const closeAt = head.explicitClose ? head.closeStart : head.end;
            const lineStart = lineIndentAt(src, closeAt);
            if (lineStart !== null) {
                const at = closeAt - lineStart.length;
                patches.push({ start: at, end: at, text: headInserts.map((t) => childIndent + t + nl).join('') });
            } else {
                patches.push({ start: closeAt, end: closeAt, text: headInserts.join('') });
            }
        }
    }

    function setPageMeta(src, doc, meta) {
        return applyEdits(src, doc, { meta: meta || {} });
    }

    /* ---------------- 共通情報: site-wide exact replacement ---------------- */
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const htmlEscapeAll = (s) => String(s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const jsEscape = (s) => String(s).replace(/[\\'"`\n\r\u2028\u2029]|\$\{/g, (c) =>
        ({ '\\': '\\\\', "'": "\\'", '"': '\\"', '`': '\\`', '\n': '\\n', '\r': '\\r', '\u2028': '\\u2028', '\u2029': '\\u2029', '${': '\\${' })[c]);

    /**
     * planGlobalReplace(sourcesByPath, [{from, to, key?}]) → { results: {path: newText}, counts: [{path, key, count}] }
     * All pairs are replaced in one pass (no cascading). `to` is escaped for HTML or JS string literals.
     */
    function planGlobalReplace(sourcesByPath, pairs) {
        if (!Array.isArray(pairs) || !pairs.length) throw new Error('置き換える内容がありません');
        const froms = new Set();
        for (const p of pairs) {
            if (!p || typeof p.from !== 'string' || p.from === '') throw new Error('置き換え前の文字が空です');
            if (typeof p.to !== 'string') throw new Error('置き換え後の文字が正しくありません');
            if (p.from === p.to) throw new Error('置き換え前と後が同じです: ' + p.from);
            if (froms.has(p.from)) throw new Error('同じ文字が二重に指定されています: ' + p.from);
            froms.add(p.from);
        }
        const results = {};
        const counts = [];
        for (const [path, text] of entriesOf(sourcesByPath)) {
            if (typeof text !== 'string') continue;
            const kind = /\.html?$/i.test(path) ? 'html' : /\.[cm]?js$/i.test(path) ? 'js' : 'raw';
            // inside an HTML page, <script> content is a JS (or JSON-LD) string context, not HTML
            const htmlDoc = kind === 'html' ? parse(text) : null;
            const scripts = htmlDoc ? (htmlDoc.byTag.script || []).map((id) => htmlDoc.nodes[id]) : [];
            const scriptAt = (offset) => scripts.find((nd) => offset >= nd.openEnd && offset < nd.closeStart);
            const lookupMap = new Map(); // matched text → pair index
            pairs.forEach((p, idx) => {
                lookupMap.set(p.from, idx);
                const escaped = htmlEscapeAll(p.from);
                if (kind === 'html' && escaped !== p.from && !lookupMap.has(escaped)) lookupMap.set(escaped, idx);
            });
            const patterns = Array.from(lookupMap.keys()).sort((a, b) => b.length - a.length).map(escapeRegExp);
            const re = new RegExp(patterns.join('|'), 'g');
            const perPair = pairs.map(() => 0);
            const replaced = text.replace(re, (m, offset) => {
                const idx = lookupMap.get(m);
                perPair[idx]++;
                const to = pairs[idx].to;
                if (kind === 'js') return jsEscape(to);
                if (kind !== 'html') return to;
                const script = scriptAt(offset);
                if (!script) return htmlEscapeAll(to);
                const json = /json/i.test(getAttr(script, 'type') || '');
                return (json ? JSON.stringify(to).slice(1, -1) : jsEscape(to)).replace(/</g, '\\u003c');
            });
            perPair.forEach((count, idx) => {
                if (count) counts.push({ path, key: pairs[idx].key !== undefined ? pairs[idx].key : pairs[idx].from, count });
            });
            if (replaced !== text) results[path] = replaced;
        }
        return { results, counts };
    }

    return {
        VOID_TAGS, INLINE_OK, TEXT_TAGS, EXCLUDED_TAGS,
        parse, classify, buildPreview, serializeInline, applyEdits, renderNode,
        escapeText, escapeAttr, textToInlineHtml, decodeEntities,
        resolvePath, findImageUsages, getPageMeta, setPageMeta, planGlobalReplace,
        getAttr, hasClass, textContent, select, matches,
        validateInlineHtml, validateBlockHtml
    };
}));

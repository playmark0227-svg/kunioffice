/* ============================================================
   KUNI OFFICE 管理画面 — 全体の流れ
   アクセスキーの確認 → サイトの読み込み → ページの切り替え → 公開
   （アクセスキーは最初の1回だけ入力し、既定で「この端末に記憶する」。作り方は setup.html）
   （保存は GitHub の main への保存。約1分でサイトに反映されます）
   ============================================================ */
(function () {
    'use strict';

    const cfg = window.CMS_CONFIG;
    const C = window.CMSCore;
    const GitHub = window.CMSGitHub;
    const UI = window.CMSUI;
    const P = window.CMSPanels;
    const { PageEditor } = window.CMSEditor;
    const { h, icon, toast, confirmDialog, store } = UI;

    const TOKEN_KEY = 'kunioffice-admin-key';
    // 記憶していたアクセスキー（または編集中のアクセスキー）が GitHub に断られたとき
    const EXPIRED_MESSAGE = 'アクセスキーの期限が切れたか、無効になりました。ViFightに新しいキーをもらってください。';
    // 古い形式（ghp_ など）のキーは、持ち主のすべてのリポジトリを操作できてしまうので、送らず・記憶せずに断る
    const CLASSIC_MESSAGE = '古い形式のキーです。ViFightに「github_pat_」で始まるキーをもらってください。';
    const PREFS_KEY = 'kunioffice-admin-prefs';
    const DEPLOY_POLL_MS = 5000;
    const DEPLOY_MAX_MS = 5 * 60 * 1000;
    const LOAD_CONCURRENCY = 6;
    // 共通情報で書き換えるファイル（管理画面・マニュアルなどは除く）
    const TEXT_FILE = /\.(html|js)$/i;
    const IMAGE_TYPES = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' };
    const IMAGE_FILE = /\.(jpe?g|png|webp|gif)$/i;
    const SKIP_PATH = /^(admin|manual|\.github|node_modules)\/|(^|\/)node_modules\/|^server\.js$/;
    // 管理画面が保存・取り消しをしてよいファイル: サイトのページ・写真・共通情報で書き換える .html / .js だけ
    // （管理画面そのもの・公開の仕組み・デザイン（CSS）などは、サイト管理者だけが変える）
    const isProtectedPath = (path) => SKIP_PATH.test(path) || !(TEXT_FILE.test(path) || IMAGE_FILE.test(path));

    const $ = (id) => document.getElementById(id);
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const isTouch = window.matchMedia && window.matchMedia('(hover: none)').matches;

    /* ---------- 設定の保存（このブラウザだけ） ---------- */
    function loadPrefs() {
        try {
            return JSON.parse(store.get(PREFS_KEY) || '{}') || {};
        } catch (e) {
            return {};
        }
    }
    const prefs = loadPrefs();
    function savePref(key, value) {
        prefs[key] = value;
        store.set(PREFS_KEY, JSON.stringify(prefs));
    }

    const app = {
        cfg,
        siteBase: new URL('../', location.href).href,
        gh: null,
        snapshot: null,
        editors: new Map(),   // path → PageEditor（開いたページは閉じずに残す）
        current: null,
        images: new Map(),    // repoPath → { blobUrl, base64, size, fromPage, isNew }（未公開の写真）
        recent: new Map(),    // repoPath → 表示用 URL（公開したが、まだ反映中の写真）
        recentSha: new Map(), // repoPath → その写真を公開した保存（どの反映が終われば、サイトの写真に切り替えてよいか）
        showTargets: prefs.showTargets !== undefined ? !!prefs.showTargets : isTouch,
        busy: false,
        deploying: 0,         // 反映を確認中の公開の数（続けて公開すると2つ以上になる）
        leaving: false
    };

    /* ============================================================
       画面の切り替え
       ============================================================ */
    function setView(name) {
        $('bootView').hidden = name !== 'boot';
        $('loginView').hidden = name !== 'login';
        $('editorView').hidden = name !== 'editor';
        if (name !== 'editor') closeMenu();
    }

    function showBoot(text) {
        setView('boot');
        $('bootStatus').hidden = false;
        $('bootError').hidden = true;
        $('bootText').textContent = text;
    }

    // opts.retryLabel: 「もう一度読み込む」の代わりの文言
    // opts.otherKey: 「別のアクセスキーを入れる」も出す（記憶したキーは、新しいキーが使えるまで消さない）
    function showBootError(text, retry, opts) {
        const o = opts || {};
        setView('boot');
        $('bootStatus').hidden = true;
        $('bootError').hidden = false;
        $('bootErrorText').textContent = text;
        $('bootRetry').textContent = o.retryLabel || 'もう一度読み込む';
        $('bootRetry').onclick = retry;
        $('bootOtherKey').hidden = !o.otherKey;
        $('bootOtherKey').onclick = o.otherKey ? () => showLogin('') : null;
    }

    // canGoBack: 編集の途中で別のアクセスキーに替えるとき（「編集画面に戻る」を出す）
    function showLogin(message, canGoBack) {
        setView('login');
        const err = $('loginError');
        err.replaceChildren();
        if (message) err.append(icon('alert'), h('span', { text: message }));
        err.hidden = !message;
        $('loginBack').hidden = !(canGoBack && app.gh && app.snapshot);
        setTimeout(() => $('tokenInput').focus(), 50);
    }

    /* ============================================================
       アクセスキー（この端末で使えるようにする）
       ============================================================ */
    function readToken() {
        return store.get(TOKEN_KEY, 'local') || store.get(TOKEN_KEY, 'session');
    }

    function saveToken(token, remember) {
        clearToken();
        store.set(TOKEN_KEY, token, remember ? 'local' : 'session');
    }

    function clearToken() {
        store.remove(TOKEN_KEY, 'local');
        store.remove(TOKEN_KEY, 'session');
    }

    function makeClient(token) {
        return new GitHub({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, token, workflowName: cfg.workflowName, isProtectedPath });
    }

    function loginMessage(err) {
        if (err && err.code === 'readonly') return 'このアクセスキーでは編集できません（読み取り専用です）。ViFightに、キーの「Repository access」で kunioffice を選び、「Contents」を「Read and write」にしてもらってください。';
        if (err && err.code === 'too_broad') return 'このアクセスキーは kunioffice 以外のサイトも操作できてしまうため、使えません。ViFightに、「Repository access」で kunioffice だけを選んだキーをもらってください。';
        if (err && err.code === 'classic') return CLASSIC_MESSAGE;
        if (err && err.code === 'forbidden') return 'このアクセスキーでは、このサイトを開けません（権限がありません）。ViFightに、キーの設定を確かめてもらってください。';
        if (err && err.code === 'unauthorized') return 'アクセスキーが正しくないか、有効期限が切れています';
        if (err && err.code === 'network') return 'インターネットに接続できません';
        if (err && err.code === 'not_found') return 'このアクセスキーでは、このサイトを開けません。ViFightに、キーの「Repository access」で kunioffice を選んでもらってください。';
        return errorMessage(err);
    }

    // 貼り付けたときに入りがちな空白・改行は取り除く（アクセスキーに空白は含まれない）
    function cleanKey(value) {
        return String(value || '').replace(/\s+/g, '');
    }

    async function login(token, remember, auto) {
        const btn = $('loginBtn');
        btn.disabled = true;
        btn.classList.add('is-busy');
        btn.replaceChildren(UI.spinner(), '確認しています…');
        try {
            if (GitHub.isClassicKey(token)) throw Object.assign(new Error('classic'), { code: 'classic' });
            const gh = makeClient(token);
            const result = await gh.verify();
            if (!result.canPush) throw Object.assign(new Error('readonly'), { code: 'readonly' });
            // 入力されたキーは、記憶する前に「kunioffice だけを操作できるキーか」を確かめる
            // （自動では確かめられなかったときは、そのまま進める。確認済みのキーで締め出さないため）
            if (!auto) {
                const scope = await gh.checkScope().catch(() => null);
                if (scope && !scope.onlyThisRepo) throw Object.assign(new Error('too_broad'), { code: 'too_broad' });
            }
            app.gh = gh;
            saveToken(token, remember);
            $('tokenInput').value = '';
            if (app.snapshot) {
                // 期限切れからの再ログイン: 編集中の内容はそのまま続ける
                setView('editor');
                toast('アクセスキーを確認しました。編集を続けられます。', { type: 'success' });
            } else {
                await startSession();
            }
        } catch (err) {
            if (auto && err.code !== 'unauthorized' && err.code !== 'classic') {
                // 記憶したキーはそのまま（消すのは、GitHub に「キーが無効」と言われたときだけ）。
                // つながらない → 「もう一度読み込む」。キーの設定の問題（kunioffice が選ばれていない・読み取り専用など）
                // → ViFightが GitHub で同じキーの設定を直せば、「もう一度確かめる」でそのまま使える
                const keyProblem = err.code === 'readonly' || err.code === 'not_found' || err.code === 'forbidden';
                showBootError(loginMessage(err) + (keyProblem ? '直してもらったら「もう一度確かめる」を押してください。' : ''), () => {
                    showBoot('管理画面を開いています…');
                    login(token, remember, true);
                }, keyProblem ? { retryLabel: 'もう一度確かめる', otherKey: true } : null);
                return;
            }
            if (auto) clearToken();
            showLogin(auto && err.code === 'unauthorized' ? EXPIRED_MESSAGE : loginMessage(err));
        } finally {
            btn.disabled = false;
            btn.classList.remove('is-busy');
            btn.replaceChildren('管理画面を開く');
        }
    }

    function bindLogin() {
        $('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const token = cleanKey($('tokenInput').value);
            if (!token) {
                showLogin('アクセスキーを入力してください');
                return;
            }
            login(token, $('rememberInput').checked, false);
        });
        $('loginBack').addEventListener('click', () => {
            if (!app.gh || !app.snapshot) return;
            $('tokenInput').value = '';
            setView('editor');
        });
        $('tokenToggle').addEventListener('click', () => {
            const input = $('tokenInput');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            $('tokenToggle').textContent = show ? '隠す' : '表示';
            $('tokenToggle').setAttribute('aria-pressed', String(show));
        });
    }

    // 編集の途中でアクセスキーが使えなくなったとき（編集中の内容はメモリに残す）
    function expireSession() {
        clearToken();
        app.gh = null;
        showLogin(EXPIRED_MESSAGE + '編集中の内容はそのまま残っています。新しいキーを入れると、続きから公開できます。');
    }

    // 書き込みの権限がないアクセスキーだったとき: 編集はそのまま、別のアクセスキーを入れられるようにする
    function switchKey() {
        showLogin('書き込みができるアクセスキーを入力してください。編集中の内容はそのまま残っています。', true);
    }

    function handleAuthError(err) {
        if (err && err.code === 'unauthorized') {
            expireSession();
            return true;
        }
        return false;
    }

    function errorMessage(err) {
        if (!err) return 'エラーが発生しました。';
        if (err.code === 'network') return '通信に失敗しました。インターネットの接続を確かめて、もう一度お試しください。';
        if (err.code === 'rate_limited') {
            const at = err.resetAt ? '（' + UI.formatJst(err.resetAt).slice(11) + ' ごろから使えます）' : '';
            return 'アクセスが集中しています。しばらく待ってからもう一度お試しください' + at;
        }
        return err.message || 'エラーが発生しました。';
    }

    // 記憶したキーは、この端末にある唯一のキーのことが多い。消す前に、必ず確かめる
    function logout() {
        const n = totalChanges();
        confirmDialog({
            title: 'ログアウトしますか？',
            message: h('div', null,
                h('p', { class: 'modal__text', text: 'ログアウトすると、次に開くときアクセスキーがもう一度必要です（ViFightにもらいます）。' }),
                n > 0 ? h('p', { class: 'modal__text', text: 'まだ公開していない変更（' + n + '件）は消えます。' }) : null),
            ok: 'ログアウトする',
            danger: true
        }).then((ok) => {
            if (!ok) return;
            clearToken();
            app.leaving = true;
            location.reload();
        });
    }

    /* ============================================================
       サイトの読み込み
       ============================================================ */
    async function startSession() {
        showBoot('サイトの内容を読み込んでいます…');
        try {
            app.snapshot = await app.gh.snapshot();
        } catch (err) {
            if (handleAuthError(err)) return;
            showBootError('サイトの内容を読み込めませんでした。' + errorMessage(err), () => startSession());
            return;
        }
        buildPicker();
        setView('editor');
        const first = cfg.pages.find((p) => p.path === prefs.lastPage) || cfg.pages[0];
        openPage(first.path);
        if (!prefs.introSeen) {
            savePref('introSeen', true);
            setTimeout(() => P.intro(app), 400);
        }
    }

    function buildPicker() {
        const picker = $('pagePicker');
        picker.replaceChildren();
        const groups = new Map();
        for (const page of cfg.pages) {
            if (!groups.has(page.group)) {
                const g = h('optgroup', { label: page.group });
                groups.set(page.group, g);
                picker.appendChild(g);
            }
            groups.get(page.group).appendChild(h('option', { value: page.path, text: page.label }));
        }
    }

    function pageOf(path) {
        return cfg.pages.find((p) => p.path === path) || null;
    }

    async function openPage(path) {
        const page = pageOf(path);
        if (!page) return;
        closeMenu();
        const prev = app.editors.get(app.current);
        if (prev && app.current !== path) prev.setVisible(false);
        app.current = path;
        savePref('lastPage', path);
        $('pagePicker').value = path;
        updateSubbar();

        let ed = app.editors.get(path);
        if (ed) {
            ed.setVisible(true);
            setStage(ed.ready ? null : 'loading');
            refreshChrome();
            return;
        }
        setStage('loading', page.label + 'を読み込んでいます…');
        refreshChrome();
        try {
            const entry = app.snapshot.files.get(path);
            if (!entry) throw new Error('このページのファイルが見つかりません（' + path + '）。');
            const src = await app.gh.getBlobText(entry.sha);
            if (app.editors.has(path)) return; // 読み込み中に二重に開かれた
            ed = new PageEditor(app, page, src, entry.sha);
            ed.visible = app.current === path;
            app.editors.set(path, ed);
            ed.mount($('frames'));
        } catch (err) {
            if (handleAuthError(err)) return;
            if (app.current === path) setStage('error', 'ページを読み込めませんでした。', errorMessage(err), () => openPage(path));
        }
    }

    function replaceEditor(path, src, sha) {
        const old = app.editors.get(path);
        const page = pageOf(path);
        const ed = new PageEditor(app, page, src, sha);
        ed.visible = old ? old.visible : app.current === path;
        ed.restoreY = old && old.fwin ? old.fwin.scrollY : 0;
        if (old) old.destroy();
        app.editors.set(path, ed);
        if (ed.visible) setStage('loading', '最新の内容を表示しています…');
        ed.mount($('frames'));
    }

    // 最新の状態を読み直し、変わったページを作り直す（resetPaths は変更を捨てて作り直す）
    async function refreshSnapshot(resetPaths) {
        const reset = new Set(resetPaths || []);
        const snap = await app.gh.snapshot();
        app.snapshot = snap;
        for (const ed of Array.from(app.editors.values())) {
            const entry = snap.files.get(ed.path);
            if (!entry) continue;
            if (entry.sha !== ed.blobSha) {
                if (!reset.has(ed.path) && ed.hasChanges()) continue; // 編集中の内容は消さない
                replaceEditor(ed.path, await app.gh.getBlobText(entry.sha), entry.sha);
            } else if (reset.has(ed.path)) {
                ed.reload();
                if (ed.visible) setStage('loading', '最新の内容を表示しています…');
            }
        }
        refreshChrome();
    }

    // すべて捨てて最新を読み込み直す（競合したとき）
    async function reloadAll() {
        for (const ed of app.editors.values()) ed.destroy();
        app.editors.clear();
        for (const img of app.images.values()) URL.revokeObjectURL(img.blobUrl);
        app.images.clear();
        app.recent.clear();
        app.recentSha.clear();
        refreshChrome();
        setStage('loading', '最新の内容を読み込んでいます…');
        try {
            app.snapshot = await app.gh.snapshot();
        } catch (err) {
            if (handleAuthError(err)) return;
            setStage('error', '最新の内容を読み込めませんでした。', errorMessage(err), () => reloadAll());
            return;
        }
        await openPage(app.current || cfg.pages[0].path);
        toast('最新の内容を読み込みました。', { type: 'success' });
    }

    /* ---------- プレビューの上の表示（読み込み中・エラー） ---------- */
    function setStage(state, message, detail, retry) {
        const box = $('stageState');
        if (!state) {
            box.hidden = true;
            box.replaceChildren();
            return;
        }
        box.hidden = false;
        if (state === 'loading') {
            box.replaceChildren(h('div', { class: 'stage-state__box', 'aria-live': 'polite' },
                h('div', { class: 'stage-state__page', 'aria-hidden': 'true' },
                    h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' }), h('span', { class: 'skeleton' })),
                h('p', { class: 'stage-state__msg' }, UI.spinner(), h('span', { text: message || 'ページを表示しています…' }))));
        } else {
            box.replaceChildren(h('div', { class: 'stage-state__box', role: 'alert' },
                h('p', { class: 'stage-state__msg' }, icon('alert'), h('span', { text: message })),
                detail ? h('p', { class: 'stage-state__detail', text: detail }) : null,
                retry ? h('button', { class: 'btn btn--primary', type: 'button', text: 'もう一度読み込む', on: { click: retry } }) : null));
        }
    }

    /* ============================================================
       編集の状態 → 上のバーの表示
       ============================================================ */
    function totalChanges() {
        let n = 0;
        for (const ed of app.editors.values()) if (ed.ready) n += ed.summary().total;
        return n;
    }

    let refreshQueued = false;
    function refreshChrome() {
        if (refreshQueued) return;
        refreshQueued = true;
        requestAnimationFrame(() => {
            refreshQueued = false;
            let total = 0;
            const dirty = new Set();
            for (const ed of app.editors.values()) {
                if (!ed.ready) continue;
                const n = ed.summary().total;
                total += n;
                if (n) dirty.add(ed.path);
            }
            const count = $('changeCount');
            count.textContent = total ? '未公開の変更 ' + total + '件' : '未公開の変更はありません';
            count.classList.toggle('has-changes', total > 0);
            const badge = $('publishBadge');
            badge.textContent = String(total);
            badge.hidden = !total;
            $('publishBtn').disabled = !total || app.busy || !navigator.onLine;
            $('publishBtn').title = !navigator.onLine ? 'インターネットにつながると公開できます' : '';
            const cur = app.editors.get(app.current);
            $('revertBtn').disabled = !(cur && dirty.has(cur.path)) || app.busy;
            for (const opt of $('pagePicker').options) {
                const page = pageOf(opt.value);
                opt.textContent = page.label + (dirty.has(opt.value) ? ' ●' : '');
            }
            $('addWorkBtn').hidden = !(cur && cur.ready && cur.hasCollections);
            document.title = (total ? '(' + total + ') ' : '') + '管理画面 | KUNI OFFICE';
        });
    }

    const DEFAULT_HINT = isTouch
        ? '文字をタップすると書き換えられます。写真をタップすると差し替えられます。'
        : '文字をクリックすると、その場で書き換えられます。写真をクリックすると差し替えられます。';

    function setHint(editing) {
        const hint = $('hint');
        hint.classList.toggle('is-editing', !!editing);
        hint.replaceChildren(icon(editing ? 'edit' : 'info'), h('span', {
            text: editing ? '書き換え中です。Enter で改行、ほかの場所をクリックすると完了します。' : DEFAULT_HINT
        }));
    }

    function updateSubbar() {
        const link = $('viewSiteLink');
        link.href = cfg.siteUrl + (app.current || '');
        link.replaceChildren(icon('external'), h('span', { text: 'サイトで見る' }));
    }

    /* ---------- PageEditor から呼ばれるもの ---------- */
    app.pageUrl = (path) => new URL(path, app.siteBase).href;
    app.changed = () => refreshChrome();
    app.onEditing = (ed, el) => setHint(!!el);
    app.onEditorReady = (ed) => {
        if (ed.path === app.current) setStage(null);
        ed.setShowTargets(app.showTargets);
        refreshChrome();
    };
    app.switchPage = (path) => openPage(path);
    app.hasUnsaved = () => totalChanges() > 0;
    app.handleAuthError = handleAuthError;
    app.errorMessage = errorMessage;

    // リンク先が編集できるページならそのページ
    app.editablePageFor = (fromPath, href) => {
        let s = String(href || '').trim().split('#')[0].split('?')[0];
        if (!s) return null;
        if (s === '.' || s === '..' || /\/$/.test(s)) s = s.replace(/\/?$/, '/') + 'index.html';
        const repoPath = C.resolvePath(fromPath, s);
        return repoPath ? pageOf(repoPath) : null;
    };

    // ページ名・写真名など、人が読める呼び名
    app.describePath = (path) => {
        const page = pageOf(path);
        if (page) return page.label;
        if (/\.(jpe?g|png|webp|gif|svg)$/i.test(path)) return '写真（' + path.split('/').pop() + '）';
        return path;
    };

    // いくつかのファイルを、読める短い一覧に: 「ホーム、実績、写真 3枚、ほかのファイル 4件」
    app.describePaths = (paths) => {
        const pages = [];
        let photos = 0;
        let others = 0;
        for (const path of Array.from(new Set(paths || []))) {
            const page = pageOf(path);
            if (page) pages.push(page.label);
            else if (/\.(jpe?g|png|webp|gif|svg)$/i.test(path)) photos++;
            else others++;
        }
        const out = Array.from(new Set(pages));
        if (photos) out.push('写真 ' + photos + '枚');
        if (others) out.push('ほかのファイル ' + others + '件（サイト全体で使う部分）');
        return out;
    };

    /* ---------- 写真 ---------- */
    app.setImage = (repoPath, prepared, fromPage, isNew) => {
        const old = app.images.get(repoPath);
        // 追加した実績の写真を選び直しても「追加した項目の写真」のまま（写真の差し替えとは数えない）
        app.images.set(repoPath, { blobUrl: prepared.blobUrl, base64: prepared.base64, size: prepared.size, fromPage, isNew: !!isNew || !!(old && old.isNew) });
        for (const ed of app.editors.values()) ed.applyImage(repoPath, prepared.blobUrl, true);
        if (old && old.blobUrl !== prepared.blobUrl) setTimeout(() => URL.revokeObjectURL(old.blobUrl), 1000);
        refreshChrome();
    };

    app.dropImage = (repoPath) => {
        const img = app.images.get(repoPath);
        if (!img) return;
        app.images.delete(repoPath);
        const fallback = app.recent.get(repoPath) || null;
        for (const ed of app.editors.values()) ed.applyImage(repoPath, fallback, false);
        setTimeout(() => URL.revokeObjectURL(img.blobUrl), 1000);
        refreshChrome();
    };

    // プレビューで見せる写真の URL（未公開の写真・公開したが反映待ちの写真）。なければ null
    app.imageUrlFor = (repoPath) => (app.images.has(repoPath) ? app.images.get(repoPath).blobUrl : app.recent.get(repoPath) || null);

    app.applyImagesTo = (ed) => {
        for (const [path, url] of app.recent) ed.applyImage(path, url, false);
        for (const [path, img] of app.images) ed.applyImage(path, img.blobUrl, true);
    };

    app.pendingImagesFrom = (pagePath) => Array.from(app.images.entries())
        .filter(([, img]) => img.fromPage === pagePath && !img.isNew).map(([path]) => path);

    app.openImageDialog = (opts) => P.imageDialog(app, opts);

    // 新しい実績の写真の置き場所: images/works/work-YYYYMMDD-HHmmss.jpg（同じ名前があれば -2, -3…）
    app.newImagePath = (pagePath, dir) => {
        const stamp = UI.jstStamp(new Date());
        for (let n = 1; ; n++) {
            const src = dir + 'work-' + stamp + (n > 1 ? '-' + n : '') + '.jpg';
            const repoPath = C.resolvePath(pagePath, src);
            if (!app.snapshot.files.has(repoPath) && !app.images.has(repoPath)) return { src, repoPath };
        }
    };

    /* ---------- サイトのファイルの読み込み（同じものは GitHub クライアントが覚えている） ---------- */
    async function loadSources(paths) {
        const out = new Map();
        const queue = paths.slice();
        const worker = async () => {
            while (queue.length) {
                const path = queue.shift();
                out.set(path, await app.gh.getBlobText(app.snapshot.files.get(path).sha));
            }
        };
        await Promise.all(Array.from({ length: Math.min(LOAD_CONCURRENCY, queue.length) }, worker));
        return out;
    }

    function sitePaths(test) {
        return Array.from(app.snapshot.files.keys()).filter((p) => test(p) && !SKIP_PATH.test(p)).sort();
    }

    app.loadTextSources = () => loadSources(sitePaths((p) => TEXT_FILE.test(p)));

    app.findImageUsages = async (repoPath) => {
        const sources = await loadSources(sitePaths((p) => /\.html?$/i.test(p)));
        return C.findImageUsages(repoPath, sources);
    };

    // 共通情報のいまの値（wakaba/js/config.js の shop と company.html の携帯番号）
    app.readGlobalValues = (sources) => {
        const values = {};
        cfg.globalFields.forEach((f) => { values[f.key] = f.value; });
        const conf = sources.get('wakaba/js/config.js');
        const block = conf ? (/\bshop\s*:\s*\{([\s\S]*?)\}/.exec(conf) || [])[1] || '' : '';
        const read = (key) => {
            const m = new RegExp('\\b' + key + '\\s*:\\s*([\'"])((?:\\\\.|(?!\\1)[^\\\\])*)\\1').exec(block);
            return m ? m[2] : null;
        };
        ['tel', 'fax', 'email'].forEach((key) => {
            const v = read(key);
            if (v) values[key] = v;
        });
        // 営業時間: 「平日 8:30〜17:30」の「平日」のあと全部（「9時〜18時」のような書き方に変えても読み取れるように）
        const hoursRaw = (read('hours') || '').trim();
        if (hoursRaw) {
            const m = /^([^\s\d０-９]+)[ \u3000]+(\S.*)$/.exec(hoursRaw);
            values.hours = m ? m[2].trim() : hoursRaw;
        }
        const address = /^〒?\s*(\d{3}-\d{4})\s*(.+)$/.exec(read('address') || '');
        if (address) {
            values.zip = address[1];
            values.address = address[2].trim();
        }
        // 携帯: 「携帯」の後の電話番号（入力欄と同じ形: 090-…・050-… など）。見つからなければ 090/080/070 の番号
        const phone = '([0-9]{2,5}-[0-9]{1,4}-[0-9]{3,4})';
        for (const path of ['company.html', 'contact.html', 'index.html']) {
            const text = sources.get(path) || '';
            const labeled = new RegExp('携帯(?:\\s*<\\/(?:strong|b|span|th|dt)>)?\\s*[:：]?\\s*(?:<[^>]+>\\s*)?' + phone).exec(text);
            const any = /0[789]0-\d{4}-\d{4}/.exec(text);
            const found = labeled ? labeled[1] : any ? any[0] : null;
            if (found && found !== values.tel && found !== values.fax) {
                values.mobile = found;
                break;
            }
        }
        return values;
    };

    /* ============================================================
       公開
       ============================================================ */
    // 「管理画面から更新: 事業内容（文章2か所・写真1枚）、実績（1件追加）」（1行目は72文字まで）
    function commitMessage(entries, extra) {
        const prefix = '管理画面から更新: ';
        const len = (s) => Array.from(s).length;
        let first = prefix + entries.map((e) => e.label + (e.parts.length ? '（' + e.parts.join('・') + '）' : '')).join('、');
        if (len(first) > 72) first = prefix + entries.map((e) => e.label).join('、');
        if (len(first) > 72) first = prefix + entries.length + 'ページ';
        const body = entries.map((e) => '- ' + e.label + '（' + e.path + '）' + (e.parts.length ? ': ' + e.parts.join('・') : ''))
            .concat(extra || []);
        return first + '\n\n' + body.join('\n');
    }

    // 差し替えた写真（同じファイル名のまま上書き）を使っているページの <img src> に「?v=日時」を付ける。
    // ブラウザや GitHub Pages は写真を最大10分ほど覚えているので、そのままだと「公開しました」の後も
    // サイトに古い写真が出てしまう。→ Map(pagePath → { src, doc, attrs: { id: { src } } })
    async function photoVersions(stamp) {
        const replaced = new Set(Array.from(app.images.entries()).filter(([, img]) => !img.isNew).map(([path]) => path));
        const out = new Map();
        if (!replaced.size) return out;
        const paths = sitePaths((p) => /\.html?$/i.test(p));
        const readyEditor = (p) => {
            const ed = app.editors.get(p);
            return ed && ed.ready ? ed : null;
        };
        const sources = await loadSources(paths.filter((p) => !readyEditor(p)));
        for (const path of paths) {
            const ed = readyEditor(path);
            const src = ed ? ed.src : sources.get(path);
            const doc = ed ? ed.doc : C.parse(src);
            const attrs = {};
            for (const nd of doc.nodes) {
                // <img src> と、サイトのスクリプトが写真を切り替えるときに使う data-gallery-src / data-src
                for (const name of nd.tag === 'img' ? ['src', 'data-src'] : ['data-gallery-src', 'data-src']) {
                    const value = C.getAttr(nd, name);
                    const repoPath = value ? C.resolvePath(path, value) : null;
                    if (!repoPath || !replaced.has(repoPath)) continue;
                    (attrs[nd.id] || (attrs[nd.id] = {}))[name] = value.replace(/[?#].*$/, '') + '?v=' + stamp;
                }
            }
            if (Object.keys(attrs).length) out.set(path, { src, doc, attrs, editor: ed });
        }
        return out;
    }

    async function buildPlan() {
        const pages = [];
        const changes = [];
        const versions = await photoVersions(UI.jstStamp(new Date()));
        for (const page of cfg.pages) {
            const ed = app.editors.get(page.path);
            if (!ed || !ed.ready) continue;
            const sum = ed.summary();
            if (!sum.total) continue;
            const v = versions.get(page.path);
            versions.delete(page.path);
            const text = ed.buildSource(v && v.attrs);
            pages.push({ path: page.path, label: page.label, parts: ed.describe(sum) });
            if (text !== ed.src) changes.push({ path: page.path, text });
        }
        // 写真を差し替えただけのページ（写真の印だけが変わる）
        const versioned = [];
        for (const [path, v] of versions) {
            const text = v.editor ? v.editor.buildSource(v.attrs) : C.applyEdits(v.src, v.doc, { attrs: v.attrs });
            if (text === v.src) continue;
            changes.push({ path, text });
            versioned.push(path);
        }
        const imageLines = [];
        for (const [path, img] of app.images) {
            changes.push({ path, base64: img.base64 });
            imageLines.push('- 写真: ' + path);
        }
        if (versioned.length) imageLines.push('- 写真の更新に合わせて表示を更新: ' + versioned.join(', '));
        const firstPath = pages.length ? pages[0].path : app.current;
        return { pages, changes, message: commitMessage(pages, imageLines), firstPath };
    }

    async function publish() {
        if (app.busy) return;
        for (const ed of app.editors.values()) ed.stopEditing();
        let plan;
        app.busy = true; // まとめているあいだに二度押しされないように
        refreshChrome();
        try {
            plan = await buildPlan();
        } catch (err) {
            if (handleAuthError(err)) return;
            toast('変更の内容をまとめられませんでした。' + (err && err.message ? '（' + err.message + '）' : ''), { type: 'error' });
            return;
        } finally {
            app.busy = false;
            refreshChrome();
        }
        if (!plan.changes.length) {
            toast('公開する変更はありません。');
            refreshChrome();
            return;
        }
        if (!(await P.publishConfirm(app, plan))) return;
        await runCommit({
            title: '公開しています',
            sitePath: plan.firstPath,
            commit: () => app.gh.commitChanges({ baseCommitSha: app.snapshot.commitSha, changes: plan.changes, message: plan.message }),
            afterCommit: async (result) => {
                // 公開した写真は、サイトに反映されるまでプレビューで新しいものを見せ続ける（未公開の印は外す）
                for (const [path, img] of app.images) {
                    app.recent.set(path, img.blobUrl);
                    app.recentSha.set(path, result.commitSha);
                }
                app.images.clear();
                for (const [path, url] of app.recent) for (const ed of app.editors.values()) ed.applyImage(path, url, false);
                await refreshSnapshot(plan.pages.map((p) => p.path));
            }
        });
    }

    app.publishGlobal = (plan, fields) => {
        const changes = Object.keys(plan.results).map((path) => ({ path, text: plan.results[path] }));
        const message = '管理画面から更新: 共通情報（' + fields.map((f) => f.label).join('・') + '）\n\n' +
            plan.counts.map((c) => '- ' + c.path + ': ' + c.key + ' ' + c.count + 'か所').join('\n');
        return runCommit({
            title: '共通情報を公開しています',
            doneTitle: '共通情報の公開',
            sitePath: app.current,
            commit: () => app.gh.commitChanges({ baseCommitSha: app.snapshot.commitSha, changes, message }),
            afterCommit: (result) => refreshSnapshot(result.changedPaths)
        });
    };

    app.revert = (sha) => runCommit({
        title: '取り消しています',
        doneTitle: '取り消し',
        saving: '取り消しを保存しています…',
        sitePath: app.current,
        commit: () => app.gh.revertCommit(sha),
        afterCommit: async (result) => {
            await refreshSnapshot(result.changedPaths);
            await showRevertedImages(result.changedPaths, result.commitSha);
        }
    });

    // 取り消しで元に戻った写真は、サイトに反映されるまで「戻した内容」をプレビューに出す
    // （サイトの写真もブラウザに残っている写真も、まだ取り消す前のものなので）
    async function showRevertedImages(paths, sha) {
        for (const path of paths) {
            const ext = ((/\.([a-z0-9]+)$/i.exec(path) || [])[1] || '').toLowerCase();
            const type = IMAGE_TYPES[ext];
            if (!type) continue;
            const old = app.recent.get(path);
            app.recent.delete(path);
            app.recentSha.delete(path);
            const entry = app.snapshot.files.get(path);
            let url = null;
            if (entry) {
                try {
                    url = URL.createObjectURL(new Blob([await app.gh.getBlobBytes(entry.sha)], { type }));
                    app.recent.set(path, url);
                    app.recentSha.set(path, sha);
                } catch (err) {
                    url = null; // 読めなければ元の場所の写真を出す
                }
            }
            for (const ed of app.editors.values()) ed.applyImage(path, url, false);
            if (old && /^blob:/.test(old)) setTimeout(() => URL.revokeObjectURL(old), 1000);
        }
    }

    // 保存 → 読み直し → 反映の確認、の共通の流れ
    async function runCommit(o) {
        app.busy = true;
        refreshChrome();
        const pg = P.progress({ title: o.title, saving: o.saving, doneTitle: o.doneTitle });
        pg.step('save', 'active');
        let result;
        try {
            result = await o.commit();
        } catch (err) {
            app.busy = false;
            refreshChrome();
            commitFailed(err, pg);
            return null;
        }
        pg.step('save', 'done', result.noop ? '保存済みでした' : '保存しました');
        try {
            // 同じ内容がすでに保存されていたとき（前回、保存はできたのに通信が切れた場合など）も、
            // 最新を読み直して「未公開の変更」を片付ける
            await o.afterCommit(result);
        } catch (err) {
            // 公開はできている。読み直しだけ失敗したので、次の操作の前に読み直してもらう
            toast('公開しましたが、最新の内容の読み込みに失敗しました。ページを読み込み直してください。', { type: 'error', timeout: 0 });
        }
        app.busy = false;
        refreshChrome();
        if (result.noop) {
            pg.result('unknown', 'すでに公開されています', '同じ内容がすでに保存されています。サイトに出ていなければ、1〜2分お待ちください。');
            return result;
        }
        watchDeploy(result.commitSha, pg, o.sitePath);
        return result;
    }

    function commitFailed(err, pg) {
        pg.step('save', 'error', '保存できませんでした');
        if (err && err.code === 'conflict') {
            pg.result('conflict', 'ほかの場所で同じページが更新されました',
                '最新の内容を読み込み直してから、もう一度編集してください。（読み込み直すと、まだ公開していない変更は消えます）', [
                    { label: '閉じる' },
                    {
                        label: '読み込み直す',
                        kind: 'primary',
                        onClick: async () => {
                            const ok = await confirmDialog({
                                title: '最新の内容を読み込み直しますか？',
                                message: 'まだ公開していない変更（' + totalChanges() + '件）はすべて消えます。',
                                ok: '読み込み直す',
                                danger: true
                            });
                            if (!ok) return false;
                            reloadAll();
                            return undefined;
                        }
                    }
                ]);
            return;
        }
        if (err && err.code === 'unauthorized') {
            pg.close();
            expireSession();
            return;
        }
        if (err && err.code === 'network') {
            pg.result('error', '通信に失敗しました', '通信に失敗しました。もう一度「公開する」を押してください。（変更はそのまま残っています）');
            return;
        }
        if (err && err.code === 'protected') {
            pg.result('error', '取り消せませんでした', err.message);
            return;
        }
        if (err && (err.code === 'forbidden' || err.code === 'not_found')) {
            // 読み取り専用のアクセスキーなど。ViFightが権限を直せば、同じアクセスキーのまま「公開する」をもう一度押せばよい
            pg.result('error', '公開できませんでした',
                'このアクセスキーには、サイトを書き換える権限がありません。ViFightに、アクセスキーの「Contents」を「Read and write」にしてもらってから、もう一度「公開する」を押してください。新しいアクセスキーをもらったときは「別のアクセスキーを入力する」から入れてください。（変更はそのまま残っています）', [
                    { label: '閉じる' },
                    { label: '別のアクセスキーを入力する', kind: 'primary', onClick: () => { switchKey(); } }
                ]);
            return;
        }
        // ブランチの保護など思いがけない理由のときは、ViFightが調べられるよう GitHub の説明も出す
        const detail = err && err.detail && err.code === 'bad_response' ? '（GitHub: ' + err.detail + '）' : '';
        pg.result('error', '公開できませんでした', errorMessage(err) + '（変更はそのまま残っています）' + detail);
    }

    // GitHub Pages への反映を 5秒ごとに確認（最大5分）
    async function watchDeploy(sha, pg, sitePath) {
        const shortSha = sha.slice(0, 7);
        const siteLink = cfg.siteUrl + (sitePath || '') + '?v=' + shortSha;
        app.deploying++;
        $('deployChip').hidden = false;
        pg.step('deploy', 'active');
        pg.allowClose();
        const started = Date.now();
        let state = { state: 'pending' };
        let lastUrl = null;
        for (;;) {
            state = app.gh ? await app.gh.deployStatus(sha) : { state: 'unknown' };
            if (state.url) lastUrl = state.url;
            // 'retry'（電波が一瞬切れた・GitHub の一時的なエラー）は、次の確認まで待ってもう一度
            if (state.state === 'success' || state.state === 'failure' || state.state === 'unknown') break;
            if (Date.now() - started > DEPLOY_MAX_MS) {
                state = { state: 'unknown', url: lastUrl };
                break;
            }
            await sleep(DEPLOY_POLL_MS);
        }
        app.deploying--;
        $('deployChip').hidden = app.deploying === 0;
        const viewAction = { label: 'サイトで見る', kind: 'primary', href: siteLink };

        if (state.state === 'success') {
            pg.step('deploy', 'done', 'サイトに反映しました');
            pg.result('success', '公開しました', 'サイトに反映されました。', [{ label: '閉じる' }, viewAction]);
            toast('公開しました', { type: 'success', link: { label: 'サイトで見る', href: siteLink } });
            // 反映が終わったので、この公開の写真はサイトの新しいもの（キャッシュを避ける印つき）に切り替える
            // （続けて公開した、まだ反映中の写真はそのまま）
            for (const [path, url] of Array.from(app.recent.entries())) {
                if (!/^blob:/.test(url) || app.recentSha.get(path) !== sha) continue;
                const fresh = app.pageUrl(path) + '?v=' + shortSha;
                app.recent.set(path, fresh);
                for (const ed of app.editors.values()) ed.applyImage(path, fresh, false);
                setTimeout(() => URL.revokeObjectURL(url), 5000);
            }
        } else if (state.state === 'failure') {
            pg.step('deploy', 'error', '反映でエラーが発生しました');
            const actions = [{ label: '閉じる' }];
            if (state.url) actions.push({ label: 'エラーの詳細', kind: 'primary', href: state.url });
            pg.result('failure', '反映でエラーが発生しました。ViFightに連絡してください。', '保存はできています。', actions);
            toast('反映でエラーが発生しました。ViFightに連絡してください。', { type: 'error', timeout: 0, link: state.url ? { label: '詳細', href: state.url } : null });
        } else {
            pg.step('deploy', 'done', '保存しました');
            pg.result('unknown', '保存しました', '1〜2分後にサイトに反映されます。', [{ label: '閉じる' }, viewAction]);
            toast('保存しました。1〜2分後にサイトに反映されます。', { type: 'success', link: { label: 'サイトで見る', href: siteLink } });
        }
    }

    /* ============================================================
       上のバー・メニュー
       ============================================================ */
    async function revertCurrentPage() {
        const ed = app.editors.get(app.current);
        if (!ed) return;
        const n = ed.summary().total;
        if (!n) return;
        const ok = await confirmDialog({
            title: 'このページの変更を元に戻しますか？',
            message: '「' + ed.page.label + '」のまだ公開していない変更（' + n + '件）をすべて取り消します。',
            ok: '元に戻す',
            danger: true
        });
        if (!ok) return;
        for (const [path, img] of Array.from(app.images.entries())) if (img.fromPage === ed.path) app.dropImage(path);
        ed.reload();
        setStage('loading', '元の内容を表示しています…');
        refreshChrome();
        toast('「' + ed.page.label + '」の変更を元に戻しました。');
    }

    const MENU = [
        { action: 'global', icon: 'phone', label: '共通情報（電話・住所など）' },
        { action: 'meta', icon: 'page', label: 'ページ設定（タイトル・説明文）' },
        { action: 'history', icon: 'history', label: '公開の履歴' },
        { sep: true },
        { action: 'revert', icon: 'undo', label: 'このページの変更を元に戻す', className: 'only-sp' },
        { action: 'targets', icon: 'edit', label: '編集できる場所を表示', toggle: true },
        { action: 'help', icon: 'help', label: '使い方' },
        { action: 'site', icon: 'external', label: 'サイトを見る', link: true },
        { sep: true },
        { action: 'logout', icon: 'logout', label: 'ログアウト', danger: true }
    ];

    function buildMenu() {
        const menu = $('menu');
        menu.replaceChildren(...MENU.map((item) => {
            if (item.sep) return h('div', { class: 'menu__sep', role: 'separator' });
            const cls = 'menu__item' + (item.danger ? ' menu__item--danger' : '') + (item.className ? ' ' + item.className : '');
            const el = item.link
                ? h('a', { class: cls, role: 'menuitem', href: cfg.siteUrl, target: '_blank', rel: 'noopener', dataset: { action: item.action } })
                : h('button', { class: cls, type: 'button', role: item.toggle ? 'menuitemcheckbox' : 'menuitem', dataset: { action: item.action } });
            el.append(icon(item.icon), h('span', { text: item.label }));
            if (item.toggle) el.append(h('span', { class: 'switch', 'aria-hidden': 'true' }));
            return el;
        }));
        menu.addEventListener('click', (e) => {
            const item = e.target.closest('[data-action]');
            if (!item) return;
            const action = item.dataset.action;
            if (action === 'targets') {
                toggleTargets();
                return;
            }
            closeMenu();
            if (action === 'global') P.globalInfo(app);
            else if (action === 'meta') {
                const ed = app.editors.get(app.current);
                if (ed && ed.ready) P.pageSettings(app, ed);
            } else if (action === 'history') P.history(app);
            else if (action === 'revert') revertCurrentPage();
            else if (action === 'help') P.intro(app);
            else if (action === 'logout') logout();
        });
    }

    function openMenu() {
        const menu = $('menu');
        const site = menu.querySelector('[data-action="site"]');
        if (site) site.href = cfg.siteUrl + (app.current || '');
        const ed = app.editors.get(app.current);
        const revert = menu.querySelector('[data-action="revert"]');
        if (revert) revert.disabled = !(ed && ed.ready && ed.summary().total);
        menu.querySelector('[data-action="targets"]').setAttribute('aria-checked', String(app.showTargets));
        menu.hidden = false;
        $('menuBtn').setAttribute('aria-expanded', 'true');
        const first = menu.querySelector('.menu__item');
        if (first) first.focus({ preventScroll: true });
    }

    function closeMenu() {
        const menu = $('menu');
        if (menu.hidden) return;
        menu.hidden = true;
        $('menuBtn').setAttribute('aria-expanded', 'false');
    }

    function toggleTargets() {
        app.showTargets = !app.showTargets;
        savePref('showTargets', app.showTargets);
        for (const ed of app.editors.values()) ed.setShowTargets(app.showTargets);
        $('menu').querySelector('[data-action="targets"]').setAttribute('aria-checked', String(app.showTargets));
    }

    function setDevice(device) {
        app.device = device === 'sp' ? 'sp' : 'pc';
        savePref('device', app.device);
        $('stage').classList.toggle('is-sp', app.device === 'sp');
        document.querySelectorAll('.segmented [data-device]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.device === app.device)));
        setTimeout(() => {
            const ed = app.editors.get(app.current);
            if (ed) ed.reposition();
        }, 60);
    }

    function updateOnline() {
        $('offlineBar').hidden = navigator.onLine;
        refreshChrome();
    }

    function bindChrome() {
        $('pagePicker').addEventListener('change', (e) => openPage(e.target.value));
        $('publishBtn').addEventListener('click', publish);
        $('revertBtn').addEventListener('click', revertCurrentPage);
        $('menuBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            if ($('menu').hidden) openMenu();
            else closeMenu();
        });
        document.addEventListener('click', (e) => {
            if (!$('menu').hidden && !$('menu').contains(e.target) && e.target !== $('menuBtn')) closeMenu();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !$('menu').hidden) {
                closeMenu();
                $('menuBtn').focus();
            }
        });
        // プレビューの中をタップしたらメニューを閉じる
        window.addEventListener('blur', () => setTimeout(() => {
            if (document.activeElement && document.activeElement.tagName === 'IFRAME') closeMenu();
        }, 0));
        $('addWorkBtn').replaceChildren(icon('plus'), h('span', { text: '実績を追加' }));
        $('addWorkBtn').addEventListener('click', () => {
            const ed = app.editors.get(app.current);
            if (!ed || !ed.ready || !ed.hasCollections) return;
            ed.stopEditing();
            P.addWorkDialog(app, ed, ed.collections.keys().next().value);
        });
        document.querySelectorAll('.segmented [data-device]').forEach((b) => b.addEventListener('click', () => setDevice(b.dataset.device)));
        buildMenu();
        setHint(false);

        window.addEventListener('online', updateOnline);
        window.addEventListener('offline', updateOnline);
        window.addEventListener('beforeunload', (e) => {
            if (app.leaving) return;
            if (totalChanges() > 0 || app.busy) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
        // 写真を画面に落としたときに、ブラウザがそのファイルを開いてしまわないように
        window.addEventListener('dragover', (e) => {
            if (!(e.target.closest && e.target.closest('.dropzone'))) e.preventDefault();
        });
        window.addEventListener('drop', (e) => {
            if (!(e.target.closest && e.target.closest('.dropzone'))) e.preventDefault();
        });
    }

    /* ============================================================
       起動
       ============================================================ */
    function boot() {
        if (!cfg || !C || !GitHub) {
            showBootError('管理画面のファイルが読み込めませんでした。ページを読み込み直してください。', () => location.reload());
            return;
        }
        bindLogin();
        bindChrome();
        setDevice(prefs.device || 'pc');
        updateOnline();
        const token = readToken();
        if (token && GitHub.isClassicKey(token)) {
            // 以前に記憶された古い形式のキー: 使わずに消す
            clearToken();
            showLogin(CLASSIC_MESSAGE);
        } else if (token) {
            showBoot('管理画面を開いています…');
            login(token, !!store.get(TOKEN_KEY, 'local'), true);
        } else {
            showLogin('');
        }
    }

    // テスト・不具合調査用（アクセスキーは含めない）
    window.CMSAdmin = {
        get current() { return app.current; },
        get editors() { return app.editors; },
        get snapshot() { return app.snapshot; },
        totalChanges,
        buildPlan
    };

    boot();
}());

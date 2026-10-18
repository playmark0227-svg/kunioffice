/* ============================================================
   KUNI OFFICE 管理画面 — GitHub 通信モジュール
   ブラウザから GitHub REST API を呼び出して、サイトのファイルの読み込み・
   公開（main ブランチへの保存）・公開の取り消し・反映状況の確認を行います。
   ブラウザでは window.CMSGitHub、Node（テスト）では module.exports で使えます。
   アクセスキーは https://api.github.com にだけ送り、ほかには出しません。
   ============================================================ */
(function (root, factory) {
    'use strict';
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.CMSGitHub = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    const API_BASE = 'https://api.github.com';
    const API_VERSION = '2022-11-28';
    const MAX_COMMIT_ATTEMPTS = 3;           // 公開の直前に誰かが保存したときの再試行回数
    const MAX_COMMIT_FILE_PAGES = 10;        // 1ページ300ファイル × 10 = GitHub の上限 3000
    const REQUEST_TIMEOUT_MS = 60 * 1000;
    const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 写真の送受信は回線が遅いと時間がかかる
    // ログイン時の書き込み確認で作る小さなファイル（どこからも使われず、GitHub が後で片付ける）
    const WRITE_CHECK_CONTENT = 'kunioffice admin: write access check\n';
    // キーの範囲の確認で、一覧に出たほかのリポジトリのうち、書き込めるかを試す数
    const SCOPE_PROBES = 3;
    // 古い形式（Classic など）のキー。持ち主のすべてのリポジトリを操作できてしまうので使わない
    const CLASSIC_KEY = /^gh[pousr]_/;
    const FULL_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
    // キーの範囲の確認を続けられないエラー（通信の失敗・GitHub の一時的なエラー・使いすぎ・キーが無効）
    const SCOPE_STOP = new Set(['network', 'server', 'rate_limited', 'unauthorized']);
    // 管理画面からは保存も取り消しもしないファイル（公開の仕組み・管理画面そのもの）
    const DEFAULT_PROTECTED = /^(\.github|admin)\//;

    // エラーコードごとの既定メッセージ（そのまま画面に出せる文言）
    const MESSAGES = {
        unauthorized: 'アクセスキーが正しくないか、有効期限が切れています',
        forbidden: 'このアクセスキーには必要な権限がありません',
        rate_limited: 'アクセスが集中しています。しばらく待ってからもう一度お試しください',
        not_found: '見つかりませんでした。アクセスキーの対象が正しいか確認してください',
        conflict: 'ほかの場所で同じページが更新されました',
        network: 'インターネットに接続できません',
        server: 'サーバーで一時的なエラーが発生しました。しばらく待ってからもう一度お試しください',
        protected: 'この変更には、サイトの仕組みのファイル（サイト管理者が管理する部分）が含まれているため、ここでは取り消せません。ViFightにご連絡ください。',
        bad_response: '予期しない応答がありました'
    };

    // GitHub からのエラー。code で分岐し、message は画面表示用、detail は GitHub の原文。
    class GitHubError extends Error {
        constructor(code, status, detail, extra) {
            super(MESSAGES[code] || MESSAGES.bad_response);
            this.name = 'CMSGitHubError';
            this.code = code;
            this.status = status;
            this.detail = detail || '';
            if (extra) Object.assign(this, extra);
        }
    }

    function badResponse(what) {
        return new GitHubError('bad_response', 200, 'unexpected response: ' + what);
    }

    function errorFromResponse(res, data) {
        const status = res.status;
        const detail = data && typeof data.message === 'string' ? data.message : '';
        const header = (name) => (res.headers && res.headers.get(name)) || '';
        const rateLimited = status === 429 || (status === 403 && (
            header('x-ratelimit-remaining') === '0' || header('retry-after') !== '' || /rate limit/i.test(detail)));

        let code = 'bad_response';
        if (status === 401) code = 'unauthorized';
        else if (rateLimited) code = 'rate_limited';
        else if (status === 403) code = 'forbidden';
        else if (status === 404) code = 'not_found';
        else if (status === 409 || (status === 422 && /fast[\s-]?forward/i.test(detail))) code = 'conflict';
        else if (status >= 500) code = 'server';

        const extra = {};
        if (code === 'rate_limited') {
            // 短時間の使いすぎ（二次制限）は retry-after 秒後から使える。x-ratelimit-reset は1時間ごとの上限の
            // リセット時刻なので、その上限を使い切った（remaining が 0）ときだけ使う
            const retryAfter = header('retry-after').trim();
            const reset = Number(header('x-ratelimit-reset'));
            if (/^\d+$/.test(retryAfter)) extra.resetAt = new Date(Date.now() + Number(retryAfter) * 1000);
            else if (retryAfter && !isNaN(Date.parse(retryAfter))) extra.resetAt = new Date(Date.parse(retryAfter));
            else if (header('x-ratelimit-remaining') === '0' && reset > 0) extra.resetAt = new Date(reset * 1000);
        }
        return new GitHubError(code, status, detail, extra);
    }

    // ---------- 小さな道具 ----------

    function isSha(value) {
        return typeof value === 'string' && /^[0-9a-f]{40}([0-9a-f]{24})?$/.test(value);
    }

    function encodePath(value) {
        return String(value).split('/').map(encodeURIComponent).join('/');
    }

    function isSafePath(path) {
        return typeof path === 'string' && path !== '' &&
            !path.split('/').some((seg) => seg === '' || seg === '.' || seg === '..' || seg === '.git');
    }

    function firstLine(message) {
        return String(message || '').split('\n')[0].trim();
    }

    function truncate(text, max) {
        const chars = Array.from(text);
        return chars.length <= max ? text : chars.slice(0, max - 1).join('') + '…';
    }

    // GitHub の base64 は60文字ごとに改行が入っているので、空白を除いてから読む
    function base64ToBytes(base64) {
        let binary;
        try {
            binary = atob(String(base64).replace(/\s+/g, ''));
        } catch (e) {
            throw badResponse('base64');
        }
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    function bytesToBase64(bytes) {
        const CHUNK = 0x8000;
        let binary = '';
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return btoa(binary);
    }

    // 「data:image/jpeg;base64,…」形式もそのまま受け付ける
    function cleanBase64(value, path) {
        const base64 = String(value).replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
        if (base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) {
            throw new TypeError('base64 の形式が正しくありません: ' + path);
        }
        return base64;
    }

    function normalizeChanges(changes) {
        if (!Array.isArray(changes)) throw new TypeError('changes は配列で指定してください');
        const seen = new Set();
        return changes.map((change) => {
            const path = change && change.path;
            if (!isSafePath(path)) throw new TypeError('不正なパスです: ' + path);
            if (seen.has(path)) throw new TypeError('同じパスが2回指定されています: ' + path);
            seen.add(path);
            if (change.delete === true) return { path, delete: true };
            if (typeof change.text === 'string') return { path, text: change.text };
            if (typeof change.base64 === 'string') return { path, base64: cleanBase64(change.base64, path) };
            throw new TypeError('text・base64・delete のどれかを指定してください: ' + path);
        });
    }

    function entrySha(files, path) {
        const entry = files.get(path);
        return entry ? entry.sha : null;
    }

    function sameEntry(a, b) {
        if (!a || !b) return !a && !b;
        return a.sha === b.sha && a.mode === b.mode;
    }

    // 2つのツリーで中身が違うパス（追加・削除・変更・名前変更の両側）
    function touchedPaths(before, after) {
        const paths = new Set([...before.keys(), ...after.keys()]);
        return [...paths].filter((path) => !sameEntry(before.get(path), after.get(path))).sort();
    }

    function runState(run) {
        if (run.status !== 'completed') return run.status === 'in_progress' ? 'running' : 'pending';
        if (run.conclusion === 'success') return 'success';
        if (['failure', 'timed_out', 'startup_failure'].includes(run.conclusion)) return 'failure';
        return 'unknown'; // cancelled（後の公開にまとめられた）など
    }

    // ---------- クライアント本体 ----------

    class CMSGitHub {
        constructor(options) {
            const opts = options || {};
            if (!opts.owner || !opts.repo) throw new TypeError('owner と repo は必須です');
            this.owner = opts.owner;
            this.repo = opts.repo;
            this.branch = opts.branch || 'main';
            this.workflowName = opts.workflowName || '';
            // 保存・取り消しをしないファイル（path → true なら守る）
            this._isProtected = typeof opts.isProtectedPath === 'function'
                ? (path) => DEFAULT_PROTECTED.test(path) || !!opts.isProtectedPath(path)
                : (path) => DEFAULT_PROTECTED.test(path);
            this._fetch = opts.fetch || ((url, init) => fetch(url, init));
            // console などに出にくいよう、列挙されないプロパティに入れる
            Object.defineProperty(this, '_token', { value: String(opts.token || '').trim(), writable: true });
            // sha で決まる中身は変わらないので、Promise ごと覚えておく
            this._commits = new Map();
            this._trees = new Map();
            this._blobs = new Map();
            // path → この画面から送った中身（blob の sha）。公開の返事が届かなかったとき（保存はできていた）に、
            // 最新の状態にある「自分が送った中身」を、ほかの人の更新と取り違えないため
            this._sent = new Map();
        }

        // ---------- 通信 ----------

        _repoPath(rest) {
            return '/repos/' + encodeURIComponent(this.owner) + '/' + encodeURIComponent(this.repo) + rest;
        }

        async _request(method, path, body, timeoutMs) {
            // 全角文字などはヘッダーに入れられないので、送る前に「キーが違う」と判断する
            if (!/^[\x21-\x7e]+$/.test(this._token)) {
                throw new GitHubError('unauthorized', 0, 'invalid access key');
            }
            const init = {
                method,
                headers: {
                    Accept: 'application/vnd.github+json',
                    Authorization: 'Bearer ' + this._token,
                    'X-GitHub-Api-Version': API_VERSION
                },
                // GitHub の応答は60秒キャッシュされるため、古い最新版を読まないようにする
                cache: 'no-store'
            };
            if (body !== undefined) {
                init.headers['Content-Type'] = 'application/json';
                init.body = JSON.stringify(body);
            }
            const controller = typeof AbortController === 'function' ? new AbortController() : null;
            if (controller) init.signal = controller.signal;
            const timer = controller ? setTimeout(() => controller.abort(), timeoutMs || REQUEST_TIMEOUT_MS) : null;

            // window.fetch を渡されても動くよう、this を付けずに呼ぶ
            const fetchFn = this._fetch;
            let res;
            let text;
            try {
                res = await fetchFn(API_BASE + path, init);
                text = await res.text();
            } catch (e) {
                throw new GitHubError('network', 0, e && e.message);
            } finally {
                if (timer) clearTimeout(timer);
            }

            let data = null;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch (e) {
                    data = undefined;
                }
            }
            if (!res.ok) throw errorFromResponse(res, data);
            if (data === undefined) throw badResponse('JSON');
            return { data, headers: res.headers };
        }

        async _get(rest, timeoutMs) {
            return (await this._request('GET', this._repoPath(rest), undefined, timeoutMs)).data;
        }

        async _post(rest, body, timeoutMs) {
            return (await this._request('POST', this._repoPath(rest), body, timeoutMs)).data;
        }

        _cached(cache, key, load) {
            if (!cache.has(key)) {
                const promise = load();
                cache.set(key, promise);
                promise.catch(() => cache.delete(key)); // 失敗したら次回やり直せるように
            }
            return cache.get(key);
        }

        // ---------- 読み込み ----------

        // permissions は「アカウントの役割」で、アクセスキーに付けた権限ではない（細かい権限のアクセスキーは
        // 読み取り専用でも push: true になる）。書き込めるかどうかは、どこからも使われない小さなファイルを
        // 実際に作ってみて確かめる（作れなければ 403、対象のサイトでなければ 404）。
        async verify() {
            const data = await this._get('');
            if (!data || typeof data !== 'object') throw badResponse('repository');
            const fullName = data.full_name || this.owner + '/' + this.repo;
            if (data.permissions && data.permissions.push === false) return { canPush: false, fullName };
            try {
                await this._post('/git/blobs', { content: WRITE_CHECK_CONTENT, encoding: 'utf-8' });
            } catch (err) {
                if (err.code === 'forbidden') return { canPush: false, fullName };
                throw err;
            }
            return { canPush: true, fullName };
        }

        // このアクセスキーが、このサイト（リポジトリ）のほかにも書き込めるかどうか（verify のあとに使う）。
        // 細かい権限のキーでは、/user/repos には「キーで選ばれたリポジトリ」だけが出る（「All repositories」なら全部）。
        // 一覧がキーで絞られていない場合にまちがって断らないよう、ほかのリポジトリには、どこからも使われない小さな
        // ファイルを実際に作れるかで確かめる（選ばれていなければ 403・404、空のリポジトリは 409）。
        // → { onlyThisRepo: true, others: [] } | { onlyThisRepo: false, others: ['owner/name', …] }
        async checkScope() {
            const { data } = await this._request('GET', '/user/repos?affiliation=owner&sort=pushed&per_page=100');
            if (!Array.isArray(data)) throw badResponse('repositories');
            const self = (this.owner + '/' + this.repo).toLowerCase();
            const others = data.filter((item) => item && typeof item.full_name === 'string' &&
                FULL_NAME.test(item.full_name) && item.full_name.toLowerCase() !== self);
            const candidates = others.filter((item) => !item.archived && !item.disabled).slice(0, SCOPE_PROBES);
            for (const item of candidates) {
                try {
                    await this._request('POST', '/repos/' + encodePath(item.full_name) + '/git/blobs',
                        { content: WRITE_CHECK_CONTENT, encoding: 'utf-8' });
                } catch (err) {
                    if (SCOPE_STOP.has(err.code)) throw err;
                    continue; // このリポジトリには書き込めない
                }
                return { onlyThisRepo: false, others: others.map((other) => other.full_name) };
            }
            return { onlyThisRepo: true, others: [] };
        }

        async getHead() {
            const data = await this._get('/git/ref/heads/' + encodePath(this.branch));
            const sha = data && data.object && data.object.sha;
            if (!isSha(sha)) throw badResponse('ref');
            return sha;
        }

        getCommit(sha) {
            if (!isSha(sha)) return Promise.reject(new TypeError('不正なコミットIDです: ' + sha));
            return this._cached(this._commits, sha, async () => toCommit(await this._get('/git/commits/' + sha)));
        }

        async getTree(treeSha) {
            if (!isSha(treeSha)) throw new TypeError('不正なツリーIDです: ' + treeSha);
            const files = await this._cached(this._trees, treeSha, async () => {
                const data = await this._get('/git/trees/' + treeSha + '?recursive=1');
                if (!data || !Array.isArray(data.tree)) throw badResponse('tree');
                if (data.truncated) throw badResponse('tree truncated');
                const map = new Map();
                for (const item of data.tree) {
                    if (item.type !== 'blob') continue; // フォルダ・サブモジュールは除く
                    map.set(item.path, Object.freeze({ sha: item.sha, mode: item.mode, type: item.type, size: item.size }));
                }
                return map;
            });
            return new Map(files); // 呼び出し側が書き換えてもキャッシュは壊れない
        }

        async getBlobBytes(sha) {
            return (await this._blobBytes(sha)).slice();
        }

        async getBlobText(sha) {
            // BOM も消さずに残す（そのまま保存し直したときに中身が変わらないように）
            return new TextDecoder('utf-8', { ignoreBOM: true }).decode(await this._blobBytes(sha));
        }

        _blobBytes(sha) {
            if (!isSha(sha)) return Promise.reject(new TypeError('不正なファイルIDです: ' + sha));
            return this._cached(this._blobs, sha, async () => {
                const data = await this._get('/git/blobs/' + sha, UPLOAD_TIMEOUT_MS);
                if (!data || typeof data.content !== 'string') throw badResponse('blob');
                if (data.encoding === 'utf-8') return new TextEncoder().encode(data.content);
                if (data.encoding !== 'base64') throw badResponse('blob encoding');
                return base64ToBytes(data.content);
            });
        }

        // 編集画面はいつもこの「ある時点の全ファイル一覧」を元に作業する
        async snapshot() {
            const commitSha = await this.getHead();
            const commit = await this.getCommit(commitSha);
            const files = await this.getTree(commit.treeSha);
            return { commitSha, treeSha: commit.treeSha, files };
        }

        // ---------- 公開 ----------

        // changes: [{ path, text }] | [{ path, base64 }] | [{ path, delete: true }]
        // 編集を始めた時点（baseCommitSha）のあとに同じファイルがほかで更新されていたら conflict。
        async commitChanges(options) {
            const opts = options || {};
            const list = normalizeChanges(opts.changes);
            if (!list.length) return { noop: true, changedPaths: [] };
            const guarded = list.filter((change) => this._isProtected(change.path)).map((change) => change.path);
            if (guarded.length) throw new GitHubError('protected', 0, 'protected paths: ' + guarded.join(', '), { paths: guarded });
            const base = await this.getCommit(opts.baseCommitSha);
            const baseFiles = await this.getTree(base.treeSha);
            const message = opts.message || '管理画面から更新';
            const newShas = new Map(); // path → 作った blob の sha（再試行のときに送り直さない）

            return this._commitOnHead(message, async (headSha, headFiles) => {
                for (const change of list) {
                    if (!change.delete && !newShas.has(change.path)) {
                        const sha = await this._createBlob(change);
                        newShas.set(change.path, sha);
                        if (!this._sent.has(change.path)) this._sent.set(change.path, new Set());
                        this._sent.get(change.path).add(sha);
                    }
                }
                const target = (change) => (change.delete ? null : newShas.get(change.path));
                // 前にこの画面から送った中身（返事が届かなかった公開が、実は保存されていた場合）
                const sentBefore = (path, sha) => !!sha && this._sent.has(path) && this._sent.get(path).has(sha);

                if (headSha !== base.sha) {
                    // ほかの人の更新を上書きしない。ただし、すでに同じ内容になっているとき、
                    // 自分が前に送った内容になっているときは問題ない
                    // （通信が切れて「公開する」を押し直した場合や、その後さらに編集した場合など）
                    const conflicts = list.filter((change) => {
                        const now = entrySha(headFiles, change.path);
                        return now !== entrySha(baseFiles, change.path) && now !== target(change) && !sentBefore(change.path, now);
                    }).map((change) => change.path);
                    if (conflicts.length) {
                        throw new GitHubError('conflict', 409, 'changed since ' + base.sha, { paths: conflicts });
                    }
                }

                const entries = [];
                for (const change of list) {
                    const current = headFiles.get(change.path);
                    const sha = target(change);
                    if (sha === entrySha(headFiles, change.path)) continue; // 変更なし（削除済みも含む）
                    entries.push({ path: change.path, mode: current ? current.mode : '100644', type: 'blob', sha });
                }
                return { entries };
            });
        }

        async _createBlob(change) {
            const isBinary = change.base64 !== undefined;
            const data = await this._post('/git/blobs', isBinary
                ? { content: change.base64, encoding: 'base64' }
                : { content: change.text, encoding: 'utf-8' }, UPLOAD_TIMEOUT_MS);
            if (!data || !isSha(data.sha)) throw badResponse('blob');
            // 公開直後の読み込み直しで、もう一度ダウンロードしなくて済むように覚えておく
            const bytes = isBinary ? base64ToBytes(change.base64) : new TextEncoder().encode(change.text);
            this._blobs.set(data.sha, Promise.resolve(bytes));
            return data.sha;
        }

        // 最新の状態に対して plan(headSha, headFiles) → { entries, extra } を作り、
        // ツリー → コミット → ブランチ更新 の順に保存する。
        // ブランチ更新が「早送りできない」で断られたら（直前に誰かが保存した）、最新を読み直してやり直す。
        async _commitOnHead(message, plan) {
            for (let attempt = 1; ; attempt++) {
                const headSha = await this.getHead();
                const head = await this.getCommit(headSha);
                const headFiles = await this.getTree(head.treeSha);
                const { entries, extra } = await plan(headSha, headFiles);
                const changedPaths = entries.map((entry) => entry.path);
                if (!entries.length) return Object.assign({ noop: true, changedPaths }, extra);

                const tree = await this._post('/git/trees', { base_tree: head.treeSha, tree: entries });
                if (!tree || !isSha(tree.sha)) throw badResponse('tree');
                if (tree.sha === head.treeSha) return Object.assign({ noop: true, changedPaths: [] }, extra);

                const commit = toCommit(await this._post('/git/commits', {
                    message,
                    tree: tree.sha,
                    parents: [headSha]
                }));
                this._commits.set(commit.sha, Promise.resolve(commit));

                try {
                    await this._request('PATCH', this._repoPath('/git/refs/heads/' + encodePath(this.branch)), {
                        sha: commit.sha,
                        force: false
                    });
                } catch (err) {
                    // 直前に誰かが保存した（早送りできない）・まだ GitHub の中で行き渡っていない、などは最新を読み直してやり直す
                    if (err.status !== 422 && err.status !== 409) throw err;
                    if (attempt >= MAX_COMMIT_ATTEMPTS) {
                        // 何度やっても断られるのが「競合」以外（ブランチの保護など）なら、その理由のまま返す
                        if (err.code !== 'conflict') throw err;
                        throw new GitHubError('conflict', err.status, err.detail, { paths: changedPaths });
                    }
                    continue;
                }
                return Object.assign({ commitSha: commit.sha, changedPaths }, extra);
            }
        }

        // ---------- 履歴 ----------

        async listCommits(n = 30) {
            const perPage = Math.min(100, Math.max(1, Math.floor(n) || 30));
            const data = await this._get('/commits?sha=' + encodeURIComponent(this.branch) + '&per_page=' + perPage);
            if (!Array.isArray(data)) throw badResponse('commits');
            return data.map((item) => {
                const info = item.commit || {};
                const author = info.author || {};
                return {
                    sha: item.sha,
                    message: info.message || '',
                    date: author.date || (info.committer && info.committer.date) || '',
                    author: author.name || (item.author && item.author.login) || '',
                    // [] = いちばん最初の保存（取り消せない）。GitHub が返さなければ null（わからない）
                    parents: Array.isArray(item.parents) ? item.parents.map((parent) => parent.sha) : null
                };
            });
        }

        async getCommitFiles(sha) {
            const files = [];
            let first = null;
            for (let page = 1; page <= MAX_COMMIT_FILE_PAGES; page++) {
                const res = await this._request('GET', this._repoPath('/commits/' + encodeURIComponent(sha) +
                    (page > 1 ? '?page=' + page : '')));
                const data = res.data;
                if (!data || !Array.isArray(data.parents)) throw badResponse('commit');
                if (!first) first = data;
                for (const file of data.files || []) {
                    files.push({
                        filename: file.filename,
                        status: file.status,
                        sha: file.sha,
                        previous_filename: file.previous_filename
                    });
                }
                // 300ファイルを超えると、残りは Link ヘッダーの次ページにある
                const link = (res.headers && res.headers.get('link')) || '';
                if (!/rel="next"/.test(link)) break;
            }
            const info = first.commit || {};
            return {
                sha: first.sha,
                parents: first.parents.map((parent) => parent.sha),
                message: info.message || '',
                date: (info.author && info.author.date) || '',
                files
            };
        }

        // 取り消しの下見：どのファイルが戻るか、その後にまた更新されたファイル（laterEdited）はどれか
        async revertPreview(sha) {
            const headSha = await this.getHead();
            const headFiles = await this.getTree((await this.getCommit(headSha)).treeSha);
            const plan = await this._revertPlan(sha, headFiles);
            return {
                sha: plan.commit.sha,
                message: plan.commit.message,
                date: plan.commit.date,
                parentSha: plan.parentSha,
                headSha,
                files: plan.files,
                laterEdited: plan.laterEdited,
                protectedPaths: plan.protectedPaths,
                noop: plan.entries.length === 0
            };
        }

        // sha で変わったファイルを、その直前（最初の親）の状態に戻す新しい保存を、最新の上に作る
        async revertCommit(sha, options) {
            const opts = options || {};
            const target = await this.getCommit(sha);
            const message = opts.message ||
                truncate('管理画面から取り消し: ' + firstLine(target.message), 72) +
                '\n\n取り消した変更: ' + target.sha;
            return this._commitOnHead(message, async (headSha, headFiles) => {
                const plan = await this._revertPlan(sha, headFiles);
                if (plan.protectedPaths.length) {
                    throw new GitHubError('protected', 0, 'protected paths: ' + plan.protectedPaths.join(', '), { paths: plan.protectedPaths });
                }
                return { entries: plan.entries, extra: { laterEdited: plan.laterEdited } };
            });
        }

        // 中身の違いは「直前のツリー」と「そのコミットのツリー」の比較で求める
        // （追加 → 削除、削除 → 復元、変更 → 元の内容、名前変更 → 新しい名前を削除して元の名前を復元）。
        // ファイルはアップロードし直さず、元の blob の sha でツリーを組み立てる。
        async _revertPlan(sha, headFiles) {
            const commit = await this.getCommit(sha);
            if (!commit.parents.length) throw new GitHubError('bad_response', 0, 'the first commit cannot be reverted');
            const parentSha = commit.parents[0];
            const after = await this.getTree(commit.treeSha);
            const before = await this.getTree((await this.getCommit(parentSha)).treeSha);

            const files = [];
            const entries = [];
            for (const path of touchedPaths(before, after)) {
                const restore = before.get(path); // 戻したい状態（なければ削除）
                const now = headFiles.get(path);
                const status = !restore ? 'added' : !after.get(path) ? 'removed' : 'modified';
                files.push({ path, status, laterEdited: !sameEntry(now, after.get(path)) });
                if (sameEntry(now, restore)) continue; // すでに元の状態
                entries.push(restore
                    ? { path, mode: restore.mode, type: 'blob', sha: restore.sha }
                    : { path, mode: now.mode, type: 'blob', sha: null });
            }
            return {
                commit,
                parentSha,
                files,
                entries,
                laterEdited: files.filter((file) => file.laterEdited).map((file) => file.path),
                // 管理画面・公開の仕組みなど、ここでは戻さないファイル（あれば取り消しは断る）
                protectedPaths: files.filter((file) => this._isProtected(file.path)).map((file) => file.path)
            };
        }

        // ---------- 反映状況 ----------

        // 例外にはしない。権限がない（403・404）などは { state: 'unknown' }、
        // 通信の一時的な失敗（電波が切れた・GitHub の一時的なエラー・使いすぎ）は { state: 'retry' }（もう一度確かめればよい）
        async deployStatus(commitSha) {
            try {
                const data = await this._get('/actions/runs?head_sha=' + encodeURIComponent(commitSha) + '&per_page=10');
                const runs = (data && Array.isArray(data.workflow_runs) ? data.workflow_runs : [])
                    .filter((run) => !run.head_sha || run.head_sha === commitSha);
                const run = runs.find((item) => item.name === this.workflowName) || runs[0];
                if (!run) return { state: 'pending', url: null }; // 実行が作られるまで数秒かかる
                return { state: runState(run), url: run.html_url || null };
            } catch (err) {
                const code = err.code || 'bad_response';
                const transient = code === 'network' || code === 'server' || code === 'rate_limited';
                return { state: transient ? 'retry' : 'unknown', url: null, error: code };
            }
        }
    }

    function toCommit(data) {
        if (!data || !isSha(data.sha) || !data.tree || !isSha(data.tree.sha) || !Array.isArray(data.parents)) {
            throw badResponse('commit');
        }
        return Object.freeze({
            sha: data.sha,
            treeSha: data.tree.sha,
            parents: Object.freeze(data.parents.map((parent) => parent.sha)),
            message: data.message || '',
            date: (data.author && data.author.date) || (data.committer && data.committer.date) || ''
        });
    }

    CMSGitHub.Error = GitHubError;
    CMSGitHub.MESSAGES = MESSAGES;
    CMSGitHub.API_BASE = API_BASE;
    CMSGitHub.WRITE_CHECK_CONTENT = WRITE_CHECK_CONTENT;
    CMSGitHub.isClassicKey = (token) => CLASSIC_KEY.test(String(token || '').trim());
    CMSGitHub.base64ToBytes = base64ToBytes;
    CMSGitHub.bytesToBase64 = bytesToBase64;
    return CMSGitHub;
}));

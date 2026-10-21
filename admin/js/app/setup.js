/* ============================================================
   KUNI OFFICE 管理画面 — アクセスキーの用意（setup.html）
   サイト管理者（ViFight）が、GitHub でアクセスキーを作って確かめ、
   高桑様の端末に入れる手順を表示するページです。
   アクセスキーは入力欄と https://api.github.com への確認にだけ使い、
   どこにも保存しません（Web Storage・URL・ファイル・ログのどれにも出しません）。
   ============================================================ */
(function () {
    'use strict';

    const cfg = window.CMS_CONFIG;
    const GitHub = window.CMSGitHub;
    const $ = (id) => document.getElementById(id);

    const TOKEN_LIST_URL = 'https://github.com/settings/personal-access-tokens';
    const EXPIRES_DAYS = 366;

    // GitHub の「アクセスキーを作る」画面に、名前・説明・持ち主・期限・権限を入れた状態で開く URL
    // （どのサイトに使うか＝Repository access だけは、GitHub の仕様で入れておけない）
    function createKeyUrl() {
        const params = [
            ['name', 'KUNI OFFICE 管理画面'],
            ['description', 'KUNI OFFICE ホームページ管理画面（高桑様用）'],
            ['target_name', cfg.owner],
            ['expires_in', String(EXPIRES_DAYS)],
            ['contents', 'write'],
            ['actions', 'read']
        ];
        return TOKEN_LIST_URL + '/new?' + params.map(([k, v]) => k + '=' + encodeURIComponent(v)).join('&');
    }

    // 今日（日本時間）から366日後
    function expiryDate() {
        const date = new Date(Date.now() + EXPIRES_DAYS * 24 * 60 * 60 * 1000);
        return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
    }

    // 貼り付けたときに入りがちな空白・改行は取り除く（アクセスキーに空白は含まれない）
    function cleanKey(value) {
        return String(value || '').replace(/\s+/g, '');
    }

    /* ---------- 小さな DOM の道具（文字は textContent で入れる） ---------- */
    function el(tag, props, children) {
        const node = document.createElement(tag);
        Object.keys(props || {}).forEach((key) => {
            if (key === 'text') node.textContent = props[key];
            else if (key === 'class') node.className = props[key];
            else node.setAttribute(key, props[key]);
        });
        (children || []).forEach((child) => node.append(child));
        return node;
    }

    const ICONS = {
        ok: 'M5 12.5l4.5 4.5L19 7.5',
        alert: 'M12 3l10 18H2zM12 10v4.5M12 18h.01',
        external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6'
    };

    function icon(name) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('class', 'ico');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', 'currentColor');
        svg.setAttribute('stroke-width', '2');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        const path = document.createElementNS(ns, 'path');
        path.setAttribute('d', ICONS[name]);
        svg.append(path);
        return svg;
    }

    /* ---------- ② の結果 ---------- */
    function showResult(kind, title, text, link) {
        const box = $('checkResult');
        box.className = 'ks-result ks-result--' + kind;
        const body = el('div', { class: 'ks-result__body' }, [
            el('p', { class: 'ks-result__title', text: title }),
            el('p', { class: 'ks-result__text', text })
        ]);
        if (link) {
            const a = el('a', { class: 'ks-result__link', href: link.href, target: '_blank', rel: 'noopener noreferrer' }, [el('span', { text: link.label })]);
            a.append(icon('external'));
            body.append(a);
        }
        box.replaceChildren(icon(kind === 'ok' ? 'ok' : 'alert'), body);
        box.hidden = false;
        $('restartBtn').hidden = false;
    }

    function clearResult() {
        const box = $('checkResult');
        box.hidden = true;
        box.replaceChildren();
    }

    const FIX_LINK = { href: TOKEN_LIST_URL, label: 'GitHub のキーの一覧を開く' };
    // キーの範囲の確認で、このエラーなら結果を出さずに「もう一度」を促す（ほかは手で確かめてもらう）
    const SCOPE_RETRY = new Set(['network', 'server', 'rate_limited', 'unauthorized']);

    function showError(err) {
        const code = err && err.code;
        if (code === 'not_found') {
            showResult('error', 'kunioffice が選ばれていません',
                'GitHub のキーの設定で「Repository access」→「Only select repositories」→「kunioffice」を選んで保存（Update）し、もう一度「確認する」を押してください。（Resource owner が ' + cfg.owner + ' になっているかも確かめてください）', FIX_LINK);
        } else if (code === 'readonly') {
            showResult('error', '書き込みの権限がありません',
                'GitHub のキーの設定で、「Repository access」を「Only select repositories」→「kunioffice」にし（「Public repositories」のままでは書き込めません）、「Permissions」の「Contents」を「Read and write」にして保存（Update）してから、もう一度「確認する」を押してください。', FIX_LINK);
        } else if (code === 'too_broad') {
            const example = err.others && err.others.length ? '（例：' + err.others[0] + '）' : '';
            showResult('error', 'kunioffice 以外も操作できるキーです',
                'このキーでは、ほかのリポジトリ' + example + 'も操作できてしまいます。GitHub のキーの設定で「Repository access」を「Only select repositories」にして「kunioffice」だけを選んで保存（Update）し、もう一度「確認する」を押してください。', FIX_LINK);
        } else if (code === 'unauthorized') {
            showResult('error', 'キーが正しくありません',
                'GitHub に表示された「github_pat_」で始まる文字列を、もう一度コピーして貼り付けてください。期限切れ・削除済みのキーも使えません。');
        } else if (code === 'network') {
            showResult('error', 'インターネットに接続できません', '接続を確かめて、もう一度「確認する」を押してください。');
        } else {
            showResult('error', '確認できませんでした', (err && err.message) || 'エラーが発生しました。少し待ってから、もう一度お試しください。');
        }
    }

    /* ---------- ③ ---------- */
    function setHandover(open) {
        $('step3').classList.toggle('is-locked', !open);
        $('step3Locked').hidden = open;
        $('handover').hidden = !open;
    }

    function resetKeyField() {
        const input = $('keyInput');
        input.value = '';
        input.type = 'password';
        $('keyToggle').textContent = '表示';
        $('keyToggle').setAttribute('aria-pressed', 'false');
    }

    let checking = false;

    async function check() {
        if (checking) return;
        const key = cleanKey($('keyInput').value);
        setHandover(false);
        if (!key) {
            showResult('error', 'キーを貼り付けてください', '①で GitHub に表示された「github_pat_」で始まる文字列を貼り付けます。');
            $('keyInput').focus();
            return;
        }
        // 古い形式（Classic）のキーは、持ち主のすべてのリポジトリを操作できてしまうので使わない
        if (GitHub.isClassicKey(key)) {
            showResult('error', '古い形式のキーです',
                '「ghp_」などで始まるキーは、このサイト以外も操作できてしまいます。①のボタンから「github_pat_」で始まるキーを作り直してください。');
            return;
        }

        checking = true;
        const btn = $('checkBtn');
        btn.disabled = true;
        btn.replaceChildren(el('span', { class: 'spin', 'aria-hidden': 'true' }), '確認しています…');
        clearResult();
        try {
            const gh = new GitHub({ owner: cfg.owner, repo: cfg.repo, branch: cfg.branch, token: key });
            const result = await gh.verify();
            if (!result.canPush) throw Object.assign(new Error('readonly'), { code: 'readonly' });
            // 「All repositories」のキーは、高桑様の端末に記憶させると、ほかのリポジトリまで危なくなるので断る
            let scope = null;
            try {
                scope = await gh.checkScope();
            } catch (err) {
                if (SCOPE_RETRY.has(err.code)) throw err;
                // 自動では確かめられなかった（GitHub の仕様が変わったときなど）: 手で確かめてもらう
            }
            if (scope && !scope.onlyThisRepo) throw Object.assign(new Error('too_broad'), { code: 'too_broad', others: scope.others });
            resetKeyField();
            if (scope) {
                showResult('ok', 'OK！このキーで使えます', cfg.repo + ' だけを編集・公開できるキーであることを確かめました。③の手順で、高桑様の iPhone に入れてください。');
            } else {
                showResult('warn', 'このキーで使えます（1つだけ確かめてください）',
                    cfg.repo + ' の編集・公開はできます。ただ、ほかのリポジトリを操作できないかは自動で確かめられませんでした。GitHub のキーの設定で「Repository access」が「Only select repositories」→「kunioffice」だけになっていることを確かめてから、③に進んでください。', FIX_LINK);
            }
            setHandover(true);
            $('step3').scrollIntoView({ behavior: 'smooth', block: 'start' });
            $('step3Title').focus({ preventScroll: true });
        } catch (err) {
            showError(err);
        } finally {
            checking = false;
            btn.disabled = false;
            btn.replaceChildren('確認する');
        }
    }

    function restart() {
        resetKeyField();
        clearResult();
        setHandover(false);
        $('restartBtn').hidden = true;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function copyUrl() {
        const btn = $('copyUrlBtn');
        const url = $('adminUrl').textContent;
        try {
            await navigator.clipboard.writeText(url);
            btn.textContent = 'コピーしました';
        } catch (e) {
            // コピーできないブラウザ: URL を選んだ状態にして、手でコピーしてもらう
            const range = document.createRange();
            range.selectNodeContents($('adminUrl'));
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
            btn.textContent = '選んだ文字をコピーしてください';
        }
        setTimeout(() => { btn.textContent = 'URLをコピー'; }, 2500);
    }

    function init() {
        if (!cfg || !GitHub) return;
        $('createKeyLink').href = createKeyUrl();
        $('ownerName').textContent = cfg.owner;
        $('adminUrl').textContent = cfg.siteUrl.replace(/\/?$/, '/') + 'admin/';
        const until = expiryDate();
        document.querySelectorAll('[data-expiry]').forEach((node) => { node.textContent = until; });

        $('checkForm').addEventListener('submit', (e) => {
            e.preventDefault();
            check();
        });
        $('keyToggle').addEventListener('click', () => {
            const input = $('keyInput');
            const show = input.type === 'password';
            input.type = show ? 'text' : 'password';
            $('keyToggle').textContent = show ? '隠す' : '表示';
            $('keyToggle').setAttribute('aria-pressed', String(show));
        });
        $('restartBtn').addEventListener('click', restart);
        $('copyUrlBtn').addEventListener('click', copyUrl);
    }

    init();
}());

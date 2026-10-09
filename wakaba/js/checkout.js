/* ============================================================
   若葉のしずく — ご注文手続き
   入力 → 確認（定期便の条件を表示・同意必須）→ 送信
   ============================================================ */
(function () {
    'use strict';

    var C = window.WAKABA;
    var Cart = window.WakabaCart;
    var UI = window.WakabaUI;
    var ORDER_KEY = 'wakaba_last_order';

    var PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県',
        '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
        '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県',
        '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県',
        '大分県', '宮崎県', '鹿児島県', '沖縄県'];

    function $(sel, root) { return (root || document).querySelector(sel); }

    function toKatakana(s) {
        return s.replace(/[ぁ-ゖ]/g, function (ch) {
            return String.fromCharCode(ch.charCodeAt(0) + 0x60);
        });
    }
    function toHalfDigits(s) {
        return s.replace(/[０-９－ー―]/g, function (ch) {
            if (ch === '－' || ch === 'ー' || ch === '―') return '-';
            return String.fromCharCode(ch.charCodeAt(0) - 0xFEE0);
        });
    }

    function orderNumber() {
        var d = new Date();
        var pad = function (n) { return (n < 10 ? '0' : '') + n; };
        var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        var rnd = '';
        var buf = new Uint32Array(4);
        if (window.crypto && window.crypto.getRandomValues) window.crypto.getRandomValues(buf);
        else for (var i = 0; i < 4; i++) buf[i] = Math.floor(Math.random() * 4294967295);
        for (var j = 0; j < 4; j++) rnd += chars[buf[j] % chars.length];
        return 'WK' + String(d.getFullYear()).slice(2) + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + rnd;
    }

    /* ---------------- validation ---------------- */
    var RULES = {
        lastName: { required: true, label: '姓' },
        firstName: { required: true, label: '名' },
        lastKana: { required: true, label: 'セイ', pattern: /^[ァ-ヶー\s　]+$/, msg: 'カタカナで入力してください' },
        firstKana: { required: true, label: 'メイ', pattern: /^[ァ-ヶー\s　]+$/, msg: 'カタカナで入力してください' },
        email: { required: true, label: 'メールアドレス', pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, msg: 'メールアドレスの形式が正しくありません' },
        tel: { required: true, label: '電話番号', test: function (v) { var d = v.replace(/-/g, ''); return /^0\d{9,10}$/.test(d); }, msg: '電話番号は0から始まる10〜11桁で入力してください' },
        zip: { required: true, label: '郵便番号', test: function (v) { return /^\d{7}$/.test(v.replace(/-/g, '')); }, msg: '郵便番号は7桁で入力してください' },
        pref: { required: true, label: '都道府県' },
        address1: { required: true, label: '市区町村・番地' }
    };

    function setError(field, message) {
        var wrap = field.closest('.field');
        var err = wrap && wrap.querySelector('.field__error');
        field.setAttribute('aria-invalid', message ? 'true' : 'false');
        if (err) { err.textContent = message || ''; err.hidden = !message; }
    }

    function validate(form) {
        var firstInvalid = null;
        Object.keys(RULES).forEach(function (name) {
            var field = form.elements[name];
            if (!field) return;
            var rule = RULES[name];
            var v = (field.value || '').trim();
            var msg = '';
            if (rule.required && !v) msg = rule.label + 'を入力してください';
            else if (v && rule.pattern && !rule.pattern.test(v)) msg = rule.msg;
            else if (v && rule.test && !rule.test(v)) msg = rule.msg;
            if (name === 'pref' && !v) msg = '都道府県を選択してください';
            setError(field, msg);
            if (msg && !firstInvalid) firstInvalid = field;
        });
        return firstInvalid;
    }

    function readCustomer(form) {
        var f = form.elements;
        var zip = f.zip.value.replace(/-/g, '');
        return {
            name: f.lastName.value.trim() + ' ' + f.firstName.value.trim(),
            kana: f.lastKana.value.trim() + ' ' + f.firstKana.value.trim(),
            email: f.email.value.trim(),
            tel: f.tel.value.trim(),
            zip: zip.slice(0, 3) + '-' + zip.slice(3),
            address: f.pref.value + f.address1.value.trim() + (f.address2.value.trim() ? ' ' + f.address2.value.trim() : ''),
            time: f.time.value,
            note: f.note.value.trim()
        };
    }

    /* ---------------- order text ---------------- */
    function subscriptionLines(t) {
        var s = C.subscription;
        return [
            'お届け周期：' + s.cycle,
            '価格：毎回 ' + UI.yen(t.sub) + '（税込・送料無料）',
            '契約期間：' + s.term,
            '休止・解約：' + s.cancel,
            '手数料：' + s.fee
        ];
    }

    function buildOrderText(no, t, customer) {
        var now = new Date();
        var stamp = now.getFullYear() + '/' + (now.getMonth() + 1) + '/' + now.getDate() + ' ' +
            now.getHours() + ':' + ('0' + now.getMinutes()).slice(-2);
        var out = [];
        out.push('【若葉のしずく ご注文】');
        out.push('注文番号：' + no);
        out.push('ご注文日時：' + stamp);
        out.push('');
        out.push('■ ご注文商品');
        t.lines.forEach(function (l) {
            out.push('・' + l.product.name + '（' + l.product.spec + '） × ' + l.qty + '　' + UI.yen(l.lineTotal) +
                (l.product.type === 'subscription' ? '（毎回）' : ''));
        });
        if (t.hasOnetime) out.push('商品代金（通常購入）：' + UI.yen(t.onetime));
        if (t.hasSub) out.push('定期便（初回分）：' + UI.yen(t.sub));
        out.push('送料：' + (t.shipping ? UI.yen(t.shipping) : '無料'));
        out.push('今回のお支払い合計（税込）：' + UI.yen(t.total));
        if (t.hasSub) {
            out.push('');
            out.push('■ 定期便のご契約内容');
            subscriptionLines(t).forEach(function (s) { out.push(s); });
        }
        if (customer) {
            out.push('');
            out.push('■ お客様情報');
            out.push('お名前：' + customer.name + '（' + customer.kana + '）');
            out.push('メール：' + customer.email);
            out.push('電話：' + customer.tel);
            out.push('お届け先：〒' + customer.zip + ' ' + customer.address);
            out.push('お届け希望時間帯：' + customer.time);
            if (customer.note) out.push('備考：' + customer.note.replace(/\r?\n/g, '\r\n'));
        }
        out.push('');
        out.push('上記内容で注文します。（特定商取引法に基づく表記・ご利用ガイド・プライバシーポリシーに同意済み）');
        return out.join('\r\n');
    }

    function mailtoFor(no, text) {
        return 'mailto:' + C.shop.email +
            '?subject=' + encodeURIComponent('【ご注文】若葉のしずく ' + no) +
            '&body=' + encodeURIComponent(text);
    }

    function saveOrder(order) {
        try { window.sessionStorage.setItem(ORDER_KEY, JSON.stringify(order)); } catch (e) { /* ignore */ }
    }

    /* ---------------- page wiring ---------------- */
    function renderSummary() {
        var t = Cart.totals();
        var lines = $('[data-sum-lines]');
        var totals = $('[data-sum-totals]');
        if (lines) UI.renderLines(lines, t, { readonly: true });
        if (totals) UI.renderTotals(totals, t);
        return t;
    }

    function fillConfirm(t, customer) {
        var dl = $('[data-confirm-customer]');
        if (dl) {
            dl.innerHTML = '';
            var rows = customer ? [
                ['お名前', customer.name + '（' + customer.kana + '）'],
                ['メールアドレス', customer.email],
                ['電話番号', customer.tel],
                ['お届け先', '〒' + customer.zip + ' ' + customer.address],
                ['お届け希望時間帯', customer.time],
                ['備考', customer.note || 'なし']
            ] : [];
            rows.forEach(function (r) {
                var dt = document.createElement('dt'); dt.textContent = r[0];
                var dd = document.createElement('dd'); dd.textContent = r[1];
                dl.appendChild(dt); dl.appendChild(dd);
            });
            dl.closest('.confirm-block').hidden = !customer;
        }
        var subBox = $('[data-confirm-sub]');
        if (subBox) {
            subBox.hidden = !t.hasSub;
            var ul = subBox.querySelector('ul');
            if (ul) {
                ul.innerHTML = '';
                if (t.hasSub) subscriptionLines(t).forEach(function (s) {
                    var li = document.createElement('li'); li.textContent = s; ul.appendChild(li);
                });
            }
        }
    }

    function showStep(step) {
        var form = $('#orderForm');
        var confirm = $('#confirmStep');
        form.hidden = step !== 1;
        confirm.hidden = step !== 2;
        document.querySelectorAll('.steps li').forEach(function (li, i) {
            li.classList.toggle('is-current', i === step - 1);
            li.classList.toggle('is-done', i < step - 1);
        });
        var heading = step === 1 ? form.querySelector('h2') : confirm.querySelector('h2');
        if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function paymentLinkFor(t) {
        if (C.checkout.mode !== 'stripe' || t.lines.length !== 1) return '';
        return C.checkout.stripePaymentLinks[t.lines[0].id] || '';
    }

    document.addEventListener('DOMContentLoaded', function () {
        var root = $('[data-checkout]');
        if (!root) return;

        var form = $('#orderForm');
        var prefSelect = form.elements.pref;
        PREFS.forEach(function (p) {
            var o = document.createElement('option'); o.value = p; o.textContent = p; prefSelect.appendChild(o);
        });

        var t = renderSummary();
        if (!t.lines.length) {
            $('[data-empty]').hidden = false;
            $('.checkout-grid').hidden = true;
            $('.steps').hidden = true;
            return;
        }

        var mode = C.checkout.mode;
        var link = paymentLinkFor(t);
        var useRemotePayment = (mode === 'stripe' && link) || (mode === 'endpoint' && C.checkout.endpoint);
        var customer = null;

        $('[data-payment-note]').textContent = useRemotePayment
            ? '次の画面で、決済サービス（Stripe）の安全なページからクレジットカード等でお支払いいただけます。お届け先もそちらでご入力ください。'
            : C.checkout.paymentNote;
        $('#placeOrder').textContent = useRemotePayment ? 'お支払い手続きへ進む' : 'メールで注文を送信する';
        if (mode === 'stripe' && !link) {
            $('[data-mode-note]').hidden = false;
        }

        // remote payment: skip the address form (the payment page collects it)
        if (useRemotePayment) {
            fillConfirm(t, null);
            showStep(2);
        }

        form.lastKana.addEventListener('blur', function () { this.value = toKatakana(this.value); });
        form.firstKana.addEventListener('blur', function () { this.value = toKatakana(this.value); });
        form.zip.addEventListener('blur', function () { this.value = toHalfDigits(this.value); });
        form.tel.addEventListener('blur', function () { this.value = toHalfDigits(this.value); });

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            var bad = validate(form);
            if (bad) { bad.focus(); return; }
            customer = readCustomer(form);
            t = renderSummary();
            fillConfirm(t, customer);
            showStep(2);
        });

        $('#backToForm').addEventListener('click', function () { showStep(1); });

        var agree = $('#agree');
        var place = $('#placeOrder');
        agree.addEventListener('change', function () { place.disabled = !agree.checked; });

        place.addEventListener('click', function () {
            if (!agree.checked) return;
            t = Cart.totals();
            if (!t.lines.length) { window.location.href = 'cart.html'; return; }
            var no = orderNumber();

            if (mode === 'stripe' && link) {
                saveOrder({ no: no, mode: 'stripe', text: buildOrderText(no, t, null), total: t.total });
                var sep = link.indexOf('?') === -1 ? '?' : '&';
                window.location.href = link + sep + 'client_reference_id=' + encodeURIComponent(no);
                return;
            }

            if (mode === 'endpoint' && C.checkout.endpoint) {
                place.disabled = true;
                place.textContent = '決済ページを準備しています…';
                fetch(C.checkout.endpoint, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ orderNo: no, items: t.lines.map(function (l) { return { id: l.id, qty: l.qty }; }) })
                }).then(function (r) { return r.json(); }).then(function (res) {
                    if (!res || !res.url) throw new Error('no url');
                    saveOrder({ no: no, mode: 'endpoint', text: buildOrderText(no, t, null), total: t.total });
                    window.location.href = res.url;
                }).catch(function () {
                    place.disabled = false;
                    place.textContent = 'お支払い手続きへ進む';
                    $('[data-mode-note]').hidden = false;
                    $('[data-mode-note]').textContent = '決済ページを開けませんでした。時間をおいて再度お試しいただくか、お電話・メールでご注文ください。';
                });
                return;
            }

            // email order (default)
            var text = buildOrderText(no, t, customer);
            var mailto = mailtoFor(no, text);
            saveOrder({ no: no, mode: 'email', text: text, mailto: mailto, total: t.total });
            window.location.href = mailto;
            setTimeout(function () { window.location.href = 'thanks.html'; }, 600);
        });
    });

    /* ---------------- thanks page ---------------- */
    document.addEventListener('DOMContentLoaded', function () {
        var page = $('[data-thanks]');
        if (!page) return;
        var order = null;
        try { order = JSON.parse(window.sessionStorage.getItem(ORDER_KEY)); } catch (e) { order = null; }
        var params = new URLSearchParams(window.location.search);
        var paid = params.get('status') === 'paid';

        if (paid) {
            $('[data-thanks-paid]').hidden = false;
            Cart.clear();
        } else if (order && order.mode === 'email') {
            $('[data-thanks-email]').hidden = false;
            Cart.clear();
        } else {
            $('[data-thanks-none]').hidden = false;
            $('.steps').hidden = true;
        }

        if (order) {
            document.querySelectorAll('[data-order-no]').forEach(function (n) { n.textContent = order.no; });
            var pre = $('[data-order-text]');
            if (pre) pre.textContent = order.text;
            var again = $('[data-mail-again]');
            if (again && order.mailto) again.href = order.mailto;
            var copy = $('[data-copy-order]');
            if (copy) copy.addEventListener('click', function () {
                var done = function () { UI.toast('ご注文内容をコピーしました'); };
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(order.text).then(done, function () { selectPre(pre); });
                } else { selectPre(pre); }
            });
        }
    });

    function selectPre(pre) {
        var range = document.createRange();
        range.selectNodeContents(pre);
        var sel = window.getSelection();
        sel.removeAllRanges(); sel.addRange(range);
        UI.toast('内容を選択しました。コピーしてご利用ください');
    }
})();

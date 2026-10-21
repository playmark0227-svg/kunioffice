const test = require('node:test');
const assert = require('node:assert/strict');
const ContentClient = require('../admin/js/data/content-client.js');
const Policy = require('../admin/js/data/path-policy.js');
const GitHub = require('../admin/js/data/github-client.js');

function adapter(overrides = {}) {
    return Object.assign(Object.fromEntries(ContentClient.methods.map((name) => [name, async () => null])), overrides);
}

test('編集画面は保存先の認証情報を持たず、Map/画像型を保って読み込める', async () => {
    const snapshot = { commitSha: 'revision', files: new Map([['index.html', { sha: 'blob' }]]) };
    const bytes = new Uint8Array([0, 255, 10]);
    const provider = adapter({
        credential: 'not-a-real-credential',
        state: snapshot,
        async snapshot() { return this.state; },
        async getBlobBytes(sha) { assert.equal(sha, 'blob'); return bytes; }
    });
    const client = ContentClient.from(provider);
    assert.equal(await client.snapshot(), snapshot);
    assert.equal(await client.getBlobBytes('blob'), bytes);
    assert.deepEqual(Object.keys(client), [...ContentClient.methods]);
    assert.equal(JSON.stringify(client), '{}');
    assert.equal(Object.isFrozen(client), true);
});

test('公開時の基準版・変更と、競合エラーの詳細を保存先へそのまま渡す', async () => {
    const request = { baseCommitSha: 'base', changes: [{ path: 'services.html', text: '本文' }], message: '変更' };
    const conflict = Object.assign(new Error('先に更新されています'), { code: 'conflict', status: 409, paths: ['services.html'] });
    const client = ContentClient.from(adapter({
        async commitChanges(options) { assert.equal(options, request); throw conflict; }
    }));
    await assert.rejects(client.commitChanges(request), (error) => error === conflict);
});

test('不完全な保存先を使って編集を開始しない', () => {
    assert.throws(() => ContentClient.from({ snapshot() {} }), /getBlobText/);
});

test('公開ページと画像を扱い、内部コード・資料・不正なパスは変更対象にしない', () => {
    for (const path of ['index.html', 'services.html', 'js/main.js', 'wakaba/js/config.js', 'images/works/photo.jpg']) {
        assert.equal(Policy.isProtectedPath(path), false, path);
    }
    for (const path of ['server.js', 'server/checkout/app.js', 'docs/example.html', 'scripts/example.js',
        'tests/example.js', 'admin/js/app/admin.js', 'manual/index.html', '.github/workflows/pages.yml',
        'dist/index.html', 'node_modules/lib/index.js', 'wakaba/node_modules/lib.js', '../index.html',
        '/index.html', 'images/../server.js', 'images\\photo.jpg', 'index.html?x=1', '.env', 'css/style.css']) {
        assert.equal(Policy.isProtectedPath(path), true, path);
    }
    assert.equal(Policy.isSiteTextPath('images/photo.jpg'), false);
    assert.equal(Policy.isSiteTextPath('server/checkout/app.js'), false);
});

test('GitHubアダプターもサーバーコードへの保存を通信前に拒否する', async () => {
    let calls = 0;
    const client = new GitHub({ owner: 'example', repo: 'site', fetch: async () => { calls++; throw new Error('通信しない'); } });
    await assert.rejects(client.commitChanges({ changes: [{ path: 'server/checkout/app.js', text: '変更' }] }),
        (error) => error.code === 'protected' && error.paths.includes('server/checkout/app.js'));
    assert.equal(calls, 0);
});

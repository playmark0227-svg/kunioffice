const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');

for (const entry of ['admin/index.html', 'admin/setup.html']) {
    test(entry + ' の分割後のスクリプトが存在し、データ層を正しい順序で読み込む', () => {
        const html = fs.readFileSync(path.join(root, entry), 'utf8');
        const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
        for (const script of scripts) {
            assert.equal(fs.existsSync(path.resolve(root, path.dirname(entry), script)), true, script);
        }
        const context = vm.createContext({});
        for (const script of scripts.filter((script) => script.startsWith('js/data/'))) {
            vm.runInContext(fs.readFileSync(path.resolve(root, path.dirname(entry), script), 'utf8'), context);
        }
        assert.equal(typeof context.CMSGitHub, 'function');
        assert.equal(typeof context.CMSPathPolicy.isProtectedPath, 'function');
        if (entry === 'admin/index.html') assert.equal(typeof context.CMSContentClient.from, 'function');
    });
}

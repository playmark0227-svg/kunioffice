// 既存の `node server.js` / `npm start` 用エントリーポイント。
// 決済サーバーの実装と引き継ぎ手順は server/ を参照してください。
require('./server/checkout').start();

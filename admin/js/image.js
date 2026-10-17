/* ============================================================
   KUNI OFFICE 管理画面 — 写真の準備
   選んだ写真を読み込み、長い辺 2000px 以内に縮めて、差し替え先の
   ファイル形式（jpg / png / webp）に変換します。
   ============================================================ */
(function () {
    'use strict';

    const MAX_EDGE = 2000;
    const MAX_BYTES = 8 * 1024 * 1024;
    const QUALITY = 0.85;

    const MESSAGES = {
        decode: 'この写真の形式は読み込めませんでした。iPhoneの場合は「設定 → カメラ → フォーマット → 互換性優先」にするか、スクリーンショットを使ってください。',
        too_large: '写真のデータが大きすぎます（8MBまで）。別の写真を選んでください。',
        encode: 'この写真を保存用の形式に変換できませんでした。別の写真を選んでください。',
        not_image: '写真（画像ファイル）を選んでください。'
    };

    class ImageError extends Error {
        constructor(code) {
            super(MESSAGES[code]);
            this.name = 'CMSImageError';
            this.code = code;
        }
    }

    // 差し替え先のパスの拡張子 → 出力形式
    function formatFor(path) {
        const ext = (/\.([a-z0-9]+)$/i.exec(path || '') || [])[1];
        const e = (ext || 'jpg').toLowerCase();
        if (e === 'png') return { mime: 'image/png', quality: undefined };
        if (e === 'webp') return { mime: 'image/webp', quality: QUALITY };
        return { mime: 'image/jpeg', quality: QUALITY };
    }

    // 写真の向き（EXIF）を反映して読み込む。createImageBitmap が使えなければ <img> で読む
    async function decode(file) {
        if (typeof createImageBitmap === 'function') {
            try {
                return await createImageBitmap(file, { imageOrientation: 'from-image' });
            } catch (e) { /* 次の方法を試す */ }
        }
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.decoding = 'async';
            await new Promise((resolve, reject) => {
                img.onload = resolve;
                img.onerror = reject;
                img.src = url;
            });
            if (img.decode) await img.decode().catch(() => {});
            if (!img.naturalWidth) throw new Error('empty');
            return img;
        } catch (e) {
            throw new ImageError('decode');
        } finally {
            URL.revokeObjectURL(url);
        }
    }

    function toBlob(canvas, mime, quality) {
        return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    }

    async function blobToBase64(blob) {
        const bytes = new Uint8Array(await blob.arrayBuffer());
        return window.CMSGitHub.bytesToBase64(bytes);
    }

    /**
     * prepare(file, targetPath) → { blob, blobUrl, base64, width, height, mime, size }
     * 失敗すると CMSImage.Error（code: decode / too_large / encode / not_image）。
     */
    async function prepare(file, targetPath) {
        if (!file) throw new ImageError('not_image');
        if (file.type && !/^image\//.test(file.type)) throw new ImageError('not_image');
        const source = await decode(file);
        const srcW = source.width || source.naturalWidth;
        const srcH = source.height || source.naturalHeight;
        if (!srcW || !srcH) throw new ImageError('decode');

        const scale = Math.min(1, MAX_EDGE / Math.max(srcW, srcH)); // 拡大はしない
        const width = Math.max(1, Math.round(srcW * scale));
        const height = Math.max(1, Math.round(srcH * scale));
        const { mime, quality } = formatFor(targetPath);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (mime === 'image/jpeg') { // JPEG は透明にできないので白で塗っておく
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, width, height);
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(source, 0, 0, width, height);
        if (source.close) source.close();

        const blob = await toBlob(canvas, mime, quality);
        canvas.width = canvas.height = 0; // iPhone のメモリをすぐ返す
        if (!blob || blob.type !== mime) throw new ImageError('encode');
        if (blob.size > MAX_BYTES) throw new ImageError('too_large');
        return {
            blob,
            blobUrl: URL.createObjectURL(blob),
            base64: await blobToBase64(blob),
            width,
            height,
            mime,
            size: blob.size
        };
    }

    function formatSize(bytes) {
        if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + 'MB';
        return Math.max(1, Math.round(bytes / 1024)) + 'KB';
    }

    window.CMSImage = { prepare, formatFor, formatSize, Error: ImageError, MESSAGES };
}());

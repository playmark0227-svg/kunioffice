// Firebase設定と実績データ管理
// このファイルはFirebase Firestoreを使って実績データを動的に管理します

// ========================================
// Firebase初期化
// ========================================
// Firebase設定（実際のFirebaseプロジェクトの値に置き換えてください）
const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT_ID.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// Firebase初期化（本番環境で有効化）
let db = null;
let storage = null;

// Firebaseが読み込まれているかチェック
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    storage = firebase.storage();
    console.log('Firebase initialized successfully');
} else {
    console.log('Firebase not loaded - using demo mode');
}

// ========================================
// 実績データ構造
// ========================================
/*
Firestoreコレクション: "works"

ドキュメント構造:
{
    id: "work001",
    category: "photo", // photo, print, video, signboard, goods
    title: "地域イベント撮影",
    description: "標津町の祭りイベントの記録撮影。躍動感のある瞬間を捉えました。",
    imageUrl: "https://firebasestorage.googleapis.com/...",
    imageFileName: "work-event.jpg",
    order: 1, // 表示順序
    featured: true, // おすすめ実績
    createdAt: firebase.firestore.Timestamp,
    updatedAt: firebase.firestore.Timestamp,
    published: true // 公開/非公開
}
*/

// ========================================
// 実績データの取得
// ========================================
async function loadWorksFromFirebase() {
    if (!db) {
        console.log('Firebase not initialized - using static data');
        return null;
    }
    
    try {
        const worksSnapshot = await db.collection('works')
            .where('published', '==', true)
            .orderBy('order', 'asc')
            .get();
        
        const works = [];
        worksSnapshot.forEach(doc => {
            works.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        console.log(`Loaded ${works.length} works from Firebase`);
        return works;
    } catch (error) {
        console.error('Error loading works from Firebase:', error);
        return null;
    }
}

// カテゴリー別に実績を取得
async function loadWorksByCategory(category) {
    if (!db) {
        return null;
    }
    
    try {
        const worksSnapshot = await db.collection('works')
            .where('published', '==', true)
            .where('category', '==', category)
            .orderBy('order', 'asc')
            .get();
        
        const works = [];
        worksSnapshot.forEach(doc => {
            works.push({
                id: doc.id,
                ...doc.data()
            });
        });
        
        return works;
    } catch (error) {
        console.error('Error loading works by category:', error);
        return null;
    }
}

// ========================================
// 実績データの表示
// ========================================
function renderWorks(works) {
    const worksGrid = document.querySelector('.works-grid-large');
    if (!worksGrid || !works) return;
    
    // 既存の実績を削除
    worksGrid.innerHTML = '';
    
    // Firebaseから取得した実績を表示
    works.forEach(work => {
        const workItem = document.createElement('div');
        workItem.className = 'work-item';
        workItem.setAttribute('data-category', work.category);
        
        workItem.innerHTML = `
            <div class="work-image">
                <img src="${work.imageUrl}" alt="${work.title}" loading="lazy">
            </div>
            <div class="work-details">
                <span class="work-category">${getCategoryLabel(work.category)}</span>
                <h3>${work.title}</h3>
                <p>${work.description}</p>
            </div>
        `;
        
        worksGrid.appendChild(workItem);
    });
}

// カテゴリーラベルを取得
function getCategoryLabel(category) {
    const labels = {
        'photo': '写真撮影',
        'print': '印刷物',
        'video': '映像制作',
        'signboard': '看板',
        'goods': 'オリジナルグッズ'
    };
    return labels[category] || 'その他';
}

// ========================================
// ページ読み込み時の処理
// ========================================
document.addEventListener('DOMContentLoaded', async function() {
    // 実績ページでのみ実行
    if (document.querySelector('.works-grid-large')) {
        const works = await loadWorksFromFirebase();
        
        if (works && works.length > 0) {
            renderWorks(works);
            console.log('Works loaded from Firebase');
            
            // フィルター機能を再初期化
            initializeFilters();
        } else {
            console.log('Using static HTML works data');
        }
    }
});

// フィルター機能の初期化
function initializeFilters() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const workItems = document.querySelectorAll('.work-item');
    
    if (filterButtons.length === 0 || workItems.length === 0) return;
    
    // URLパラメータからフィルターを取得
    const urlParams = new URLSearchParams(window.location.search);
    const filterParam = urlParams.get('filter');
    
    if (filterParam) {
        const targetButton = document.querySelector(`.filter-btn[data-filter="${filterParam}"]`);
        if (targetButton) {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            targetButton.classList.add('active');
            applyFilter(filterParam, workItems);
        }
    }
    
    filterButtons.forEach(button => {
        button.addEventListener('click', function() {
            filterButtons.forEach(btn => btn.classList.remove('active'));
            this.classList.add('active');
            
            const filterValue = this.getAttribute('data-filter');
            applyFilter(filterValue, workItems);
        });
    });
    
    // 初期状態の設定
    workItems.forEach(item => {
        item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    });
}

// ========================================
// 実績データの追加（管理画面用）
// ========================================
async function addWork(workData) {
    if (!db) {
        console.error('Firebase not initialized');
        return false;
    }
    
    try {
        const docRef = await db.collection('works').add({
            ...workData,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Work added with ID:', docRef.id);
        return docRef.id;
    } catch (error) {
        console.error('Error adding work:', error);
        return false;
    }
}

// 実績データの更新
async function updateWork(workId, updateData) {
    if (!db) {
        console.error('Firebase not initialized');
        return false;
    }
    
    try {
        await db.collection('works').doc(workId).update({
            ...updateData,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('Work updated:', workId);
        return true;
    } catch (error) {
        console.error('Error updating work:', error);
        return false;
    }
}

// 実績データの削除
async function deleteWork(workId) {
    if (!db) {
        console.error('Firebase not initialized');
        return false;
    }
    
    try {
        await db.collection('works').doc(workId).delete();
        console.log('Work deleted:', workId);
        return true;
    } catch (error) {
        console.error('Error deleting work:', error);
        return false;
    }
}

// ========================================
// 画像アップロード（Firebase Storage）
// ========================================
async function uploadWorkImage(file) {
    if (!storage) {
        console.error('Firebase Storage not initialized');
        return null;
    }
    
    try {
        const fileName = `works/${Date.now()}_${file.name}`;
        const storageRef = storage.ref(fileName);
        
        // 画像をアップロード
        const snapshot = await storageRef.put(file);
        
        // ダウンロードURLを取得
        const downloadURL = await snapshot.ref.getDownloadURL();
        
        console.log('Image uploaded:', downloadURL);
        return {
            url: downloadURL,
            fileName: fileName
        };
    } catch (error) {
        console.error('Error uploading image:', error);
        return null;
    }
}

// 画像の削除
async function deleteWorkImage(fileName) {
    if (!storage) {
        console.error('Firebase Storage not initialized');
        return false;
    }
    
    try {
        const storageRef = storage.ref(fileName);
        await storageRef.delete();
        console.log('Image deleted:', fileName);
        return true;
    } catch (error) {
        console.error('Error deleting image:', error);
        return false;
    }
}

// ========================================
// エクスポート（グローバルに公開）
// ========================================
window.FirebaseWorks = {
    loadWorks: loadWorksFromFirebase,
    loadWorksByCategory: loadWorksByCategory,
    addWork: addWork,
    updateWork: updateWork,
    deleteWork: deleteWork,
    uploadImage: uploadWorkImage,
    deleteImage: deleteWorkImage
};

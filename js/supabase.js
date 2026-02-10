// Supabase設定ファイル
// 本番環境では環境変数を使用してください

const SUPABASE_CONFIG = {
    url: 'https://rmfkcnyyixjmbitvyjqu.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJtZmtjbnl5aXhqbWJpdHZ5anF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA3MDMwNjYsImV4cCI6MjA4NjI3OTA2Nn0.mwgogkbe4YKnCfvLrIW1ei6fu3xnDtB5nGymxBeTz5c'
};

// Supabaseクライアントの初期化
let supabase = null;

function initSupabase() {
    console.log('initSupabase called');
    console.log('Current supabase value:', supabase);
    console.log('window.supabase:', typeof window.supabase);
    
    if (supabase === null) {
        try {
            // Supabase JSクライアントが読み込まれているか確認
            if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
                console.log('Creating Supabase client...');
                console.log('URL:', SUPABASE_CONFIG.url);
                console.log('Key exists:', !!SUPABASE_CONFIG.anonKey);
                
                supabase = window.supabase.createClient(
                    SUPABASE_CONFIG.url,
                    SUPABASE_CONFIG.anonKey
                );
                console.log('Supabase client created:', supabase);
                console.log('Supabase initialized successfully');
                return true;
            } else {
                console.error('Supabase JS client not loaded yet');
                console.log('window.supabase type:', typeof window.supabase);
                return false;
            }
        } catch (error) {
            console.error('Error initializing Supabase:', error);
            return false;
        }
    }
    console.log('Supabase already initialized');
    return true;
}

// 実績データを取得する関数
async function fetchWorks(category = 'all') {
    if (!initSupabase()) {
        console.error('Supabase not initialized');
        return [];
    }

    try {
        let query = supabase
            .from('works')
            .select('*')
            .order('created_at', { ascending: false });

        // カテゴリでフィルター
        if (category !== 'all') {
            query = query.eq('category', category);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error fetching works:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error fetching works:', error);
        return [];
    }
}

// 実績を表示する関数
function renderWork(work) {
    const workItem = document.createElement('div');
    workItem.className = 'work-item';
    workItem.setAttribute('data-category', work.category);
    
    // 画像URL（Supabaseストレージから取得）
    const imageUrl = work.image_url || '';
    const imageHtml = imageUrl 
        ? `<img src="${imageUrl}" alt="${work.title}">`
        : `<div class="placeholder-image">${getCategoryEmoji(work.category)}</div>`;

    workItem.innerHTML = `
        <div class="work-image">
            ${imageHtml}
        </div>
        <div class="work-details">
            <span class="work-category">${getCategoryName(work.category)}</span>
            <h3>${work.title}</h3>
            <p>${work.description}</p>
        </div>
    `;

    return workItem;
}

// カテゴリ名を取得
function getCategoryName(category) {
    const categoryNames = {
        'photo': '写真撮影',
        'print': '印刷物',
        'video': '映像制作',
        'signboard': '看板',
        'goods': 'オリジナルグッズ',
        'other': 'その他'
    };
    return categoryNames[category] || category;
}

// カテゴリの絵文字を取得
function getCategoryEmoji(category) {
    const categoryEmojis = {
        'photo': '📷',
        'print': '🖨️',
        'video': '🎬',
        'signboard': '🪧',
        'goods': '👕',
        'other': '✨'
    };
    return categoryEmojis[category] || '📦';
}

// 実績一覧を読み込む
async function loadWorks(category = 'all') {
    const worksGrid = document.querySelector('.works-grid-large');
    
    if (!worksGrid) {
        console.warn('Works grid element not found');
        return;
    }

    // ローディング表示
    worksGrid.innerHTML = '<div class="loading">読み込み中...</div>';

    try {
        const works = await fetchWorks(category);

        if (works.length === 0) {
            worksGrid.innerHTML = '<div class="no-works">実績がまだ登録されていません。</div>';
            return;
        }

        // 実績を表示
        worksGrid.innerHTML = '';
        works.forEach(work => {
            const workElement = renderWork(work);
            worksGrid.appendChild(workElement);
        });

        // アニメーション適用
        setTimeout(() => {
            document.querySelectorAll('.work-item').forEach((item, index) => {
                item.style.opacity = '0';
                item.style.transform = 'translateY(30px)';
                item.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
                
                setTimeout(() => {
                    item.style.opacity = '1';
                    item.style.transform = 'translateY(0)';
                }, 50);
            });
        }, 10);

    } catch (error) {
        console.error('Error loading works:', error);
        worksGrid.innerHTML = '<div class="error">実績の読み込みに失敗しました。</div>';
    }
}

// ホームページ用：実績プレビューを読み込む
async function loadWorksPreview(limit = 4) {
    const worksGrid = document.querySelector('.works-grid');
    
    if (!worksGrid) {
        return;
    }

    try {
        if (!initSupabase()) {
            console.warn('Supabase not initialized for preview');
            return;
        }

        const { data: works, error } = await supabase
            .from('works')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('Error fetching works preview:', error);
            return;
        }

        if (works && works.length > 0) {
            worksGrid.innerHTML = '';
            works.forEach(work => {
                const workCard = document.createElement('div');
                workCard.className = 'work-card';
                
                const imageUrl = work.image_url || '';
                const imageHtml = imageUrl 
                    ? `<img src="${imageUrl}" alt="${work.title}">`
                    : `<div class="placeholder-image">${getCategoryEmoji(work.category)}</div>`;

                workCard.innerHTML = `
                    <div class="work-image">
                        ${imageHtml}
                    </div>
                    <div class="work-info">
                        <h3>${work.title}</h3>
                        <p>${work.description}</p>
                    </div>
                `;
                worksGrid.appendChild(workCard);
            });
        }
    } catch (error) {
        console.error('Error loading works preview:', error);
    }
}

// ページ読み込み時の処理
document.addEventListener('DOMContentLoaded', function() {
    // 実績ページの場合
    if (document.querySelector('.works-grid-large')) {
        // Supabaseが設定されている場合のみ読み込み
        if (SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL') {
            loadWorks('all');

            // フィルターボタンのイベント設定
            const filterButtons = document.querySelectorAll('.filter-btn');
            filterButtons.forEach(button => {
                button.addEventListener('click', function() {
                    filterButtons.forEach(btn => btn.classList.remove('active'));
                    this.classList.add('active');
                    
                    const filterValue = this.getAttribute('data-filter');
                    loadWorks(filterValue);
                });
            });
        } else {
            console.warn('Supabase not configured. Please update SUPABASE_CONFIG in js/supabase.js');
        }
    }

    // ホームページの実績プレビュー
    if (document.querySelector('.works-grid') && !document.querySelector('.works-grid-large')) {
        if (SUPABASE_CONFIG.url !== 'YOUR_SUPABASE_URL') {
            loadWorksPreview(4);
        }
    }
});

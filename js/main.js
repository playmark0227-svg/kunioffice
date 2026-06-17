// ========================================
// ハンバーガーメニューの制御
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('menuToggle');
    const mainNav = document.getElementById('mainNav');
    
    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', function() {
            mainNav.classList.toggle('active');
            
            // ハンバーガーアイコンのアニメーション
            this.classList.toggle('active');
        });

        // メニューリンクをクリックしたらメニューを閉じる
        const navLinks = mainNav.querySelectorAll('a');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                mainNav.classList.remove('active');
                menuToggle.classList.remove('active');
            });
        });
    }
});

// ========================================
// 実績ページのフィルター機能
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const filterButtons = document.querySelectorAll('.filter-btn');
    const workItems = document.querySelectorAll('.work-item');
    
    if (filterButtons.length > 0 && workItems.length > 0) {
        // URLパラメータからフィルターを取得
        const urlParams = new URLSearchParams(window.location.search);
        const filterParam = urlParams.get('filter');
        
        // URLパラメータがあれば、そのフィルターを適用
        if (filterParam) {
            const targetButton = document.querySelector(`.filter-btn[data-filter="${filterParam}"]`);
            if (targetButton) {
                // アクティブボタンを切り替え
                filterButtons.forEach(btn => btn.classList.remove('active'));
                targetButton.classList.add('active');
                
                // フィルタリング実行
                applyFilter(filterParam, workItems);
            }
        }
        
        filterButtons.forEach(button => {
            button.addEventListener('click', function() {
                // アクティブボタンの切り替え
                filterButtons.forEach(btn => btn.classList.remove('active'));
                this.classList.add('active');
                
                const filterValue = this.getAttribute('data-filter');
                
                // フィルタリング実行
                applyFilter(filterValue, workItems);
            });
        });
        
        // 初期状態の設定
        workItems.forEach(item => {
            item.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        });
    }
});

// フィルタリング処理を関数化
function applyFilter(filterValue, workItems) {
    workItems.forEach(item => {
        const category = item.getAttribute('data-category');
        
        if (filterValue === 'all' || category === filterValue) {
            item.style.display = 'block';
            // フェードインアニメーション
            setTimeout(() => {
                item.style.opacity = '1';
                item.style.transform = 'translateY(0)';
            }, 10);
        } else {
            item.style.opacity = '0';
            item.style.transform = 'translateY(20px)';
            setTimeout(() => {
                item.style.display = 'none';
            }, 300);
        }
    });
}

// ========================================
// お問い合わせフォームの送信処理
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const contactForm = document.getElementById('contactForm');
    const formMessage = document.getElementById('formMessage');
    
    if (contactForm) {
        contactForm.addEventListener('submit', function(e) {
            e.preventDefault();
            
            // フォームの値を取得
            const formData = {
                name: document.getElementById('name').value,
                company: document.getElementById('company').value,
                email: document.getElementById('email').value,
                phone: document.getElementById('phone').value,
                service: document.getElementById('service').value,
                subject: document.getElementById('subject').value,
                message: document.getElementById('message').value,
                privacy: document.getElementById('privacy').checked
            };
            
            // バリデーション
            if (!formData.privacy) {
                showMessage('個人情報の取り扱いについて同意してください。', 'error');
                return;
            }
            
            // 送信ボタンを無効化
            const submitButton = contactForm.querySelector('button[type="submit"]');
            const originalText = submitButton.textContent;
            submitButton.disabled = true;
            submitButton.textContent = '送信中...';
            
            // 実際の送信処理（ここでは疑似的な処理）
            // 実装時には適切なバックエンドAPIへの送信処理に置き換えてください
            setTimeout(() => {
                // 成功メッセージを表示
                showMessage('お問い合わせありがとうございます。担当者より折り返しご連絡いたします。', 'success');
                
                // フォームをリセット
                contactForm.reset();
                
                // 送信ボタンを有効化
                submitButton.disabled = false;
                submitButton.textContent = originalText;
                
                // フォームを非表示にする
                contactForm.style.display = 'none';
                
                // 3秒後にページトップへスクロール
                setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }, 3000);
            }, 1000);
        });
    }
    
    function showMessage(message, type) {
        if (formMessage) {
            formMessage.textContent = message;
            formMessage.className = 'form-message ' + type;
            formMessage.style.display = 'block';
            
            // メッセージまでスクロール
            formMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    }
});

// ========================================
// スムーズスクロール
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const links = document.querySelectorAll('a[href^="#"]');
    
    links.forEach(link => {
        link.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href !== '#' && href !== '') {
                e.preventDefault();
                
                const target = document.querySelector(href);
                if (target) {
                    const headerHeight = document.querySelector('.header').offsetHeight;
                    const targetPosition = target.offsetTop - headerHeight - 20;
                    
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });
});

// ========================================
// スクロール時のヘッダー制御
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const header = document.querySelector('.header');
    let lastScrollTop = 0;
    let scrollTimeout;
    
    window.addEventListener('scroll', function() {
        clearTimeout(scrollTimeout);
        
        scrollTimeout = setTimeout(() => {
            const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            if (scrollTop > 100) {
                header.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.1)';
            } else {
                header.style.boxShadow = '0 1px 3px rgba(0, 0, 0, 0.1)';
            }
            
            lastScrollTop = scrollTop;
        }, 10);
    });
});

// ========================================
// カードのフェードインアニメーション
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const observerOptions = {
        threshold: 0.1,
        rootMargin: '0px 0px -50px 0px'
    };
    
    const observer = new IntersectionObserver(function(entries) {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.style.opacity = '1';
                entry.target.style.transform = 'translateY(0)';
            }
        });
    }, observerOptions);
    
    // アニメーション対象の要素
    const animateElements = document.querySelectorAll(
        '.reveal, .svc-card, .work-tile, .work-item, .strength-card, .workflow-step, .service-detail-item, .faq-item'
    );
    
    animateElements.forEach((element, index) => {
        element.style.opacity = '0';
        element.style.transform = 'translateY(30px)';
        element.style.transition = `opacity 0.6s ease ${index * 0.1}s, transform 0.6s ease ${index * 0.1}s`;
        observer.observe(element);
    });
});

// ========================================
// フォーム入力のリアルタイムバリデーション
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    const emailInput = document.getElementById('email');
    const phoneInput = document.getElementById('phone');
    
    if (emailInput) {
        emailInput.addEventListener('blur', function() {
            const email = this.value;
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            
            if (email && !emailPattern.test(email)) {
                this.style.borderColor = '#ef4444';
                showInputError(this, '正しいメールアドレスを入力してください');
            } else {
                this.style.borderColor = '#10b981';
                hideInputError(this);
            }
        });
    }
    
    if (phoneInput) {
        phoneInput.addEventListener('input', function() {
            // 数字とハイフンのみ許可
            this.value = this.value.replace(/[^\d-]/g, '');
        });
    }
    
    function showInputError(input, message) {
        hideInputError(input);
        const errorDiv = document.createElement('div');
        errorDiv.className = 'input-error';
        errorDiv.style.color = '#ef4444';
        errorDiv.style.fontSize = '0.875rem';
        errorDiv.style.marginTop = '0.25rem';
        errorDiv.textContent = message;
        input.parentNode.appendChild(errorDiv);
    }
    
    function hideInputError(input) {
        const errorDiv = input.parentNode.querySelector('.input-error');
        if (errorDiv) {
            errorDiv.remove();
        }
    }
});

// ========================================
// ページトップへ戻るボタン（オプション）
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    // ページトップへ戻るボタンを動的に作成
    const backToTopButton = document.createElement('button');
    backToTopButton.innerHTML = '↑';
    backToTopButton.className = 'back-to-top';
    backToTopButton.style.cssText = `
        position: fixed;
        bottom: 28px;
        right: 28px;
        width: 46px;
        height: 46px;
        background-color: #0b0b0b;
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 2px;
        font-size: 1.2rem;
        line-height: 1;
        cursor: pointer;
        opacity: 0;
        transition: opacity 0.3s ease, transform 0.3s ease, background-color 0.3s ease;
        z-index: 999;
    `;
    backToTopButton.addEventListener('mouseenter', function() {
        this.style.backgroundColor = '#cc0000';
    });
    backToTopButton.addEventListener('mouseleave', function() {
        this.style.backgroundColor = '#0b0b0b';
    });
    
    document.body.appendChild(backToTopButton);
    
    // スクロール時の表示制御
    window.addEventListener('scroll', function() {
        if (window.pageYOffset > 300) {
            backToTopButton.style.opacity = '1';
            backToTopButton.style.transform = 'scale(1)';
        } else {
            backToTopButton.style.opacity = '0';
            backToTopButton.style.transform = 'scale(0.8)';
        }
    });
    
    // クリック時の動作
    backToTopButton.addEventListener('click', function() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    });
    
    // ホバー効果
    backToTopButton.addEventListener('mouseenter', function() {
        this.style.transform = 'scale(1.1)';
    });
    
    backToTopButton.addEventListener('mouseleave', function() {
        this.style.transform = 'scale(1)';
    });
});

// ========================================
// ローディング時のパフォーマンス最適化
// ========================================
document.addEventListener('DOMContentLoaded', function() {
    // 画像の遅延読み込み（Lazy Loading）
    if ('IntersectionObserver' in window) {
        const imageObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    if (img.dataset.src) {
                        img.src = img.dataset.src;
                        img.removeAttribute('data-src');
                        observer.unobserve(img);
                    }
                }
            });
        });
        
        const lazyImages = document.querySelectorAll('img[data-src]');
        lazyImages.forEach(img => imageObserver.observe(img));
    }
});

console.log('KUNI OFFICE Website - Initialized');

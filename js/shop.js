// 画像切り替え
function changeImage(element) {
    const mainImage = document.getElementById('mainImage');
    mainImage.src = element.src;
    
    // サムネイルのアクティブ状態を更新
    document.querySelectorAll('.thumbnail').forEach(thumb => {
        thumb.classList.remove('active');
    });
    element.classList.add('active');
}

// 数量の増減
function increaseQuantity() {
    const quantityInput = document.getElementById('quantity');
    let currentValue = parseInt(quantityInput.value);
    if (currentValue < 99) {
        quantityInput.value = currentValue + 1;
    }
}

function decreaseQuantity() {
    const quantityInput = document.getElementById('quantity');
    let currentValue = parseInt(quantityInput.value);
    if (currentValue > 1) {
        quantityInput.value = currentValue - 1;
    }
}

// カートに追加
function addToCart() {
    const quantity = document.getElementById('quantity').value;
    
    // 実際のECサイトでは、ここでカートAPIを呼び出すか、
    // LocalStorageにカート情報を保存します
    
    alert(`若葉のしずく ${quantity}個をカートに追加しました！\n\n※現在はデモ版のため、実際の購入はできません。\nお問い合わせフォームからご注文ください。`);
}

// 今すぐ購入
function buyNow() {
    const quantity = document.getElementById('quantity').value;
    const price = 2980;
    const total = price * parseInt(quantity);
    
    // 実際のECサイトでは、ここで決済ページに遷移します
    
    if (confirm(`若葉のしずく ${quantity}個\n合計金額: ¥${total.toLocaleString()}（税込）\n\nお問い合わせフォームから注文しますか？`)) {
        // お問い合わせフォームに商品情報を渡して遷移
        window.location.href = `contact.html?product=若葉のしずく&quantity=${quantity}&total=${total}`;
    }
}

// FAQ アコーディオン
document.addEventListener('DOMContentLoaded', function() {
    const faqItems = document.querySelectorAll('.faq-item');
    
    faqItems.forEach(item => {
        const question = item.querySelector('.faq-question');
        
        question.addEventListener('click', () => {
            // 他のFAQを閉じる
            faqItems.forEach(otherItem => {
                if (otherItem !== item) {
                    otherItem.classList.remove('active');
                }
            });
            
            // クリックされたFAQをトグル
            item.classList.toggle('active');
        });
    });
});

// 数量入力の検証
document.addEventListener('DOMContentLoaded', function() {
    const quantityInput = document.getElementById('quantity');
    
    if (quantityInput) {
        quantityInput.addEventListener('change', function() {
            let value = parseInt(this.value);
            
            if (isNaN(value) || value < 1) {
                this.value = 1;
            } else if (value > 99) {
                this.value = 99;
            }
        });
    }
});

// 定期購入申し込み
function subscribeNow() {
    const confirmMessage = `定期購入プランのお申し込み

【プラン内容】
・価格：¥2,680/月（通常価格より10% OFF）
・送料：無料（ずっと）
・お届けサイクル：毎月1回
・いつでも休止・解約OK

【年間お得額】
約6,600円（送料6,000円 + 割引600円）

お問い合わせフォームから申し込みますか？`;
    
    if (confirm(confirmMessage)) {
        // お問い合わせフォームに定期購入情報を渡して遷移
        window.location.href = `contact.html?plan=subscription&product=若葉のしずく&price=2680&note=定期購入プラン`;
    }
}

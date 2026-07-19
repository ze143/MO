// ============================================
// تقارير المخزون الرئيسي - المالك
// ============================================

class StockReportManager {
    constructor() {
        this.currentData = [];
        this.init();
    }

    async init() {
        if (!authManager.requireAuth()) return;
        if (!authManager.requireRole(ROLES.OWNER)) return;

        await this.loadData();
        await this.loadCategories();
    }

    async loadData() {
        showLoading();
        try {
            await Promise.all([
                this.loadStats(),
                this.loadWarehouseStock()
            ]);
        } catch (error) {
            console.error('خطأ في تحميل البيانات:', error);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        } finally {
            hideLoading();
        }
    }

    // ============================================
    // الإحصائيات
    // ============================================

    async loadStats() {
        try {
            // جلب جميع المنتجات والمخزون
            const stock = await supabaseRequest('warehouse_stock?select=product_id,quantity');
            const products = await supabaseRequest('products?select=id,min_stock&is_active=eq.true');

            // إجمالي المنتجات
            const totalProductsEl = document.getElementById('totalProducts');
            if (totalProductsEl) totalProductsEl.textContent = products.length;

            // إجمالي القطع
            const totalItems = stock.reduce((sum, s) => sum + s.quantity, 0);
            const totalItemsEl = document.getElementById('totalItems');
            if (totalItemsEl) totalItemsEl.textContent = totalItems;

            // المنتجات المنخفضة
            const lowStock = stock.filter(item => {
                const product = products.find(p => p.id === item.product_id);
                const minStock = product?.min_stock || 10;
                return item.quantity > 0 && item.quantity < minStock;
            });
            const lowStockEl = document.getElementById('lowStock');
            if (lowStockEl) lowStockEl.textContent = lowStock.length;

            // المنتجات النافذة
            const outOfStock = stock.filter(item => item.quantity <= 0);
            const outOfStockEl = document.getElementById('outOfStock');
            if (outOfStockEl) outOfStockEl.textContent = outOfStock.length;

        } catch (error) {
            console.error('خطأ في تحميل الإحصائيات:', error);
        }
    }

    // ============================================
    // تحميل مخزون المخزن
    // ============================================

    async loadWarehouseStock() {
        try {
            // 1. جلب مخزون المخزن
            const stock = await supabaseRequest('warehouse_stock?select=product_id,quantity');
            console.log('📦 stock:', stock);

            // 2. جلب أسماء المنتجات مع التفاصيل
            const productIds = [...new Set(stock.map(item => item.product_id).filter(id => id))];
            console.log('📦 productIds:', productIds);
            
            let productMap = {};
            if (productIds.length > 0) {
                const productQuery = productIds.map(id => `id.eq.${id}`).join(',');
                const products = await supabaseRequest(`products?select=id,name,code,category,min_stock&or=(${productQuery})`);
                console.log('📦 products from DB:', products);
                
                for (const p of products) {
                    productMap[p.id] = p;
                }
                console.log('📦 productMap:', productMap);
            }

            // 3. دمج البيانات
            this.currentData = stock.map(item => ({
                ...item,
                products: productMap[item.product_id] || { 
                    name: 'غير معروف', 
                    code: '', 
                    category: '', 
                    min_stock: 10 
                }
            }));

            this.renderTable(this.currentData);

        } catch (error) {
            console.error('خطأ في تحميل مخزون المخزن:', error);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        }
    }

    // ============================================
    // تحميل الفئات
    // ============================================

    async loadCategories() {
        try {
            const products = await supabaseRequest('products?select=category&is_active=eq.true');
            const categories = [...new Set(products.map(p => p.category).filter(c => c))];
            
            const select = document.getElementById('filterCategory');
            if (!select) {
                console.error('❌ filterCategory element not found');
                return;
            }
            
            // ✅ حفظ الخيار الافتراضي
            const defaultOption = document.createElement('option');
            defaultOption.value = 'all';
            defaultOption.textContent = 'جميع الفئات';
            select.appendChild(defaultOption);
            
            categories.forEach(cat => {
                const option = document.createElement('option');
                option.value = cat;
                option.textContent = cat;
                select.appendChild(option);
            });

            console.log('✅ تم تحميل الفئات:', categories);

        } catch (error) {
            console.error('خطأ في تحميل الفئات:', error);
        }
    }

    // ============================================
    // عرض الجدول
    // ============================================

    renderTable(stock) {
        const tbody = document.getElementById('stockTable');
        if (!tbody) {
            console.error('❌ stockTable element not found');
            return;
        }

        if (stock.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">لا توجد منتجات في المخزن</td>
                </tr>
            `;
            return;
        }

        const statusFilter = document.getElementById('filterStockStatus');
        const categoryFilter = document.getElementById('filterCategory');
        const searchInput = document.getElementById('searchStock');

        const statusValue = statusFilter ? statusFilter.value : 'all';
        const categoryValue = categoryFilter ? categoryFilter.value : 'all';
        const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';

        let filtered = stock;
        
        // فلتر الحالة
        if (statusValue !== 'all') {
            filtered = filtered.filter(item => {
                const qty = item.quantity || 0;
                const minStock = item.products?.min_stock || 10;
                switch(statusValue) {
                    case 'ok': return qty >= minStock;
                    case 'low': return qty > 0 && qty < minStock;
                    case 'out': return qty <= 0;
                    default: return true;
                }
            });
        }

        // فلتر الفئة
        if (categoryValue !== 'all') {
            filtered = filtered.filter(item => item.products?.category === categoryValue);
        }

        // فلتر البحث
        if (searchTerm) {
            filtered = filtered.filter(item => {
                const product = item.products || {};
                return (product.name || '').toLowerCase().includes(searchTerm) ||
                       (product.code || '').toLowerCase().includes(searchTerm);
            });
        }

        tbody.innerHTML = filtered.map((item, index) => {
            const product = item.products || {};
            const qty = item.quantity || 0;
            let status = 'متوفر';
            let statusClass = 'success';
            const minStock = product.min_stock || 10;
            
            if (qty <= 0) {
                status = 'نفذ';
                statusClass = 'danger';
            } else if (qty < minStock) {
                status = 'منخفض';
                statusClass = 'warning';
            }

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${product.name || 'غير معروف'}</strong></td>
                    <td>${product.code || '-'}</td>
                    <td>${product.category || '-'}</td>
                    <td>${qty}</td>
                    <td>${minStock}</td>
                    <td>
                        <span class="badge bg-${statusClass}">${status}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // ============================================
    // بحث
    // ============================================

    searchStock() {
        this.renderTable(this.currentData);
    }

    // ============================================
    // تحديث
    // ============================================

    refreshData() {
        this.loadData();
        showToast('تم تحديث البيانات', 'info');
    }
}

// ============================================
// دوال مساعدة
// ============================================

let stockReportManager;

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('show');
    overlay.classList.toggle('show');
}

function handleLogout() {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        authManager.logout();
    }
}

function searchStock() {
    if (stockReportManager) stockReportManager.searchStock();
}

function refreshData() {
    if (stockReportManager) stockReportManager.refreshData();
}

document.addEventListener('DOMContentLoaded', () => {
    stockReportManager = new StockReportManager();
});
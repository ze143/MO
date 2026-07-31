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
            // 1. جلب جميع المنتجات النشطة
            const allProducts = await supabaseRequest('products?select=id,min_stock&is_active=eq.true');
            const totalProducts = allProducts.length;
            
            // 2. جلب المخزون
            const stock = await supabaseRequest('warehouse_stock?select=product_id,quantity');
            const stockMap = {};
            stock.forEach(item => {
                stockMap[item.product_id] = item.quantity;
            });
            
            // 3. حساب الإحصائيات
            let totalItems = 0;
            let lowStockCount = 0;
            let outOfStockCount = 0;
            
            allProducts.forEach(product => {
                const qty = stockMap[product.id] || 0;
                const minStock = product.min_stock || 10;
                
                totalItems += qty;
                
                if (qty <= 0) {
                    outOfStockCount++;
                } else if (qty < minStock) {
                    lowStockCount++;
                }
            });
            
            // 4. عرض في الواجهة
            document.getElementById('totalProducts').textContent = totalProducts;
            document.getElementById('totalItems').textContent = totalItems;
            document.getElementById('lowStock').textContent = lowStockCount;
            document.getElementById('outOfStock').textContent = outOfStockCount;

        } catch (error) {
            console.error('خطأ في تحميل الإحصائيات:', error);
        }
    }

    // ============================================
    // تحميل مخزون المخزن
    // ============================================

    async loadWarehouseStock() {
        try {
            console.log('🔄 loadWarehouseStock بدأت');
            
            // 1. جلب جميع المنتجات النشطة
            const allProducts = await supabaseRequest(`
                products?select=id,name,code,category,min_stock&is_active=eq.true&order=name.asc
            `);
            console.log('📦 allProducts:', allProducts.length);
            
            // 2. جلب مخزون المخزن
            const stock = await supabaseRequest('warehouse_stock?select=product_id,quantity');
            console.log('📦 stock:', stock.length);
            
            // 3. عمل Map للمخزون
            const stockMap = {};
            stock.forEach(item => {
                stockMap[item.product_id] = item.quantity;
            });
            
            // 4. دمج البيانات
            this.currentData = allProducts.map(product => {
                const quantity = stockMap[product.id] || 0;
                return {
                    product_id: product.id,
                    quantity: quantity,
                    products: {
                        name: product.name,
                        code: product.code || '',
                        category: product.category || '',
                        min_stock: product.min_stock || 10
                    }
                };
            });

            console.log('📦 currentData:', this.currentData.length);
            
            // 5. عرض في الجدول
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
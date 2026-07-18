// ============================================
// تقارير المخزون - المالك
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
        await this.loadBranches();
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

    async loadBranches() {
        try {
            const response = await supabaseRequest('branches?select=id,name&is_active=eq.true&order=name.asc');
            const select = document.getElementById('stockBranch');
            
            response.forEach(branch => {
                const option = document.createElement('option');
                option.value = branch.id;
                option.textContent = branch.name;
                select.appendChild(option);
            });

        } catch (error) {
            console.error('خطأ في تحميل الفروع:', error);
        }
    }

    async loadStats() {
        try {
            const warehouse = await supabaseRequest('warehouse_stock?select=quantity');
            const totalWarehouse = warehouse.reduce((sum, w) => sum + w.quantity, 0);
            document.getElementById('totalWarehouse').textContent = totalWarehouse;

            const branches = await supabaseRequest('branch_stock?select=quantity');
            const totalBranches = branches.reduce((sum, b) => sum + b.quantity, 0);
            document.getElementById('totalBranchesStock').textContent = totalBranches;

            document.getElementById('totalOverall').textContent = totalWarehouse + totalBranches;

            const products = await supabaseRequest('products?select=id&is_active=eq.true');
            document.getElementById('totalProducts').textContent = products.length;

        } catch (error) {
            console.error('خطأ في تحميل الإحصائيات:', error);
        }
    }

    async loadWarehouseStock() {
        try {
            const stock = await supabaseRequest('warehouse_stock?select=product_id,quantity');
            
            const productIds = [...new Set(stock.map(item => item.product_id).filter(id => id))];
            let products = [];
            if (productIds.length > 0) {
                const productQuery = productIds.map(id => `id=eq.${id}`).join('&');
                products = await supabaseRequest(`products?select=id,name,code,category,min_stock&${productQuery}`);
            }
            
            const productMap = {};
            products.forEach(p => productMap[p.id] = p);
            
            this.currentData = stock.map(item => ({
                ...item,
                products: productMap[item.product_id] || { name: 'غير معروف', code: '', category: '', min_stock: 10 },
                source: 'warehouse'
            }));

            this.renderTable(this.currentData);

        } catch (error) {
            console.error('خطأ في تحميل مخزون المخزن:', error);
        }
    }

    async loadBranchStock() {
        const branchId = document.getElementById('stockBranch').value;
        
        if (branchId === 'warehouse') {
            await this.loadWarehouseStock();
            return;
        }

        showLoading();

        try {
            const stock = await supabaseRequest(`
                branch_stock?select=product_id,quantity&branch_id=eq.${branchId}
            `);

            const productIds = [...new Set(stock.map(item => item.product_id).filter(id => id))];
            let products = [];
            if (productIds.length > 0) {
                const productQuery = productIds.map(id => `id=eq.${id}`).join('&');
                products = await supabaseRequest(`products?select=id,name,code,category,min_stock&${productQuery}`);
            }
            
            const productMap = {};
            products.forEach(p => productMap[p.id] = p);
            
            this.currentData = stock.map(item => ({
                ...item,
                products: productMap[item.product_id] || { name: 'غير معروف', code: '', category: '', min_stock: 10 },
                source: 'branch'
            }));

            this.renderTable(this.currentData);

        } catch (error) {
            console.error('خطأ في تحميل مخزون الفرع:', error);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        } finally {
            hideLoading();
        }
    }

    renderTable(stock) {
        const tbody = document.getElementById('stockTable');
        if (stock.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">لا توجد منتجات في هذا المخزن</td>
                </tr>
            `;
            return;
        }

        const statusFilter = document.getElementById('filterStockStatus').value;
        let filtered = stock;
        
        if (statusFilter !== 'all') {
            filtered = stock.filter(item => {
                const qty = item.quantity || 0;
                const minStock = item.products?.min_stock || 10;
                switch(statusFilter) {
                    case 'ok': return qty >= minStock;
                    case 'low': return qty > 0 && qty < minStock;
                    case 'out': return qty <= 0;
                    default: return true;
                }
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
                    <td>
                        <span class="badge bg-${statusClass}">${status}</span>
                    </td>
                </tr>
            `;
        }).join('');
    }

    searchStock() {
        const searchTerm = document.getElementById('searchStock').value.toLowerCase();
        
        let filtered = this.currentData;

        if (searchTerm) {
            filtered = filtered.filter(item => {
                const product = item.products || {};
                return (product.name || '').toLowerCase().includes(searchTerm) ||
                       (product.code || '').toLowerCase().includes(searchTerm);
            });
        }

        this.renderTable(filtered);
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

function loadBranchStock() {
    if (stockReportManager) stockReportManager.loadBranchStock();
}

function searchStock() {
    if (stockReportManager) stockReportManager.searchStock();
}

document.addEventListener('DOMContentLoaded', () => {
    stockReportManager = new StockReportManager();
});
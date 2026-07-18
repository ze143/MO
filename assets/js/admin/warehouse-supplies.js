// ============================================
// توريدات المخزن
// ============================================

class WarehouseSuppliesManager {
    constructor() {
        this.allSupplies = [];
        this.supplyModal = null;
        this.init();
    }

    async init() {
        if (!authManager.requireAuth()) return;
        if (!authManager.requireRole(ROLES.ADMIN)) return;

        this.supplyModal = new bootstrap.Modal(document.getElementById('supplyModal'));
        
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('supplyDate').value = today;

        await this.loadData();
        await this.loadProducts();
    }

    async loadData() {
        showLoading();
        try {
            await Promise.all([
                this.loadSupplies(),
                this.loadStats()
            ]);
        } catch (error) {
            console.error('خطأ في تحميل البيانات:', error);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        } finally {
            hideLoading();
        }
    }

    async loadSupplies() {
        try {
            const response = await supabaseRequest(`
                warehouse_supplies?select=*,products(name)&order=created_at.desc
            `);

            this.allSupplies = response;
            this.renderTable(response);

        } catch (error) {
            console.error('خطأ في تحميل التوريدات:', error);
        }
    }

    renderTable(supplies) {
        const tbody = document.getElementById('suppliesTable');
        if (supplies.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">لا توجد توريدات مسجلة</td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = supplies.map((supply, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${supply.products?.name || 'غير معروف'}</td>
                <td><strong>${supply.quantity}</strong></td>
                <td>${new Date(supply.supply_date).toLocaleDateString('ar-EG')}</td>
                <td>${supply.notes || '-'}</td>
            </tr>
        `).join('');
    }

    async loadStats() {
        try {
            const response = await supabaseRequest('warehouse_supplies?select=id,quantity');
            
            document.getElementById('totalSupplies').textContent = response.length;
            const totalItems = response.reduce((sum, s) => sum + s.quantity, 0);
            document.getElementById('totalItems').textContent = totalItems;

        } catch (error) {
            console.error('خطأ في تحميل الإحصائيات:', error);
        }
    }

    async loadProducts() {
        try {
            const response = await supabaseRequest('products?select=id,name&is_active=eq.true&order=name.asc');
            const select = document.getElementById('supplyProduct');
            
            response.forEach(product => {
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = product.name;
                select.appendChild(option);
            });

            // تحميل فلاتر المنتجات
            const filterSelect = document.getElementById('filterProduct');
            response.forEach(product => {
                const option = document.createElement('option');
                option.value = product.id;
                option.textContent = product.name;
                filterSelect.appendChild(option);
            });

        } catch (error) {
            console.error('خطأ في تحميل المنتجات:', error);
        }
    }

    showAddSupply() {
        document.getElementById('supplyForm').reset();
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('supplyDate').value = today;
        this.supplyModal.show();
    }

    async saveSupply() {
        const productId = document.getElementById('supplyProduct').value;
        const quantity = parseInt(document.getElementById('supplyQuantity').value);
        const supplyDate = document.getElementById('supplyDate').value;
        const notes = document.getElementById('supplyNotes').value.trim();

        if (!productId || !quantity || quantity < 1) {
            showToast('يرجى اختيار المنتج وإدخال الكمية', 'warning');
            return;
        }

        showLoading();

        try {
            // 1. إضافة توريد المخزن
            const supplyData = {
                product_id: productId,
                quantity: quantity,
                supply_date: supplyDate,
                notes: notes
            };

            await supabaseRequest('warehouse_supplies', {
                method: 'POST',
                body: JSON.stringify(supplyData)
            });

            // 2. تحديث مخزون المخزن
            const stockResponse = await supabaseRequest(`warehouse_stock?product_id=eq.${productId}`);
            
            if (stockResponse.length > 0) {
                await supabaseRequest(`warehouse_stock?product_id=eq.${productId}`, {
                    method: 'PATCH',
                    body: JSON.stringify({
                        quantity: stockResponse[0].quantity + quantity
                    })
                });
            } else {
                await supabaseRequest('warehouse_stock', {
                    method: 'POST',
                    body: JSON.stringify({
                        product_id: productId,
                        quantity: quantity
                    })
                });
            }

            showToast('تم إضافة التوريد بنجاح', 'success');
            this.supplyModal.hide();
            await this.loadData();

        } catch (error) {
            console.error('خطأ في حفظ التوريد:', error);
            showToast(`حدث خطأ: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    }

    async applyFilters() {
        showLoading();
        try {
            const dateFrom = document.getElementById('filterDateFrom').value;
            const dateTo = document.getElementById('filterDateTo').value;
            const productId = document.getElementById('filterProduct').value;

            let filtered = this.allSupplies;

            if (dateFrom) {
                filtered = filtered.filter(s => s.supply_date >= dateFrom);
            }
            if (dateTo) {
                filtered = filtered.filter(s => s.supply_date <= dateTo);
            }
            if (productId !== 'all') {
                filtered = filtered.filter(s => s.product_id === productId);
            }

            this.renderTable(filtered);
            showToast('تم تطبيق الفلتر', 'success');

        } catch (error) {
            console.error('خطأ في تطبيق الفلتر:', error);
            showToast('حدث خطأ', 'error');
        } finally {
            hideLoading();
        }
    }
}

// ============================================
// دوال مساعدة
// ============================================

let suppliesManager;

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

function showAddSupplyModal() {
    if (suppliesManager) suppliesManager.showAddSupply();
}

function saveSupply() {
    if (suppliesManager) suppliesManager.saveSupply();
}

function applyFilters() {
    if (suppliesManager) suppliesManager.applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
    suppliesManager = new WarehouseSuppliesManager();
});
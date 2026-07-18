// ============================================
// تقارير الفروع - المالك
// ============================================

class BranchesReportManager {
    constructor() {
        this.init();
    }

    async init() {
        if (!authManager.requireAuth()) return;
        if (!authManager.requireRole(ROLES.OWNER)) return;

        await this.loadBranchesReport();
    }

    async loadBranchesReport() {
        showLoading();
        try {
            // 1. جلب الفروع
            const branches = await supabaseRequest('branches?select=id,name,code,address,phone,manager_name,is_active&order=name.asc');
            
            // 2. جلب المنتجات
            const products = await supabaseRequest('products?select=id,name,code&is_active=eq.true&order=name.asc');
            const productMap = {};
            products.forEach(p => productMap[p.id] = p);
            
            // 3. جلب مخزون الفروع
            const allStock = await supabaseRequest('branch_stock?select=branch_id,product_id,quantity');
            
            if (branches.length === 0) {
                document.getElementById('branchesContainer').innerHTML = `
                    <div class="col-12 text-center text-muted py-5">
                        <i class="fas fa-store fa-3x mb-3 d-block"></i>
                        لا توجد فروع مسجلة
                    </div>
                `;
                hideLoading();
                return;
            }

            const container = document.getElementById('branchesContainer');
            let html = '<div class="row g-4">';

            for (const branch of branches) {
                // مخزون الفرع
                const branchStock = allStock.filter(s => s.branch_id === branch.id);
                const totalStock = branchStock.reduce((sum, s) => sum + s.quantity, 0);
                const productCount = branchStock.filter(s => s.quantity > 0).length;
                
                // المنتجات مع الكميات
                const productsWithStock = branchStock.map(item => ({
                    ...item,
                    product: productMap[item.product_id] || { name: 'غير معروف', code: '' }
                })).sort((a, b) => b.quantity - a.quantity);

                // حالة المخزون
                const status = totalStock === 0 ? 'out' : 
                              totalStock < 20 ? 'low' : 'ok';
                const statusLabels = {
                    ok: { text: 'متوفر', class: 'bg-success' },
                    low: { text: 'منخفض', class: 'badge-low' },
                    out: { text: 'نفذ', class: 'badge-out' }
                };

                html += `
                    <div class="col-md-6 col-lg-4">
                        <div class="branch-stock-card card h-100">
                            <div class="branch-header">
                                <div>
                                    <h5 class="card-title" style="color: var(--primary-color);">
                                        ${branch.name}
                                    </h5>
                                    <span class="badge bg-secondary">${branch.code}</span>
                                    <span class="badge ${statusLabels[status].class} ms-2">${statusLabels[status].text}</span>
                                </div>
                                <div>
                                    <span class="badge bg-primary">${productCount} منتج</span>
                                </div>
                            </div>
                            <div class="card-body">
                                <!-- ✅ عرض المخزون فقط في الأعلى -->
                                <div class="text-center mb-3">
                                    <div class="stat-number" style="font-size: 28px; color: var(--primary-color);">${totalStock}</div>
                                    <small class="text-muted">إجمالي المخزون (قطعة)</small>
                                </div>
                                <hr>
                                <div class="text-muted" style="font-size: 13px;">
                                    <div><i class="fas fa-user"></i> المدير: ${branch.manager_name || '-'}</div>
                                    <div><i class="fas fa-phone"></i> ${branch.phone || '-'}</div>
                                    <div><i class="fas fa-map-marker-alt"></i> ${branch.address || '-'}</div>
                                </div>
                                <div class="mt-3">
                                    <button class="btn-view-products w-100" onclick="toggleBranchProducts('${branch.id}')">
                                        <i class="fas fa-eye" id="branchIcon_${branch.id}"></i>
                                        <span id="branchText_${branch.id}">عرض المنتجات (${productsWithStock.length})</span>
                                    </button>
                                </div>
                                <div class="products-collapse mt-3" id="branchProducts_${branch.id}">
                                    ${productsWithStock.length === 0 ? `
                                        <div class="text-muted text-center py-2">لا توجد منتجات في هذا الفرع</div>
                                    ` : productsWithStock.map(item => {
                                        const qty = item.quantity;
                                        const statusClass = qty === 0 ? 'badge-out' : 
                                                           qty < 5 ? 'badge-low' : 'badge-ok';
                                        const statusText = qty === 0 ? 'نفذ' : 
                                                          qty < 5 ? 'منخفض' : 'متوفر';
                                        return `
                                            <div class="product-item">
                                                <span class="name">
                                                    ${item.product?.name || 'غير معروف'}
                                                    <small class="text-muted ms-2">${item.product?.code || ''}</small>
                                                    <span class="badge ${statusClass} ms-2">${statusText}</span>
                                                </span>
                                                <span class="qty">${qty}</span>
                                            </div>
                                        `;
                                    }).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }

            html += '</div>';
            container.innerHTML = html;

        } catch (error) {
            console.error('خطأ في تحميل تقارير الفروع:', error);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        } finally {
            hideLoading();
        }
    }

    toggleBranchProducts(branchId) {
        const productsDiv = document.getElementById(`branchProducts_${branchId}`);
        const icon = document.getElementById(`branchIcon_${branchId}`);
        const text = document.getElementById(`branchText_${branchId}`);

        if (!productsDiv) return;

        if (productsDiv.classList.contains('show')) {
            productsDiv.classList.remove('show');
            if (icon) icon.className = 'fas fa-eye';
            if (text) text.textContent = text.textContent.replace('إخفاء', 'عرض');
        } else {
            productsDiv.classList.add('show');
            if (icon) icon.className = 'fas fa-eye-slash';
            if (text) text.textContent = text.textContent.replace('عرض', 'إخفاء');
        }
    }
}

// ============================================
// دوال مساعدة
// ============================================

let branchesReportManager;

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

function toggleBranchProducts(branchId) {
    if (branchesReportManager) branchesReportManager.toggleBranchProducts(branchId);
}

document.addEventListener('DOMContentLoaded', () => {
    branchesReportManager = new BranchesReportManager();
});
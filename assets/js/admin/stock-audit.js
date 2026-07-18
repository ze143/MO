// ============================================
// سجل التعديلات
// ============================================

class StockAuditManager {
    constructor() {
        this.allAudits = [];
        this.init();
    }

    async init() {
        if (!authManager.requireAuth()) return;
        if (!authManager.requireRole(ROLES.ADMIN)) return;

        await this.loadAudits();
    }

    async loadAudits() {
        showLoading();
        try {
            const response = await supabaseRequest(`
                audit_log?select=*,user:performed_by(full_name)&order=performed_at.desc&limit=100
            `);

            this.allAudits = response;
            this.renderTable(response);

        } catch (error) {
            console.error('خطأ في تحميل سجل التعديلات:', error);
            showToast('حدث خطأ في تحميل البيانات', 'error');
        } finally {
            hideLoading();
        }
    }

    renderTable(audits) {
        const tbody = document.getElementById('auditTable');
        if (audits.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted">لا توجد تعديلات مسجلة</td>
                </tr>
            `;
            return;
        }

        const actionLabels = {
            INSERT: 'إضافة',
            UPDATE: 'تعديل',
            DELETE: 'حذف'
        };

        const actionColors = {
            INSERT: 'success',
            UPDATE: 'warning',
            DELETE: 'danger'
        };

        const tableLabels = {
            branches: 'الفروع',
            products: 'المنتجات',
            suppliers: 'الموردين',
            branch_stock: 'مخزون الفروع',
            warehouse_stock: 'مخزون المخزن'
        };

        tbody.innerHTML = audits.map((audit, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${tableLabels[audit.table_name] || audit.table_name}</td>
                <td>
                    <span class="badge bg-${actionColors[audit.action]}">
                        ${actionLabels[audit.action] || audit.action}
                    </span>
                </td>
                <td style="max-width: 150px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${audit.old_data ? JSON.stringify(audit.old_data) : '-'}
                </td>
                <td style="max-width: 150px; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                    ${audit.new_data ? JSON.stringify(audit.new_data) : '-'}
                </td>
                <td>${audit.user?.full_name || 'غير معروف'}</td>
                <td>${new Date(audit.performed_at).toLocaleString('ar-EG')}</td>
            </tr>
        `).join('');
    }

    async applyFilters() {
        showLoading();
        try {
            const dateFrom = document.getElementById('filterDateFrom').value;
            const dateTo = document.getElementById('filterDateTo').value;
            const tableName = document.getElementById('filterTable').value;
            const action = document.getElementById('filterAction').value;

            let filtered = this.allAudits;

            if (dateFrom) {
                filtered = filtered.filter(a => a.performed_at >= dateFrom);
            }
            if (dateTo) {
                filtered = filtered.filter(a => a.performed_at <= dateTo);
            }
            if (tableName !== 'all') {
                filtered = filtered.filter(a => a.table_name === tableName);
            }
            if (action !== 'all') {
                filtered = filtered.filter(a => a.action === action);
            }

            this.renderTable(filtered);
            showToast('تم تطبيق الفلتر بنجاح', 'success');

        } catch (error) {
            console.error('خطأ في تطبيق الفلتر:', error);
            showToast('حدث خطأ في تطبيق الفلتر', 'error');
        } finally {
            hideLoading();
        }
    }

    resetFilters() {
        document.getElementById('filterDateFrom').value = '';
        document.getElementById('filterDateTo').value = '';
        document.getElementById('filterTable').value = 'all';
        document.getElementById('filterAction').value = 'all';
        this.renderTable(this.allAudits);
        showToast('تم إعادة تعيين الفلاتر', 'info');
    }
}

// ============================================
// دوال مساعدة
// ============================================

let auditManager;

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

function applyFilters() {
    if (auditManager) auditManager.applyFilters();
}

function resetFilters() {
    if (auditManager) auditManager.resetFilters();
}

document.addEventListener('DOMContentLoaded', () => {
    auditManager = new StockAuditManager();
});
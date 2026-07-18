// ============================================
// تكوين Supabase
// ============================================

const SUPABASE_CONFIG = {
    URL: 'https://lxolskydwrnkefanzamv.supabase.co/rest/v1/',
    ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4b2xza3lkd3Jua2VmYW56YW12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTg5ODUsImV4cCI6MjA5OTg3NDk4NX0.0T4Ltlg0qFRrVqSYXnAVcpcsR00hvqMlUMNmeE44qXg'
};

// ============================================
// أدوار المستخدمين
// ============================================

const ROLES = {
    ADMIN: 'admin',
    BRANCH_USER: 'branch_user',
    OWNER: 'owner'
};

// ============================================
// أنواع التحويلات
// ============================================

const TRANSFER_TYPES = {
    SUPPLY: 'supply',           // توريد من المخزن للفرع
    TRANSFER: 'transfer',       // تحويل بين الفروع
    RETURN: 'return',           // مرتجع للمخزن
    CUSTOMER_RETURN: 'customer_return', // مرتجع من عميل
    EXCHANGE: 'exchange'        // استبدال
};

// ============================================
// مسارات الصفحات
// ============================================

const PAGES = {
    LOGIN: '/pages/login.html',
    ADMIN_DASHBOARD: '/pages/admin/dashboard.html',
    ADMIN_BRANCHES: '/pages/admin/branches.html',
    ADMIN_PRODUCTS: '/pages/admin/products.html',
    ADMIN_WAREHOUSE: '/pages/admin/warehouse.html',
    ADMIN_TRANSFERS: '/pages/admin/branch-transfers.html',
    ADMIN_DAY_CLOSING: '/pages/admin/day-closing.html',
    ADMIN_CLOSING_REPORTS: '/pages/admin/day-closing-reports.html',
    ADMIN_INVENTORY: '/pages/admin/inventory.html',
    ADMIN_INVENTORY_REPORTS: '/pages/admin/inventory-reports.html',
    ADMIN_STOCK_AUDIT: '/pages/admin/stock-audit.html',
    BRANCH_DASHBOARD: '/pages/branch/dashboard.html',
    OWNER_DASHBOARD: '/pages/owner/dashboard.html',
    OWNER_BRANCHES: '/pages/owner/branches-report.html',
    OWNER_SALES: '/pages/owner/sales-report.html',
    OWNER_STOCK: '/pages/owner/stock-report.html'
};
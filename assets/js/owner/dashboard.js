// ============================================
// لوحة تحكم المالك - نسخة مصلحة
// ============================================

class OwnerDashboard {
  constructor() {
    this.charts = {};
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.OWNER)) return;

    const profile = authManager.getCurrentProfile();
    document.getElementById("welcomeMessage").textContent =
      `مرحباً ${profile.full_name}`;

    this.updateTime();
    setInterval(() => this.updateTime(), 1000);

    await this.loadData();
    setInterval(() => this.loadData(), 60000);
  }

  updateTime() {
    const now = new Date();
    const timeStr = now.toLocaleString("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    document.getElementById("currentTime").textContent = timeStr;
  }

  async loadData() {
    showLoading();
    try {
      await Promise.all([
        this.loadStats(),
        this.loadBranchesChart(),
        this.loadProductsChart(),
        this.loadRecentSales(),
      ]);
    } catch (error) {
      console.error("خطأ في تحميل البيانات:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  async loadStats() {
    try {
      // إجمالي المبيعات
      const salesResponse = await supabaseRequest(
        "daily_sales?select=quantity",
      );
      const totalSales = salesResponse.reduce((sum, s) => sum + s.quantity, 0);
      document.getElementById("totalSales").textContent = totalSales;

      // عدد الفروع
      const branchesResponse = await supabaseRequest(
        "branches?select=id&is_active=eq.true",
      );
      document.getElementById("totalBranches").textContent =
        branchesResponse.length;

      // عدد المنتجات
      const productsResponse = await supabaseRequest(
        "products?select=id&is_active=eq.true",
      );
      document.getElementById("totalProducts").textContent =
        productsResponse.length;

      // مبيعات اليوم
      const today = new Date().toISOString().split("T")[0];
      const todaySalesResponse = await supabaseRequest(
        `daily_sales?select=quantity&sale_date=eq.${today}`,
      );
      const todaySales = todaySalesResponse.reduce(
        (sum, s) => sum + s.quantity,
        0,
      );
      document.getElementById("todaySales").textContent = todaySales;
    } catch (error) {
      console.error("خطأ في تحميل الإحصائيات:", error);
    }
  }

  async loadBranchesChart() {
    try {
      // 1. جلب المبيعات
      const sales = await supabaseRequest(
        "daily_sales?select=branch_id,quantity",
      );

      // 2. جلب أسماء الفروع
      const branchIds = [
        ...new Set(sales.map((s) => s.branch_id).filter((id) => id)),
      ];
      let branchMap = {};
      if (branchIds.length > 0) {
        const branchQuery = branchIds.map((id) => `id=eq.${id}`).join("&");
        const branches = await supabaseRequest(
          `branches?select=id,name&${branchQuery}`,
        );
        branchMap = {};
        branches.forEach((b) => (branchMap[b.id] = b));
      }

      // 3. دمج البيانات
      const branchSales = {};
      sales.forEach((item) => {
        const name = branchMap[item.branch_id]?.name || "غير معروف";
        branchSales[name] = (branchSales[name] || 0) + item.quantity;
      });

      const labels = Object.keys(branchSales);
      const data = Object.values(branchSales);

      if (this.charts.branches) {
        this.charts.branches.destroy();
        this.charts.branches = null;
      }

      const ctx = document.getElementById("branchesChart")?.getContext("2d");
      if (!ctx) return;

      this.charts.branches = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "المبيعات (قطعة)",
              data: data,
              backgroundColor: "rgba(212, 165, 116, 0.8)",
              borderColor: "rgba(212, 165, 116, 1)",
              borderWidth: 2,
              borderRadius: 8,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              display: false,
            },
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1,
              },
            },
          },
        },
      });
    } catch (error) {
      console.error("خطأ في تحميل مخطط الفروع:", error);
    }
  }

  async loadProductsChart() {
    try {
      // 1. جلب المبيعات
      const sales = await supabaseRequest(
        "daily_sales?select=product_id,quantity",
      );

      // 2. جلب أسماء المنتجات
      const productIds = [
        ...new Set(sales.map((s) => s.product_id).filter((id) => id)),
      ];
      let productMap = {};
      if (productIds.length > 0) {
        const productQuery = productIds.map((id) => `id=eq.${id}`).join("&");
        const products = await supabaseRequest(
          `products?select=id,name&${productQuery}`,
        );
        productMap = {};
        products.forEach((p) => (productMap[p.id] = p));
      }

      // 3. دمج البيانات
      const productSales = {};
      sales.forEach((item) => {
        const name = productMap[item.product_id]?.name || "غير معروف";
        productSales[name] = (productSales[name] || 0) + item.quantity;
      });

      const sorted = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const labels = sorted.map((item) => item[0]);
      const data = sorted.map((item) => item[1]);

      if (this.charts.products) {
        this.charts.products.destroy();
        this.charts.products = null;
      }

      const ctx = document.getElementById("productsChart")?.getContext("2d");
      if (!ctx) return;

      this.charts.products = new Chart(ctx, {
        type: "pie",
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor: [
                "#D4A574",
                "#8B1A1A",
                "#C49A6A",
                "#5C1212",
                "#E8C9A0",
                "#6B2D2D",
                "#D4B896",
                "#4A1A1A",
                "#8B6B4A",
                "#3A0A0A",
              ],
              borderWidth: 2,
            },
          ],
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: "bottom",
              labels: {
                font: {
                  size: 12,
                },
              },
            },
          },
        },
      });
    } catch (error) {
      console.error("خطأ في تحميل مخطط المنتجات:", error);
    }
  }

  async loadRecentSales() {
    try {
      // 1. جلب المبيعات
      const sales = await supabaseRequest(`
            daily_sales?select=id,branch_id,product_id,quantity,sale_date,is_closed&order=created_at.desc&limit=20
        `);

      // 2. جلب أسماء الفروع
      const branchIds = [
        ...new Set(sales.map((s) => s.branch_id).filter((id) => id)),
      ];
      let branchMap = {};
      if (branchIds.length > 0) {
        const branchQuery = branchIds.map((id) => `id=eq.${id}`).join("&");
        const branches = await supabaseRequest(
          `branches?select=id,name&${branchQuery}`,
        );
        branchMap = {};
        branches.forEach((b) => (branchMap[b.id] = b));
      }

      // 3. جلب أسماء المنتجات
      const productIds = [
        ...new Set(sales.map((s) => s.product_id).filter((id) => id)),
      ];
      let productMap = {};
      if (productIds.length > 0) {
        const productQuery = productIds.map((id) => `id=eq.${id}`).join("&");
        const products = await supabaseRequest(
          `products?select=id,name&${productQuery}`,
        );
        productMap = {};
        products.forEach((p) => (productMap[p.id] = p));
      }

      // 4. دمج البيانات
      const salesWithNames = sales.map((sale) => ({
        ...sale,
        branch_name: branchMap[sale.branch_id]?.name || "غير معروف",
        product_name: productMap[sale.product_id]?.name || "غير معروف",
      }));

      const tbody = document.getElementById("recentSalesTable");
      if (salesWithNames.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">لا توجد مبيعات مسجلة</td>
                </tr>
            `;
        return;
      }

      tbody.innerHTML = salesWithNames
        .map(
          (sale, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${sale.branch_name}</td>
                <td>${sale.product_name}</td>
                <td>${sale.quantity}</td>
                <td>${new Date(sale.sale_date).toLocaleDateString("ar-EG")}</td>
                <td>
                    <span class="badge-status ${sale.is_closed ? "closed" : "open"}">
                        ${sale.is_closed ? "مقفلة" : "مفتوحة"}
                    </span>
                </td>
            </tr>
        `,
        )
        .join("");
    } catch (error) {
      console.error("خطأ في تحميل المبيعات الأخيرة:", error);
    }
  }
}

// ============================================
// دوال مساعدة
// ============================================

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  sidebar.classList.toggle("show");
  overlay.classList.toggle("show");
}

function handleLogout() {
  if (confirm("هل أنت متأكد من تسجيل الخروج؟")) {
    authManager.logout();
  }
}

document.addEventListener("DOMContentLoaded", () => {
  window._ownerDashboard = new OwnerDashboard();
});

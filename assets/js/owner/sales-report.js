// ============================================
// تقارير المبيعات - المالك (نسخة مصلحة)
// ============================================

class SalesReportManager {
  constructor() {
    this.salesData = [];
    this.chart = null;
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.OWNER)) return;

    const today = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    document.getElementById("filterDateFrom").value = lastMonth
      .toISOString()
      .split("T")[0];
    document.getElementById("filterDateTo").value = today
      .toISOString()
      .split("T")[0];

    await this.loadData();
    await this.loadFilters();
  }

  async loadData() {
    showLoading();
    try {
      await this.loadSales();
      await this.loadStats();
    } catch (error) {
      console.error("خطأ في تحميل البيانات:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  async loadSales() {
    try {
      const dateFrom = document.getElementById("filterDateFrom").value;
      const dateTo = document.getElementById("filterDateTo").value;
      const branchId = document.getElementById("filterBranch").value;

      // 1. جلب المبيعات
      let query =
        "daily_sales?select=id,branch_id,product_id,quantity,sale_date,is_closed&order=sale_date.desc";
      const filters = [];

      if (dateFrom) filters.push(`sale_date=gte.${dateFrom}`);
      if (dateTo) filters.push(`sale_date=lte.${dateTo}`);
      if (branchId !== "all") filters.push(`branch_id=eq.${branchId}`);

      if (filters.length > 0) {
        query += `&${filters.join("&")}`;
      }

      const sales = await supabaseRequest(query);

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
      this.salesData = sales.map((sale) => ({
        ...sale,
        branches: branchMap[sale.branch_id] || { name: "غير معروف" },
        products: productMap[sale.product_id] || { name: "غير معروف" },
      }));

      this.renderTable(this.salesData);
      this.renderChart(this.salesData);
    } catch (error) {
      console.error("خطأ في تحميل المبيعات:", error);
    }
  }

  renderTable(sales) {
    const tbody = document.getElementById("salesTable");
    if (sales.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">لا توجد مبيعات في هذه الفترة</td>
                </tr>
            `;
      return;
    }

    tbody.innerHTML = sales
      .map(
        (sale, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${sale.branches?.name || "غير معروف"}</td>
                <td>${sale.products?.name || "غير معروف"}</td>
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
  }

  renderChart(sales) {
    // تجميع المبيعات حسب الفرع
    const branchSales = {};
    sales.forEach((sale) => {
      const name = sale.branches?.name || "غير معروف";
      branchSales[name] = (branchSales[name] || 0) + sale.quantity;
    });

    const labels = Object.keys(branchSales);
    const data = Object.values(branchSales);

    if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }

    const ctx = document.getElementById("salesChart")?.getContext("2d");
    if (!ctx) return;

    this.chart = new Chart(ctx, {
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
  }

  // ✅ إصلاح loadStats (بدون JOIN)
  async loadStats() {
    try {
      const dateFrom = document.getElementById("filterDateFrom").value;
      const dateTo = document.getElementById("filterDateTo").value;
      const branchId = document.getElementById("filterBranch").value;

      // 1. جلب المبيعات
      let query = "daily_sales?select=quantity,product_id,sale_date";
      const filters = [];

      if (dateFrom) filters.push(`sale_date=gte.${dateFrom}`);
      if (dateTo) filters.push(`sale_date=lte.${dateTo}`);
      if (branchId !== "all") filters.push(`branch_id=eq.${branchId}`);

      if (filters.length > 0) {
        query += `&${filters.join("&")}`;
      }

      const sales = await supabaseRequest(query);

      // 2. جلب أسماء المنتجات للإحصائيات
      const productIds = [
        ...new Set(sales.map((s) => s.product_id).filter((id) => id)),
      ];
      let products = [];
      if (productIds.length > 0) {
        const productQuery = productIds.map((id) => `id=eq.${id}`).join("&");
        products = await supabaseRequest(
          `products?select=id,name&${productQuery}`,
        );
      }
      const productMap = {};
      products.forEach((p) => (productMap[p.id] = p));

      // إجمالي القطع
      const totalItems = sales.reduce((sum, s) => sum + s.quantity, 0);
      document.getElementById("totalItems").textContent = totalItems;

      // إجمالي المبيعات (عدد الصفوف)
      document.getElementById("totalSales").textContent = sales.length;

      // المتوسط اليومي
      const uniqueDays = new Set(sales.map((s) => s.sale_date));
      const daysCount = uniqueDays.size || 1;
      const avg = Math.round(totalItems / daysCount);
      document.getElementById("avgPerDay").textContent = avg;

      // أفضل منتج
      const productSales = {};
      sales.forEach((sale) => {
        const name = productMap[sale.product_id]?.name || "غير معروف";
        productSales[name] = (productSales[name] || 0) + sale.quantity;
      });

      const topProduct = Object.entries(productSales).sort(
        (a, b) => b[1] - a[1],
      )[0];
      document.getElementById("topProduct").textContent = topProduct
        ? topProduct[0]
        : "-";
    } catch (error) {
      console.error("خطأ في تحميل الإحصائيات:", error);
    }
  }

  async loadFilters() {
    try {
      const response = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true&order=name.asc",
      );
      const select = document.getElementById("filterBranch");
      select.innerHTML = '<option value="all">جميع الفروع</option>';

      response.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        select.appendChild(option);
      });
    } catch (error) {
      console.error("خطأ في تحميل الفلاتر:", error);
    }
  }

  async applyFilters() {
    await this.loadSales();
    await this.loadStats();
    showToast("تم تطبيق الفلتر بنجاح", "success");
  }
}

// ============================================
// دوال مساعدة
// ============================================

let salesReportManager;

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

function applyFilters() {
  if (salesReportManager) salesReportManager.applyFilters();
}

document.addEventListener("DOMContentLoaded", () => {
  salesReportManager = new SalesReportManager();
});

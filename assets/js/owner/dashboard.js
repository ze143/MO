// ============================================
// لوحة تحكم المالك - نسخة مصلحة
// ============================================

class OwnerDashboard {
  constructor() {
    this.charts = {};
    this.filters = { dateFrom: "", dateTo: "", branchId: "all" };
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

    await this.loadFilterOptions();
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

  // ============================================
  // الفلاتر
  // ============================================

  async loadFilterOptions() {
    try {
      const branches = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true&order=name.asc",
      );
      const select = document.getElementById("filterBranch");
      select.innerHTML = '<option value="all">جميع الفروع</option>';
      branches.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        select.appendChild(option);
      });
    } catch (error) {
      console.error("خطأ في تحميل خيارات الفلتر:", error);
    }
  }

  async applyFilters() {
    showLoading();
    try {
      const dateFrom = document.getElementById("filterDateFrom").value;
      const dateTo = document.getElementById("filterDateTo").value;
      const branchId = document.getElementById("filterBranch").value;

      console.log("📌 تطبيق الفلاتر:", { dateFrom, dateTo, branchId });

      // حفظ الفلاتر
      this.filters = { dateFrom, dateTo, branchId };

      // إعادة تحميل البيانات مع الفلاتر
      await this.loadData();
      showToast("تم تطبيق الفلاتر", "success");
    } catch (error) {
      console.error("خطأ في تطبيق الفلاتر:", error);
      showToast("حدث خطأ", "error");
    } finally {
      hideLoading();
    }
  }

  resetFilters() {
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    document.getElementById("filterBranch").value = "all";
    this.filters = { dateFrom: "", dateTo: "", branchId: "all" };
    this.loadData();
    showToast("تم إعادة تعيين الفلاتر", "info");
  }

  // ============================================
  // تحميل البيانات
  // ============================================

  async loadData() {
    showLoading();
    try {
      const { dateFrom, dateTo, branchId } = this.filters;

      await Promise.all([
        this.loadStats(dateFrom, dateTo, branchId),
        this.loadBranchesChart(dateFrom, dateTo, branchId),
        this.loadProductsChart(dateFrom, dateTo, branchId),
        this.loadRecentSales(dateFrom, dateTo, branchId),
      ]);
    } catch (error) {
      console.error("خطأ في تحميل البيانات:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  // ============================================
  // الإحصائيات
  // ============================================

  async loadStats(dateFrom, dateTo, branchId) {
    try {
      // 1. إجمالي المبيعات (مع الفلتر)
      let salesQuery = "daily_sales?select=quantity";
      const salesFilters = [];
      if (dateFrom) salesFilters.push(`sale_date=gte.${dateFrom}`);
      if (dateTo) salesFilters.push(`sale_date=lte.${dateTo}`);
      if (branchId !== "all") salesFilters.push(`branch_id=eq.${branchId}`);
      if (salesFilters.length > 0) salesQuery += `&${salesFilters.join("&")}`;

      const salesResponse = await supabaseRequest(salesQuery);
      const totalSales = salesResponse.reduce((sum, s) => sum + s.quantity, 0);
      document.getElementById("totalSales").textContent = totalSales;
      console.log(`📊 إجمالي المبيعات: ${totalSales}`);

      // 2. عدد الفروع (ثابت)
      const branchesResponse = await supabaseRequest(
        "branches?select=id&is_active=eq.true",
      );
      document.getElementById("totalBranches").textContent =
        branchesResponse.length;

      // 3. عدد المنتجات (ثابت)
      const productsResponse = await supabaseRequest(
        "products?select=id&is_active=eq.true",
      );
      document.getElementById("totalProducts").textContent =
        productsResponse.length;

      // 4. ✅ مبيعات اليوم (مع فلتر الفرع)
      const today = new Date().toISOString().split("T")[0];
      let todayQuery = `daily_sales?select=quantity&sale_date=eq.${today}`;

      // ✅ تطبيق فلتر الفرع على مبيعات اليوم
      if (branchId && branchId !== "all") {
        todayQuery += `&branch_id=eq.${branchId}`;
      }

      const todaySalesResponse = await supabaseRequest(todayQuery);
      const todaySales = todaySalesResponse.reduce(
        (sum, s) => sum + s.quantity,
        0,
      );
      document.getElementById("todaySales").textContent = todaySales;
      console.log(`📊 مبيعات اليوم (${today}): ${todaySales}`);
    } catch (error) {
      console.error("خطأ في تحميل الإحصائيات:", error);
      showToast("حدث خطأ في تحميل الإحصائيات", "error");
    }
  }

  // ============================================
  // مخطط الفروع
  // ============================================

  async loadBranchesChart(dateFrom, dateTo, branchId) {
    try {
      let query = "daily_sales?select=branch_id,quantity";
      const filters = [];

      if (dateFrom) filters.push(`sale_date=gte.${dateFrom}`);
      if (dateTo) filters.push(`sale_date=lte.${dateTo}`);
      if (branchId !== "all") filters.push(`branch_id=eq.${branchId}`);

      if (filters.length > 0) {
        query += `&${filters.join("&")}`;
      }

      const sales = await supabaseRequest(query);

      // جلب أسماء الفروع
      const branchIds = [
        ...new Set(sales.map((s) => s.branch_id).filter((id) => id)),
      ];
      let branchMap = {};
      if (branchIds.length > 0) {
        const branchQuery = branchIds.map((id) => `id.eq.${id}`).join(",");
        const branches = await supabaseRequest(
          `branches?select=id,name&or=(${branchQuery})`,
        );
        for (const b of branches) {
          branchMap[b.id] = b;
        }
      }

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

  // ============================================
  // مخطط المنتجات
  // ============================================

  async loadProductsChart(dateFrom, dateTo, branchId) {
    try {
      let query = "daily_sales?select=product_id,quantity";
      const filters = [];

      if (dateFrom) filters.push(`sale_date=gte.${dateFrom}`);
      if (dateTo) filters.push(`sale_date=lte.${dateTo}`);
      if (branchId !== "all") filters.push(`branch_id=eq.${branchId}`);

      if (filters.length > 0) {
        query += `&${filters.join("&")}`;
      }

      const sales = await supabaseRequest(query);

      // جلب أسماء المنتجات
      const productIds = [
        ...new Set(sales.map((s) => s.product_id).filter((id) => id)),
      ];
      let productMap = {};
      if (productIds.length > 0) {
        const productQuery = productIds.map((id) => `id.eq.${id}`).join(",");
        const products = await supabaseRequest(
          `products?select=id,name&or=(${productQuery})`,
        );
        for (const p of products) {
          productMap[p.id] = p;
        }
      }

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

  // ============================================
  // آخر المبيعات
  // ============================================

  async loadRecentSales(dateFrom, dateTo, branchId) {
    try {
      let query = `
        daily_sales?select=id,branch_id,product_id,quantity,sale_date,is_closed&order=created_at.desc&limit=20
      `;
      const filters = [];

      if (dateFrom) filters.push(`sale_date=gte.${dateFrom}`);
      if (dateTo) filters.push(`sale_date=lte.${dateTo}`);
      if (branchId !== "all") filters.push(`branch_id=eq.${branchId}`);

      if (filters.length > 0) {
        query += `&${filters.join("&")}`;
      }

      const sales = await supabaseRequest(query);

      // جلب أسماء الفروع
      const branchIds = [
        ...new Set(sales.map((s) => s.branch_id).filter((id) => id)),
      ];
      let branchMap = {};
      if (branchIds.length > 0) {
        const branchQuery = branchIds.map((id) => `id.eq.${id}`).join(",");
        const branches = await supabaseRequest(
          `branches?select=id,name&or=(${branchQuery})`,
        );
        for (const b of branches) {
          branchMap[b.id] = b;
        }
      }

      // جلب أسماء المنتجات
      const productIds = [
        ...new Set(sales.map((s) => s.product_id).filter((id) => id)),
      ];
      let productMap = {};
      if (productIds.length > 0) {
        const productQuery = productIds.map((id) => `id.eq.${id}`).join(",");
        const products = await supabaseRequest(
          `products?select=id,name&or=(${productQuery})`,
        );
        for (const p of products) {
          productMap[p.id] = p;
        }
      }

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

function applyFilters() {
  if (window._ownerDashboard) window._ownerDashboard.applyFilters();
}

function resetFilters() {
  if (window._ownerDashboard) window._ownerDashboard.resetFilters();
}

document.addEventListener("DOMContentLoaded", () => {
  window._ownerDashboard = new OwnerDashboard();
});

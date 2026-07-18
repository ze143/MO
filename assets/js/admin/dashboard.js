// ============================================
// لوحة تحكم الأدمن
// ============================================

class AdminDashboard {
  constructor() {
    this.charts = {};
    this.init();
  }

  async init() {
    // التحقق من الصلاحيات
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    // عرض اسم المستخدم
    const profile = authManager.getCurrentProfile();
    document.getElementById("welcomeMessage").textContent =
      `مرحباً ${profile.full_name}`;

    // عرض الوقت
    this.updateTime();
    setInterval(() => this.updateTime(), 1000);

    // تحميل البيانات
    await this.loadData();

    // الاستماع لتحديثات الصفحات
    authManager.listenForUpdates((data) => {
      if (data.type === "day_closed") {
        showToast("تم إقفال اليوم بنجاح", "success");
        this.loadData();
      }
    });
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
        this.loadFilters(),
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

  // ============================================
  // إصلاح استعلامات dashboard.js
  // ============================================

  async loadBranchesChart() {
    try {
      // 🔥 الصيغة الصحيحة
      const response = await supabaseRequest(`
            daily_sales?select=branch_id,quantity,branches(name)
        `);

      // تصحيح البيانات
      const branchSales = {};
      response.forEach((item) => {
        const branches = Array.isArray(item.branches)
          ? item.branches[0]
          : item.branches;
        const name = branches?.name || "غير معروف";
        branchSales[name] = (branchSales[name] || 0) + item.quantity;
      });

      const labels = Object.keys(branchSales);
      const data = Object.values(branchSales);

      if (this.charts.branches) {
        this.charts.branches.destroy();
      }

      const ctx = document.getElementById("branchesChart").getContext("2d");
      this.charts.branches = new Chart(ctx, {
        type: "bar",
        data: {
          labels: labels,
          datasets: [
            {
              label: "المبيعات (قطعة)",
              data: data,
              backgroundColor: "rgba(139, 26, 26, 0.8)",
              borderColor: "rgba(139, 26, 26, 1)",
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
      // 🔥 الصيغة الصحيحة
      const response = await supabaseRequest(`
            daily_sales?select=product_id,quantity,products(name)
        `);

      // تصحيح البيانات
      const productSales = {};
      response.forEach((item) => {
        const products = Array.isArray(item.products)
          ? item.products[0]
          : item.products;
        const name = products?.name || "غير معروف";
        productSales[name] = (productSales[name] || 0) + item.quantity;
      });

      const sorted = Object.entries(productSales)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

      const labels = sorted.map((item) => item[0]);
      const data = sorted.map((item) => item[1]);

      if (this.charts.products) {
        this.charts.products.destroy();
      }

      const ctx = document.getElementById("productsChart").getContext("2d");
      this.charts.products = new Chart(ctx, {
        type: "pie",
        data: {
          labels: labels,
          datasets: [
            {
              data: data,
              backgroundColor: [
                "#8B1A1A",
                "#D4A574",
                "#5C1212",
                "#C49A6A",
                "#6B2D2D",
                "#E8C9A0",
                "#4A1A1A",
                "#D4B896",
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
      // 🔥 الصيغة الصحيحة
      const response = await supabaseRequest(`
            daily_sales?select=id,quantity,sale_date,is_closed,branches(name),products(name)&order=created_at.desc&limit=20
        `);

      const tbody = document.getElementById("recentSalesTable");
      if (response.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">لا توجد مبيعات مسجلة</td>
                </tr>
            `;
        return;
      }

      tbody.innerHTML = response
        .map((sale, index) => {
          const branches = Array.isArray(sale.branches)
            ? sale.branches[0]
            : sale.branches;
          const products = Array.isArray(sale.products)
            ? sale.products[0]
            : sale.products;

          return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${branches?.name || "غير معروف"}</td>
                    <td>${products?.name || "غير معروف"}</td>
                    <td>${sale.quantity}</td>
                    <td>${new Date(sale.sale_date).toLocaleDateString("ar-EG")}</td>
                    <td>
                        <span class="badge-status ${sale.is_closed ? "closed" : "open"}">
                            ${sale.is_closed ? "مقفلة" : "مفتوحة"}
                        </span>
                    </td>
                </tr>
            `;
        })
        .join("");
    } catch (error) {
      console.error("خطأ في تحميل المبيعات الأخيرة:", error);
    }
  }

  async loadFilters() {
    try {
      // تحميل الفروع
      const branchesResponse = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true",
      );
      const branchSelect = document.getElementById("filterBranch");
      branchesResponse.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        branchSelect.appendChild(option);
      });

      // تحميل المنتجات
      const productsResponse = await supabaseRequest(
        "products?select=id,name&is_active=eq.true",
      );
      const productSelect = document.getElementById("filterProduct");
      productsResponse.forEach((product) => {
        const option = document.createElement("option");
        option.value = product.id;
        option.textContent = product.name;
        productSelect.appendChild(option);
      });
    } catch (error) {
      console.error("خطأ في تحميل الفلاتر:", error);
    }
  }

  async applyFilters() {
    showLoading();
    try {
      const dateFrom = document.getElementById("filterDateFrom").value;
      const dateTo = document.getElementById("filterDateTo").value;
      const branchId = document.getElementById("filterBranch").value;
      const productId = document.getElementById("filterProduct").value;

      let query =
        "daily_sales?select=id,branches(name),products(name),quantity,sale_date,is_closed";
      const filters = [];

      if (dateFrom) filters.push(`sale_date=gte.${dateFrom}`);
      if (dateTo) filters.push(`sale_date=lte.${dateTo}`);
      if (branchId !== "all") filters.push(`branch_id=eq.${branchId}`);
      if (productId !== "all") filters.push(`product_id=eq.${productId}`);

      if (filters.length > 0) {
        query += `&${filters.join("&")}`;
      }

      query += "&order=created_at.desc&limit=100";

      const response = await supabaseRequest(query);

      const tbody = document.getElementById("recentSalesTable");
      if (response.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="6" class="text-center text-muted">لا توجد نتائج مطابقة للفلتر</td>
                    </tr>
                `;
        return;
      }

      tbody.innerHTML = response
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

      showToast("تم تطبيق الفلتر بنجاح", "success");
    } catch (error) {
      console.error("خطأ في تطبيق الفلتر:", error);
      showToast("حدث خطأ في تطبيق الفلتر", "error");
    } finally {
      hideLoading();
    }
  }

  resetFilters() {
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    document.getElementById("filterBranch").value = "all";
    document.getElementById("filterProduct").value = "all";
    this.loadRecentSales();
    showToast("تم إعادة تعيين الفلاتر", "info");
  }

  refreshData() {
    this.loadData();
    showToast("تم تحديث البيانات", "info");
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
  const dashboard = window._dashboard;
  if (dashboard) dashboard.applyFilters();
}

function resetFilters() {
  const dashboard = window._dashboard;
  if (dashboard) dashboard.resetFilters();
}

function refreshData() {
  const dashboard = window._dashboard;
  if (dashboard) dashboard.refreshData();
}

// ============================================
// تهيئة الصفحة
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  window._dashboard = new AdminDashboard();
});

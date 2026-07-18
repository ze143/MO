// ============================================
// تقرير شامل للفروع
// ============================================

class BranchFullReport {
  constructor() {
    this.allBranches = [];
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    await this.loadBranchesReport();
  }

  async loadBranchesReport() {
    showLoading();
    try {
      const branches = await supabaseRequest(
        "branches?select=id,name,code,address,phone,manager_name,is_active&order=name.asc",
      );

      // جلب جميع المنتجات
      const products = await supabaseRequest(
        "products?select=id,name,code&is_active=eq.true&order=name.asc",
      );
      const productMap = {};
      products.forEach((p) => (productMap[p.id] = p));

      // جلب مخزون الفروع
      const allStock = await supabaseRequest(
        "branch_stock?select=branch_id,product_id,quantity",
      );

      // جلب المبيعات
      const allSales = await supabaseRequest(
        "daily_sales?select=branch_id,product_id,quantity,sale_date",
      );
      const today = new Date().toISOString().split("T")[0];

      const branchesData = branches.map((branch) => {
        const branchStock = allStock.filter((s) => s.branch_id === branch.id);
        const totalStock = branchStock.reduce((sum, s) => sum + s.quantity, 0);
        const productCount = branchStock.filter((s) => s.quantity > 0).length;

        const productsWithStock = branchStock
          .map((item) => ({
            ...item,
            product: productMap[item.product_id] || {
              name: "غير معروف",
              code: "",
            },
          }))
          .sort((a, b) => b.quantity - a.quantity);

        const branchSales = allSales.filter((s) => s.branch_id === branch.id);
        const totalSales = branchSales.reduce((sum, s) => sum + s.quantity, 0);
        const todaySales = branchSales.filter((s) => s.sale_date === today);
        const totalTodaySales = todaySales.reduce(
          (sum, s) => sum + s.quantity,
          0,
        );

        const status =
          totalStock === 0 ? "out" : totalStock < 20 ? "low" : "ok";

        return {
          ...branch,
          products: productsWithStock,
          totalStock,
          productCount,
          totalSales,
          totalTodaySales,
          stockStatus: status,
        };
      });

      this.renderBranches(branchesData);
    } catch (error) {
      console.error("خطأ في تحميل تقارير الفروع:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  renderStats() {
    const totalBranches = this.allBranches.filter((b) => b.is_active).length;
    const totalStock = this.allBranches.reduce(
      (sum, b) => sum + b.totalStock,
      0,
    );
    const totalSales = this.allBranches.reduce(
      (sum, b) => sum + b.totalSales,
      0,
    );
    const totalProducts = this.allBranches[0]?.productCountAll || 0;

    document.getElementById("totalBranches").textContent = totalBranches;
    document.getElementById("totalStock").textContent = totalStock;
    document.getElementById("totalSales").textContent = totalSales;
    document.getElementById("totalProducts").textContent = totalProducts;
  }

  renderBranches(branches) {
    const container = document.getElementById("branchesContainer");

    if (branches.length === 0) {
      container.innerHTML = `
            <div class="col-12 text-center text-muted py-5">
                <i class="fas fa-store fa-3x mb-3 d-block"></i>
                لا توجد فروع
            </div>
        `;
      return;
    }

    container.innerHTML = branches
      .map((branch) => {
        const statusClass = branch.is_active ? "active" : "inactive";
        const statusText = branch.is_active ? "نشط" : "غير نشط";

        const stockStatusMap = {
          ok: { class: "bg-success", text: "متوفر" },
          low: { class: "badge-low", text: "منخفض" },
          out: { class: "badge-out", text: "نفذ" },
        };

        const stockInfo =
          stockStatusMap[branch.stockStatus] || stockStatusMap["ok"];

        return `
            <div class="col-xl-3 col-lg-6 col-md-6 col-sm-12 mb-4 branch-item" data-name="${branch.name}" data-status="${branch.stockStatus}" data-id="${branch.id}">
                <div class="card branch-card h-100">
                    <div class="card-body">
                        <div class="branch-header">
                            <div>
                                <h5 class="card-title" style="color: var(--primary-color);">
                                    ${branch.name}
                                </h5>
                                <span class="badge bg-secondary">${branch.code}</span>
                                <span class="badge ${statusClass}">${statusText}</span>
                                <span class="badge ${stockInfo.class}">${stockInfo.text}</span>
                            </div>
                            <div>
                                <span class="badge bg-primary">${branch.productCount} منتج</span>
                            </div>
                        </div>
                        
                        <div class="branch-stats">
                            <div class="stat-item">
                                <div class="number">${branch.totalStock}</div>
                                <div class="label">إجمالي المخزون</div>
                            </div>
                            <div class="stat-item">
                                <div class="number">${branch.totalTodaySales}</div>
                                <div class="label">مبيعات اليوم</div>
                            </div>
                            <div class="stat-item">
                                <div class="number">${branch.totalSales}</div>
                                <div class="label">إجمالي المبيعات</div>
                            </div>
                        </div>

                        <div class="mt-2 text-muted" style="font-size: 13px;">
                            <div><i class="fas fa-user"></i> المدير: ${branch.manager_name || "-"}</div>
                            <div><i class="fas fa-phone"></i> ${branch.phone || "-"}</div>
                        </div>

                        <button class="toggle-products" onclick="toggleProducts('${branch.id}')">
                            <i class="fas fa-chevron-down"></i> عرض المنتجات
                        </button>

                        <div class="products-collapse" id="products_${branch.id}">
                            <div class="product-list">
                                ${branch.products
                                  .filter((p) => p.quantity > 0 || true)
                                  .map((product) => {
                                    const status =
                                      product.quantity === 0
                                        ? "نفذ"
                                        : product.quantity < 5
                                          ? "منخفض"
                                          : "متوفر";
                                    const statusClass =
                                      product.quantity === 0
                                        ? "badge-out"
                                        : product.quantity < 5
                                          ? "badge-low"
                                          : "badge-ok";
                                    return `
                                            <div class="product-item">
                                                <span class="product-name">
                                                    ${product.name}
                                                    <span class="badge ${statusClass} ms-2">${status}</span>
                                                </span>
                                                <span class="product-qty">${product.quantity}</span>
                                            </div>
                                        `;
                                  })
                                  .join("")}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
      })
      .join("");
  }

  filterBranches() {
    const searchTerm = document
      .getElementById("searchBranch")
      .value.toLowerCase();
    const statusFilter = document.getElementById("filterStockStatus").value;

    let filtered = this.allBranches;

    if (searchTerm) {
      filtered = filtered.filter((b) =>
        b.name.toLowerCase().includes(searchTerm),
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((b) => b.stockStatus === statusFilter);
    }

    this.renderBranches(filtered);
  }

  sortBranches() {
    const sortBy = document.getElementById("sortBy").value;
    let sorted = [...this.allBranches];

    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "stock":
        sorted.sort((a, b) => b.totalStock - a.totalStock);
        break;
      case "sales":
        sorted.sort((a, b) => b.totalSales - a.totalSales);
        break;
    }

    this.renderBranches(sorted);
  }

  refreshData() {
    this.loadData();
    showToast("تم تحديث البيانات", "info");
  }

  toggleProducts(branchId) {
    const element = document.getElementById(`products_${branchId}`);

    if (!element) return;

    const button = element
      .closest(".card-body")
      .querySelector(".toggle-products");

    if (element.classList.contains("show")) {
      element.classList.remove("show");
      if (button)
        button.innerHTML = '<i class="fas fa-chevron-down"></i> عرض المنتجات';
    } else {
      // أقفل أي قائمة مفتوحة تانية
      document.querySelectorAll(".products-collapse.show").forEach((el) => {
        if (el.id !== `products_${branchId}`) {
          el.classList.remove("show");
          const btn = el
            .closest(".card-body")
            .querySelector(".toggle-products");
          if (btn)
            btn.innerHTML = '<i class="fas fa-chevron-down"></i> عرض المنتجات';
        }
      });

      element.classList.add("show");
      if (button)
        button.innerHTML = '<i class="fas fa-chevron-up"></i> إخفاء المنتجات';
    }
  }
}

// ============================================
// دوال مساعدة
// ============================================

let reportManager;

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

function filterBranches() {
  if (reportManager) reportManager.filterBranches();
}

function sortBranches() {
  if (reportManager) reportManager.sortBranches();
}

function refreshData() {
  if (reportManager) reportManager.refreshData();
}

function toggleProducts(index) {
  if (reportManager) reportManager.toggleProducts(index);
}

document.addEventListener("DOMContentLoaded", () => {
  reportManager = new BranchFullReport();
});

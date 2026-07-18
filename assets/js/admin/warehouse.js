// ============================================
// إدارة المخزن الرئيسي
// ============================================

class WarehouseManager {
  constructor() {
    this.supplyModal = null;
    this.allStock = [];
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    this.supplyModal = new bootstrap.Modal(
      document.getElementById("supplyModal"),
    );
    await this.loadWarehouse();
    await this.loadSupplyOptions();
  }

  async loadWarehouse() {
    try {
      // 🔥 الصيغة الصحيحة - استخدم products(name,code,category,min_stock) داخل select
      const response = await supabaseRequest(`
            warehouse_stock?select=id,product_id,quantity,products(name,code,category,min_stock)
        `);

      // تصحيح البيانات - Supabase ترجع products كمصفوفة
      this.allStock = response.map((item) => ({
        ...item,
        products: Array.isArray(item.products)
          ? item.products[0]
          : item.products,
      }));

      this.renderTable(this.allStock);
      this.loadStats(this.allStock);
    } catch (error) {
      console.error("خطأ في تحميل المخزون:", error);
      showToast("حدث خطأ في تحميل المخزون", "error");
    }
  }

  renderTable(stock) {
    const tbody = document.getElementById("warehouseTable");
    if (stock.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-muted">لا توجد منتجات في المخزن</td>
                </tr>
            `;
      return;
    }

    tbody.innerHTML = stock
      .map((item, index) => {
        const product = item.products;
        const qty = item.quantity;
        let status = "متوفر";
        let statusClass = "success";

        if (qty <= 0) {
          status = "نفذ";
          statusClass = "danger";
        } else if (qty < (product.min_stock || 10)) {
          status = "منخفض";
          statusClass = "warning";
        }

        return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${product?.name || "غير معروف"}</td>
                    <td>${product?.code || "-"}</td>
                    <td>${product?.category || "-"}</td>
                    <td><strong>${qty}</strong></td>
                    <td>
                        <span class="badge bg-${statusClass}">${status}</span>
                    </td>
                </tr>
            `;
      })
      .join("");
  }

  loadStats(stock) {
    const totalProducts = stock.length;
    const totalItems = stock.reduce((sum, item) => sum + item.quantity, 0);
    const lowStock = stock.filter(
      (item) =>
        item.quantity > 0 && item.quantity < (item.products?.min_stock || 10),
    ).length;
    const outOfStock = stock.filter((item) => item.quantity <= 0).length;

    document.getElementById("totalProducts").textContent = totalProducts;
    document.getElementById("totalItems").textContent = totalItems;
    document.getElementById("lowStock").textContent = lowStock;
    document.getElementById("outOfStock").textContent = outOfStock;
  }

  async loadSupplyOptions() {
    try {
      // 🔥 الصيغة الصحيحة
      const productsResponse = await supabaseRequest(`
            warehouse_stock?select=product_id,quantity,products(name,code)&quantity=gt.0
        `);

      // تصحيح البيانات
      const products = productsResponse.map((item) => ({
        ...item,
        products: Array.isArray(item.products)
          ? item.products[0]
          : item.products,
      }));

      const productSelect = document.getElementById("supplyProduct");
      products.forEach((item) => {
        const option = document.createElement("option");
        option.value = item.product_id;
        option.dataset.quantity = item.quantity;
        const productName = item.products?.name || "غير معروف";
        const productCode = item.products?.code || "";
        option.textContent = `${productName} (${productCode}) - متاح: ${item.quantity}`;
        productSelect.appendChild(option);
      });

      // تحميل الفروع النشطة
      const branchesResponse = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true",
      );
      const branchSelect = document.getElementById("supplyBranch");
      branchesResponse.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        branchSelect.appendChild(option);
      });

      // عرض الكمية المتاحة عند اختيار المنتج
      productSelect.addEventListener("change", function () {
        const selected = this.options[this.selectedIndex];
        const qty = selected.dataset.quantity || 0;
        document.getElementById("supplyAvailable").textContent =
          `الكمية المتاحة: ${qty}`;
        document.getElementById("supplyQuantity").max = qty;
      });
    } catch (error) {
      console.error("خطأ في تحميل خيارات التوريد:", error);
    }
  }

  showSupply() {
    document.getElementById("supplyForm").reset();
    document.getElementById("supplyAvailable").textContent =
      "الكمية المتاحة: 0";
    this.supplyModal.show();
  }

  async processSupply() {
    const productId = document.getElementById("supplyProduct").value;
    const branchId = document.getElementById("supplyBranch").value;
    const quantity = parseInt(document.getElementById("supplyQuantity").value);
    const notes = document.getElementById("supplyNotes").value.trim();

    if (!productId || !branchId || !quantity || quantity < 1) {
      showToast("يرجى ملء جميع الحقول المطلوبة", "warning");
      return;
    }

    // التحقق من الكمية المتاحة
    const productSelect = document.getElementById("supplyProduct");
    const selectedOption = productSelect.options[productSelect.selectedIndex];
    const available = parseInt(selectedOption.dataset.quantity) || 0;

    if (quantity > available) {
      showToast(
        `الكمية المطلوبة (${quantity}) أكبر من المتاحة (${available})`,
        "error",
      );
      return;
    }

    if (!confirm(`هل أنت متأكد من توريد ${quantity} قطعة للفرع المحدد؟`))
      return;

    showLoading();

    try {
      // استدعاء الدالة المخزنة في قاعدة البيانات
      await supabaseRequest("rpc/transfer_from_warehouse_to_branch", {
        method: "POST",
        body: JSON.stringify({
          p_branch_id: branchId,
          p_product_id: productId,
          p_quantity: quantity,
          p_notes: notes,
        }),
      });

      showToast("تم التوريد بنجاح", "success");
      this.supplyModal.hide();
      await this.loadWarehouse();
      await this.loadSupplyOptions();
    } catch (error) {
      console.error("خطأ في عملية التوريد:", error);
      showToast("حدث خطأ في عملية التوريد", "error");
    } finally {
      hideLoading();
    }
  }

  searchWarehouse() {
    const searchTerm = document
      .getElementById("searchWarehouse")
      .value.toLowerCase();
    const statusFilter = document.getElementById("filterStockStatus").value;

    let filtered = this.allStock;

    if (searchTerm) {
      filtered = filtered.filter(
        (item) =>
          item.products?.name?.toLowerCase().includes(searchTerm) ||
          item.products?.code?.toLowerCase().includes(searchTerm),
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((item) => {
        const qty = item.quantity;
        const minStock = item.products?.min_stock || 10;

        switch (statusFilter) {
          case "available":
            return qty >= minStock;
          case "low":
            return qty > 0 && qty < minStock;
          case "out":
            return qty <= 0;
          default:
            return true;
        }
      });
    }

    this.renderTable(filtered);
  }
}

// ============================================
// دوال مساعدة
// ============================================

let warehouseManager;

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

function showSupplyModal() {
  if (warehouseManager) warehouseManager.showSupply();
}

function processSupply() {
  if (warehouseManager) warehouseManager.processSupply();
}

function searchWarehouse() {
  if (warehouseManager) warehouseManager.searchWarehouse();
}

document.addEventListener("DOMContentLoaded", () => {
  warehouseManager = new WarehouseManager();
});

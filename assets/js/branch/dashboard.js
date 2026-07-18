// ============================================
// لوحة تحكم الفرع
// ============================================

class BranchDashboard {
  constructor() {
    this.salesData = {};
    this.stockData = {};
    this.branchId = null;
    this.init();
  }

  async init() {
    // التحقق من الصلاحيات
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.BRANCH_USER)) return;

    const profile = authManager.getCurrentProfile();
    this.branchId = profile.branch_id;

    if (!this.branchId) {
      showToast("خطأ: لا يوجد فرع مرتبط بهذا المستخدم", "error");
      return;
    }

    // عرض اسم الفرع والمستخدم
    document.getElementById("branchName").textContent =
      profile.full_name || "الفرع";
    document.getElementById("welcomeMessage").textContent =
      `مرحباً ${profile.full_name}`;

    // عرض الوقت
    this.updateTime();
    setInterval(() => this.updateTime(), 1000);

    // عرض تاريخ اليوم
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("salesDate").textContent =
      new Date().toLocaleDateString("ar-EG");

    // تحميل البيانات
    await this.loadData();

    // التحقق من حالة الإقفال
    await this.checkClosingStatus();

    // تحديث تلقائي كل 30 ثانية
    setInterval(() => this.loadStockAndSales(), 30000);

    // الاستماع لتحديثات الصفحات
    authManager.listenForUpdates((data) => {
      if (data.type === "day_closed" && data.branchId === this.branchId) {
        showToast("تم إقفال اليوم، سيتم تحديث البيانات", "info");
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
        this.loadProducts(),
        this.loadTodaySales(),
        this.loadBranchStock(),
        this.loadStats(),
      ]);
    } catch (error) {
      console.error("خطأ في تحميل البيانات:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  async loadStockAndSales() {
    try {
      await Promise.all([
        this.loadTodaySales(),
        this.loadBranchStock(),
        this.loadStats(),
      ]);
    } catch (error) {
      console.error("خطأ في تحديث البيانات:", error);
    }
  }

  // ============================================
  // تحميل المنتجات للمبيعات
  // ============================================

  async loadProducts() {
    try {
      // 1. جلب المنتجات النشطة
      const products = await supabaseRequest(`
            products?select=id,name,category,size,color&is_active=eq.true&order=name.asc
        `);

      // 2. جلب مخزون الفرع
      const stock = await supabaseRequest(`
            branch_stock?select=product_id,quantity&branch_id=eq.${this.branchId}
        `);

      // 3. دمج البيانات
      const stockMap = {};
      stock.forEach((item) => {
        stockMap[item.product_id] = item.quantity;
      });

      const container = document.getElementById("productsList");
      if (products.length === 0) {
        container.innerHTML = `
                <div class="text-center text-muted py-4">
                    <i class="fas fa-box-open"></i> لا توجد منتجات متاحة
                </div>
            `;
        return;
      }

      container.innerHTML = products
        .map((product) => {
          const stock = stockMap[product.id] || 0;
          const currentQty = this.salesData[product.id] || 0;

          return `
                <div class="product-item">
                    <div class="product-info">
                        <span class="product-name">${product.name}</span>
                        <span class="product-details">
                            ${product.category || ""} 
                            ${product.size ? `| مقاس: ${product.size}` : ""}
                            ${product.color ? `| لون: ${product.color}` : ""}
                            <span class="product-stock ms-2">المخزون: ${stock}</span>
                        </span>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-outline-secondary" onclick="decreaseQty('${product.id}')">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" class="product-input" 
                               id="qty_${product.id}" 
                               value="${currentQty}"
                               min="0"
                               max="${stock}"
                               onchange="updateQty('${product.id}', this.value)">
                        <button class="btn btn-sm btn-outline-secondary" onclick="increaseQty('${product.id}')">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>
            `;
        })
        .join("");
    } catch (error) {
      console.error("خطأ في تحميل المنتجات:", error);
      document.getElementById("productsList").innerHTML = `
            <div class="text-center text-danger py-4">
                <i class="fas fa-exclamation-circle"></i> حدث خطأ في تحميل المنتجات
            </div>
        `;
    }
  }

  async loadBranchStock() {
    try {
      // 1. جلب مخزون الفرع
      const stock = await supabaseRequest(`
            branch_stock?select=product_id,quantity&branch_id=eq.${this.branchId}
        `);

      // 2. جلب أسماء المنتجات (باستخدام fetchWithRelations)
      const stockWithProducts = await fetchWithRelations(stock, [
        {
          field: "product_id",
          table: "products",
          as: "products",
          fields: ["name", "code"],
        },
      ]);

      // 3. تخزين البيانات
      this.stockData = {};
      stockWithProducts.forEach((item) => {
        this.stockData[item.product_id] = item.quantity;
      });

      // 4. عرض في الجدول
      const tbody = document.getElementById("branchStockTable");
      if (stockWithProducts.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted">لا يوجد مخزون في هذا الفرع</td>
                </tr>
            `;
        return;
      }

      tbody.innerHTML = stockWithProducts
        .map((item, index) => {
          const product = item.products || {};
          const status =
            item.quantity <= 0 ? "نفذ" : item.quantity < 10 ? "منخفض" : "متوفر";
          const statusClass =
            item.quantity <= 0
              ? "danger"
              : item.quantity < 10
                ? "warning"
                : "success";

          return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${product.name || "غير معروف"}</td>
                    <td>${item.quantity}</td>
                    <td>
                        <span class="badge bg-${statusClass}">${status}</span>
                    </td>
                </tr>
            `;
        })
        .join("");
    } catch (error) {
      console.error("خطأ في تحميل مخزون الفرع:", error);
      document.getElementById("branchStockTable").innerHTML = `
            <tr>
                <td colspan="4" class="text-center text-danger">حدث خطأ في تحميل المخزون</td>
            </tr>
        `;
    }
  }

  async loadTodaySales() {
    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. جلب مبيعات اليوم
      const sales = await supabaseRequest(`
            daily_sales?select=id,product_id,quantity&branch_id=eq.${this.branchId}&sale_date=eq.${today}&is_closed=eq.false
        `);

      // 2. جلب أسماء المنتجات
      const salesWithProducts = await fetchWithRelations(sales, [
        {
          field: "product_id",
          table: "products",
          as: "products",
          fields: ["name"],
        },
      ]);

      // 3. تخزين البيانات
      this.salesData = {};
      salesWithProducts.forEach((sale) => {
        this.salesData[sale.product_id] = sale.quantity;
      });

      // 4. عرض في الجدول
      const tbody = document.getElementById("todaySalesTable");
      if (salesWithProducts.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-muted">لا توجد مبيعات مسجلة اليوم</td>
                </tr>
            `;
        document.getElementById("salesCount").textContent = "0 منتج";
        return;
      }

      tbody.innerHTML = salesWithProducts
        .map(
          (sale, index) => `
            <tr>
                <td>${index + 1}</td>
                <td>${sale.products?.name || "غير معروف"}</td>
                <td>${sale.quantity}</td>
                <td>
                    <button class="btn btn-danger btn-sm" onclick="deleteSale('${sale.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `,
        )
        .join("");

      const totalItems = sales.reduce((sum, s) => sum + s.quantity, 0);
      document.getElementById("salesCount").textContent = `${totalItems} قطعة`;

      // تحديث حقول الإدخال
      sales.forEach((sale) => {
        const input = document.getElementById(`qty_${sale.product_id}`);
        if (input) input.value = sale.quantity;
      });
    } catch (error) {
      console.error("خطأ في تحميل مبيعات اليوم:", error);
    }
  }

  async loadStats() {
    try {
      const today = new Date().toISOString().split("T")[0];

      // مبيعات اليوم
      const salesResponse = await supabaseRequest(`
                daily_sales?select=quantity&branch_id=eq.${this.branchId}&sale_date=eq.${today}
            `);
      const totalSales = salesResponse.reduce((sum, s) => sum + s.quantity, 0);
      document.getElementById("todayTotalSales").textContent = totalSales;

      // إجمالي المخزون
      const stockResponse = await supabaseRequest(`
                branch_stock?select=quantity&branch_id=eq.${this.branchId}
            `);
      const totalStock = stockResponse.reduce((sum, s) => sum + s.quantity, 0);
      document.getElementById("totalStockItems").textContent = totalStock;
    } catch (error) {
      console.error("خطأ في تحميل الإحصائيات:", error);
    }
  }

  async checkClosingStatus() {
    try {
      const today = new Date().toISOString().split("T")[0];
      const response = await supabaseRequest(`
                day_closing?select=id&branch_id=eq.${this.branchId}&closing_date=eq.${today}
            `);

      const statusEl = document.getElementById("closingStatus");
      if (response.length > 0) {
        statusEl.textContent = "مقفل";
        statusEl.className = "badge bg-danger p-2";
        // تعطيل إدخال المبيعات
        document.getElementById("productsList").style.opacity = "0.5";
        document
          .querySelectorAll(".product-input")
          .forEach((input) => (input.disabled = true));
        document
          .querySelectorAll(".btn-outline-secondary")
          .forEach((btn) => (btn.disabled = true));
        document.querySelector(".btn-primary-custom").disabled = true;
        showToast("تم إقفال اليوم، لا يمكن إضافة مبيعات جديدة", "warning");
      } else {
        statusEl.textContent = "مفتوح";
        statusEl.className = "badge bg-success p-2";
      }
    } catch (error) {
      console.error("خطأ في التحقق من حالة الإقفال:", error);
    }
  }

  async saveSales() {
    try {
      const today = new Date().toISOString().split("T")[0];

      // التحقق من حالة الإقفال
      const closingCheck = await supabaseRequest(`
                day_closing?select=id&branch_id=eq.${this.branchId}&closing_date=eq.${today}
            `);

      if (closingCheck.length > 0) {
        showToast("تم إقفال اليوم، لا يمكن إضافة مبيعات جديدة", "error");
        return;
      }

      // جمع البيانات من الحقول
      const products = document.querySelectorAll(".product-item");
      const salesToSave = [];

      products.forEach((product) => {
        const input = product.querySelector(".product-input");
        if (input) {
          const productId = input.id.replace("qty_", "");
          const quantity = parseInt(input.value) || 0;

          // جلب الكمية المسجلة مسبقاً
          const existingQty = this.salesData[productId] || 0;

          if (quantity > 0 && quantity !== existingQty) {
            salesToSave.push({
              product_id: productId,
              quantity: quantity,
              branch_id: this.branchId,
              sale_date: today,
            });
          }
        }
      });

      if (salesToSave.length === 0) {
        // التحقق من وجود مبيعات مسجلة بالفعل
        const existingSales = await supabaseRequest(`
                    daily_sales?select=id&branch_id=eq.${this.branchId}&sale_date=eq.${today}
                `);

        if (existingSales.length > 0) {
          showToast("لا توجد تغييرات جديدة لحفظها", "info");
          return;
        } else {
          showToast("يرجى إدخال كميات المبيعات", "warning");
          return;
        }
      }

      showLoading();

      // حذف المبيعات القديمة (غير المقفلة) لهذا اليوم
      await supabaseRequest(
        `daily_sales?branch_id=eq.${this.branchId}&sale_date=eq.${today}&is_closed=eq.false`,
        { method: "DELETE" },
      );

      // إضافة المبيعات الجديدة (ملاحظة: لا يتم خصم المخزون هنا)
      const requests = salesToSave.map((sale) =>
        supabaseRequest("daily_sales", {
          method: "POST",
          body: JSON.stringify(sale),
        }),
      );

      await Promise.all(requests);

      showToast(`تم حفظ ${salesToSave.length} منتج بنجاح`, "success");

      // إعادة تحميل البيانات
      await this.loadTodaySales();
      await this.loadStats();

      // تحديث المنتجات لعرض الكميات الجديدة
      await this.loadProducts();
    } catch (error) {
      console.error("خطأ في حفظ المبيعات:", error);
      showToast("حدث خطأ في حفظ المبيعات", "error");
    } finally {
      hideLoading();
    }
  }

  clearSales() {
    if (confirm("هل أنت متأكد من إعادة تعيين جميع الكميات؟")) {
      document.querySelectorAll(".product-input").forEach((input) => {
        input.value = 0;
      });
      showToast("تم إعادة تعيين الكميات", "info");
    }
  }

  async deleteSale(saleId) {
    if (!confirm("هل أنت متأكد من حذف هذه المبيعات؟")) return;

    try {
      await supabaseRequest(`daily_sales?id=eq.${saleId}`, {
        method: "DELETE",
      });
      showToast("تم حذف المبيعات بنجاح", "success");
      await this.loadTodaySales();
      await this.loadStats();
    } catch (error) {
      console.error("خطأ في حذف المبيعات:", error);
      showToast("حدث خطأ في حذف المبيعات", "error");
    }
  }
}

// ============================================
// دوال مساعدة للتفاعل مع الكميات
// ============================================

function updateQty(productId, value) {
  const qty = parseInt(value) || 0;
  if (qty < 0) {
    document.getElementById(`qty_${productId}`).value = 0;
  }
}

function increaseQty(productId) {
  const input = document.getElementById(`qty_${productId}`);
  const current = parseInt(input.value) || 0;
  input.value = current + 1;
}

function decreaseQty(productId) {
  const input = document.getElementById(`qty_${productId}`);
  const current = parseInt(input.value) || 0;
  if (current > 0) {
    input.value = current - 1;
  }
}

function deleteSale(saleId) {
  const dashboard = window._branchDashboard;
  if (dashboard) dashboard.deleteSale(saleId);
}

function saveSales() {
  const dashboard = window._branchDashboard;
  if (dashboard) dashboard.saveSales();
}

function clearSales() {
  const dashboard = window._branchDashboard;
  if (dashboard) dashboard.clearSales();
}

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

// ============================================
// تهيئة الصفحة
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  window._branchDashboard = new BranchDashboard();
});

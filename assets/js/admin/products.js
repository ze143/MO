// ============================================
// إدارة المنتجات
// ============================================

class ProductsManager {
  constructor() {
    this.productModal = null;
    this.allProducts = [];
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    this.productModal = new bootstrap.Modal(
      document.getElementById("productModal"),
    );
    await this.loadProducts();
    await this.loadCategories();
  }

  async loadProducts() {
    try {
      const response = await supabaseRequest(
        "products?select=*&order=name.asc",
      );
      this.allProducts = response;

      this.renderTable(response);
    } catch (error) {
      console.error("خطأ في تحميل المنتجات:", error);
      showToast("حدث خطأ في تحميل المنتجات", "error");
    }
  }

  renderTable(products) {
    const tbody = document.getElementById("productsTable");
    if (products.length === 0) {
      tbody.innerHTML = `
                <tr>
                    <td colspan="10" class="text-center text-muted">لا توجد منتجات مسجلة</td>
                </tr>
            `;
      return;
    }

    tbody.innerHTML = products
      .map(
        (product, index) => `
            <tr>
                <td>${index + 1}</td>
                <td><strong>${product.code}</strong></td>
                <td>${product.name}</td>
                <td>${product.category || "-"}</td>
                <td>${product.size || "-"}</td>
                <td>${product.color || "-"}</td>
                <td>${product.brand || "-"}</td>
                <td>${product.min_stock}</td>
                <td>
                    <span class="badge-status ${product.is_active ? "active" : "inactive"}">
                        ${product.is_active ? "نشط" : "غير نشط"}
                    </span>
                </td>
                <td>
                    <button class="btn btn-sm btn-warning" onclick="editProduct('${product.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `,
      )
      .join("");
  }

  async loadCategories() {
    try {
      const response = await supabaseRequest(
        "products?select=category&is_active=eq.true",
      );
      const categories = [
        ...new Set(response.map((p) => p.category).filter((c) => c)),
      ];

      const select = document.getElementById("filterCategory");
      categories.forEach((cat) => {
        const option = document.createElement("option");
        option.value = cat;
        option.textContent = cat;
        select.appendChild(option);
      });
    } catch (error) {
      console.error("خطأ في تحميل الفئات:", error);
    }
  }

  showAddProduct() {
    document.getElementById("productModalTitle").textContent =
      "إضافة منتج جديد";
    document.getElementById("editProductId").value = "";
    document.getElementById("productForm").reset();
    document.getElementById("productActive").checked = true;
    this.productModal.show();
  }

  async editProduct(id) {
    try {
      const response = await supabaseRequest(`products?id=eq.${id}`);
      if (response.length === 0) {
        showToast("المنتج غير موجود", "error");
        return;
      }

      const product = response[0];
      document.getElementById("productModalTitle").textContent = "تعديل المنتج";
      document.getElementById("editProductId").value = product.id;
      document.getElementById("productName").value = product.name;
      document.getElementById("productCode").value = product.code;
      document.getElementById("productCategory").value = product.category || "";
      document.getElementById("productSize").value = product.size || "";
      document.getElementById("productColor").value = product.color || "";
      document.getElementById("productBrand").value = product.brand || "";
      document.getElementById("productMinStock").value = product.min_stock || 0;
      document.getElementById("productActive").checked = product.is_active;

      this.productModal.show();
    } catch (error) {
      console.error("خطأ في تحميل بيانات المنتج:", error);
      showToast("حدث خطأ في تحميل بيانات المنتج", "error");
    }
  }

  async saveProduct() {
    const id = document.getElementById("editProductId").value;
    const data = {
      name: document.getElementById("productName").value.trim(),
      code: document.getElementById("productCode").value.trim(),
      category: document.getElementById("productCategory").value.trim(),
      size: document.getElementById("productSize").value.trim(),
      color: document.getElementById("productColor").value.trim(),
      brand: document.getElementById("productBrand").value.trim(),
      min_stock:
        parseInt(document.getElementById("productMinStock").value) || 0,
      is_active: document.getElementById("productActive").checked,
    };

    if (!data.name || !data.code) {
      showToast("يرجى إدخال اسم المنتج والكود", "warning");
      return;
    }

    showLoading();

    try {
      if (id) {
        await supabaseRequest(`products?id=eq.${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        showToast("تم تحديث المنتج بنجاح", "success");
      } else {
        await supabaseRequest("products", {
          method: "POST",
          body: JSON.stringify(data),
        });
        showToast("تم إضافة المنتج بنجاح", "success");
      }

      this.productModal.hide();
      await this.loadProducts();
    } catch (error) {
      console.error("خطأ في حفظ المنتج:", error);
      showToast("حدث خطأ في حفظ المنتج", "error");
    } finally {
      hideLoading();
    }
  }

  async deleteProduct(id) {
    if (
      !confirm(
        "⚠️ هل أنت متأكد من حذف هذا المنتج؟\n\nسيتم حذف المنتج من جميع الجداول المرتبطة (المخزون، المبيعات، التوريدات)",
      )
    ) {
      return;
    }

    showLoading();

    try {
      // 1. حذف من warehouse_stock
      await supabaseRequest(`warehouse_stock?product_id=eq.${id}`, {
        method: "DELETE",
      });
      console.log("✅ تم حذف من warehouse_stock");

      // 2. حذف من branch_stock
      await supabaseRequest(`branch_stock?product_id=eq.${id}`, {
        method: "DELETE",
      });
      console.log("✅ تم حذف من branch_stock");

      // 3. حذف من daily_sales
      await supabaseRequest(`daily_sales?product_id=eq.${id}`, {
        method: "DELETE",
      });
      console.log("✅ تم حذف من daily_sales");

      // 4. حذف من branch_transfers (حيث يكون product_id أو old_product_id أو new_product_id)
      await supabaseRequest(`branch_transfers?product_id=eq.${id}`, {
        method: "DELETE",
      });
      await supabaseRequest(`branch_transfers?old_product_id=eq.${id}`, {
        method: "DELETE",
      });
      await supabaseRequest(`branch_transfers?new_product_id=eq.${id}`, {
        method: "DELETE",
      });
      console.log("✅ تم حذف من branch_transfers");

      // 5. حذف من warehouse_supplies
      await supabaseRequest(`warehouse_supplies?product_id=eq.${id}`, {
        method: "DELETE",
      });
      console.log("✅ تم حذف من warehouse_supplies");

      // 6. حذف من inventory_audit_items
      await supabaseRequest(`inventory_audit_items?product_id=eq.${id}`, {
        method: "DELETE",
      });
      console.log("✅ تم حذف من inventory_audit_items");

      // 7. أخيراً حذف المنتج نفسه
      await supabaseRequest(`products?id=eq.${id}`, {
        method: "DELETE",
      });
      console.log("✅ تم حذف المنتج");

      showToast("✅ تم حذف المنتج بنجاح", "success");
      await this.loadProducts();
    } catch (error) {
      console.error("❌ خطأ في حذف المنتج:", error);
      showToast(`❌ حدث خطأ: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  searchProducts() {
    const searchTerm = document
      .getElementById("searchProduct")
      .value.toLowerCase();
    const category = document.getElementById("filterCategory").value;
    const status = document.getElementById("filterStatus").value;

    let filtered = this.allProducts;

    if (searchTerm) {
      filtered = filtered.filter(
        (p) =>
          p.name.toLowerCase().includes(searchTerm) ||
          p.code.toLowerCase().includes(searchTerm),
      );
    }

    if (category !== "all") {
      filtered = filtered.filter((p) => p.category === category);
    }

    if (status !== "all") {
      filtered = filtered.filter((p) =>
        status === "active" ? p.is_active : !p.is_active,
      );
    }

    this.renderTable(filtered);
  }
}

// ============================================
// دوال مساعدة
// ============================================

let productsManager;

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

function showAddProductModal() {
  if (productsManager) productsManager.showAddProduct();
}

function editProduct(id) {
  if (productsManager) productsManager.editProduct(id);
}

function deleteProduct(id) {
  if (productsManager) productsManager.deleteProduct(id);
}

function saveProduct() {
  if (productsManager) productsManager.saveProduct();
}

function searchProducts() {
  if (productsManager) productsManager.searchProducts();
}

document.addEventListener("DOMContentLoaded", () => {
  productsManager = new ProductsManager();
});

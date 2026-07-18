// ============================================
// الجرد
// ============================================

class InventoryManager {
  constructor() {
    this.inventoryData = [];
    this.branchId = null;
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    // تعيين تاريخ اليوم
    const today = new Date().toISOString().split("T")[0];
    document.getElementById("inventoryDate").value = today;

    await this.loadBranches();
  }

  async loadBranches() {
    try {
      // ✅ خلي الفروع تتضاف مرة واحدة بس
      const select = document.getElementById("inventoryBranch");

      // ✅ لو الـ select فيه خيارات، متضفش تاني
      if (select.options.length > 1) {
        console.log("⚠️ الفروع محملة بالفعل");
        return;
      }

      const response = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true&order=name.asc",
      );

      select.innerHTML = '<option value="">-- اختر الفرع --</option>';

      response.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        select.appendChild(option);
      });

      console.log("✅ تم تحميل الفروع بنجاح");
    } catch (error) {
      console.error("خطأ في تحميل الفروع:", error);
      showToast("حدث خطأ في تحميل الفروع", "error");
    }
  }

  // ============================================
  // تحميل بيانات الجرد (بدون JOIN معقد)
  // ============================================

  async loadInventoryData() {
    const branchId = document.getElementById("inventoryBranch").value;

    if (!branchId) {
      document.getElementById("inventoryTable").style.display = "none";
      return;
    }

    this.branchId = branchId;
    showLoading();

    try {
      console.log("🔄 loadInventoryData بدأت");
      console.log("📦 branchId:", branchId);

      // 1. جلب مخزون الفرع
      const stockResponse = await supabaseRequest(`
            branch_stock?select=product_id,quantity&branch_id=eq.${branchId}
        `);
      console.log("📦 stockResponse:", stockResponse);

      // 2. جلب أسماء المنتجات
      const productIds = [
        ...new Set(
          stockResponse.map((item) => item.product_id).filter((id) => id),
        ),
      ];
      console.log("📦 productIds:", productIds);

      let productMap = {};
      if (productIds.length > 0) {
        // ✅ استخدم or بدل &
        const productQuery = productIds.map((id) => `id.eq.${id}`).join(",");
        const products = await supabaseRequest(
          `products?select=id,name,code,category&or=(${productQuery})`,
        );
        console.log("📦 products from DB:", products);

        for (const p of products) {
          productMap[p.id] = p;
        }
        console.log("📦 productMap:", productMap);
      }

      // 3. دمج البيانات
      this.inventoryData = stockResponse.map((item) => {
        const product = productMap[item.product_id] || {
          name: "غير معروف",
          code: "",
          category: "",
        };
        return {
          product_id: item.product_id,
          product_name: product.name || "غير معروف",
          product_code: product.code || "",
          product_category: product.category || "",
          system_quantity: item.quantity || 0,
          actual_quantity: item.quantity || 0,
          difference: 0,
        };
      });

      console.log("📦 inventoryData:", this.inventoryData);

      this.renderInventoryTable();
    } catch (error) {
      console.error("خطأ في تحميل بيانات الجرد:", error);
      showToast("حدث خطأ في تحميل بيانات الجرد", "error");
    } finally {
      hideLoading();
    }
  }

  renderInventoryTable() {
    const table = document.getElementById("inventoryTable");
    const tbody = document.getElementById("inventoryItemsTable");

    if (!this.inventoryData || this.inventoryData.length === 0) {
      tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted">لا توجد منتجات في هذا الفرع</td>
            </tr>
        `;
      table.style.display = "block";
      return;
    }

    tbody.innerHTML = this.inventoryData
      .map(
        (item, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>
                <strong>${item.product_name}</strong>
                ${item.product_code ? `<br><small class="text-muted">${item.product_code}</small>` : ""}
            </td>
            <td>${item.system_quantity}</td>
            <td>
                <input type="number" class="form-control form-control-custom" 
                       style="width: 100px; display: inline-block;"
                       value="${item.actual_quantity}" 
                       min="0"
                       onchange="updateActualQty(${index}, this.value)">
            </td>
            <td id="difference_${index}">
                <span class="badge ${item.difference === 0 ? "bg-secondary" : item.difference > 0 ? "bg-success" : "bg-danger"}">
                    ${item.difference === 0 ? "متطابق" : item.difference > 0 ? `+${item.difference}` : item.difference}
                </span>
            </td>
        </tr>
    `,
      )
      .join("");

    table.style.display = "block";
  }

  updateActualQty(index, value) {
    const actual = parseInt(value) || 0;
    const item = this.inventoryData[index];

    if (item) {
      item.actual_quantity = actual;
      item.difference = actual - item.system_quantity;

      const diffEl = document.getElementById(`difference_${index}`);
      if (diffEl) {
        const diff = item.difference;
        diffEl.innerHTML = `
                    <span class="badge ${diff === 0 ? "bg-secondary" : diff > 0 ? "bg-success" : "bg-danger"}">
                        ${diff === 0 ? "متطابق" : diff > 0 ? `+${diff}` : diff}
                    </span>
                `;
      }
    }
  }

  // ============================================
  // حفظ الجرد (نسخة مصلحة)
  // ============================================

  async saveInventory() {
    const branchId = this.branchId;
    const inventoryDate = document.getElementById("inventoryDate").value;
    const notes = document.getElementById("inventoryNotes").value.trim();

    if (!branchId) {
      showToast("يرجى اختيار الفرع", "warning");
      return;
    }

    const hasDifferences = this.inventoryData.some(
      (item) => item.difference !== 0,
    );

    if (!hasDifferences) {
      if (!confirm("لا توجد فروقات في الجرد. هل تريد حفظ الجرد؟")) {
        return;
      }
    }

    showLoading();

    try {
      // ✅ الحصول على المستخدم الحالي
      const currentUser = authManager.getCurrentUser();
      const currentProfile = authManager.getCurrentProfile();
      const userId = currentUser?.id || currentProfile?.id || null;

      console.log("👤 المستخدم الحالي:", userId);

      // 1. إنشاء سجل الجرد مع created_by
      const auditData = {
        branch_id: branchId,
        audit_date: inventoryDate,
        notes: notes,
      };

      // ✅ إضافة created_by فقط لو موجود
      if (userId) {
        auditData.created_by = userId;
      }

      console.log("📝 بيانات الجرد:", auditData);

      const auditResult = await supabaseRequest("inventory_audit", {
        method: "POST",
        headers: {
          Prefer: "return=representation",
        },
        body: JSON.stringify(auditData),
      });

      console.log("📊 نتيجة الجرد:", auditResult);

      let auditId = null;
      if (Array.isArray(auditResult) && auditResult.length > 0) {
        auditId = auditResult[0].id;
      } else if (auditResult && auditResult.id) {
        auditId = auditResult.id;
      }

      if (!auditId) {
        throw new Error("لم يتم العثور على ID سجل الجرد");
      }

      // 2. إضافة عناصر الجرد
      for (const item of this.inventoryData) {
        await supabaseRequest("inventory_audit_items", {
          method: "POST",
          body: JSON.stringify({
            audit_id: auditId,
            product_id: item.product_id,
            system_quantity: item.system_quantity,
            actual_quantity: item.actual_quantity,
            difference: item.difference,
            notes: "",
          }),
        });
      }

      // 3. تحديث مخزون الفرع
      for (const item of this.inventoryData) {
        if (item.difference !== 0) {
          await supabaseRequest(
            `branch_stock?branch_id=eq.${branchId}&product_id=eq.${item.product_id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                quantity: item.actual_quantity,
              }),
            },
          );
        }
      }

      showToast("✅ تم حفظ الجرد بنجاح", "success");
      await this.loadInventoryData();
    } catch (error) {
      console.error("❌ خطأ في حفظ الجرد:", error);
      showToast(`❌ حدث خطأ: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }
}

// ============================================
// دوال مساعدة
// ============================================

let inventoryManager;

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

function loadInventoryData() {
  if (inventoryManager) inventoryManager.loadInventoryData();
}

function updateActualQty(index, value) {
  if (inventoryManager) inventoryManager.updateActualQty(index, value);
}

function saveInventory() {
  if (inventoryManager) inventoryManager.saveInventory();
}

document.addEventListener("DOMContentLoaded", () => {
  inventoryManager = new InventoryManager();
});

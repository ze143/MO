// ============================================
// تقارير الجرد
// ============================================

class InventoryReportsManager {
  constructor() {
    this.allAudits = [];
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    await this.loadData();
    await this.loadFilters();
  }

  async loadData() {
    showLoading();
    try {
      await this.loadAudits();
    } catch (error) {
      console.error("خطأ في تحميل البيانات:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  async loadAudits() {
    try {
      console.log("🔄 loadAudits بدأت");

      // 1. جلب سجلات الجرد
      const audits = await supabaseRequest(`
            inventory_audit?select=*&order=audit_date.desc
        `);
      console.log("📦 عدد الجردات:", audits.length);

      // 2. جلب أسماء الفروع
      const branchIds = [
        ...new Set(audits.map((a) => a.branch_id).filter((id) => id)),
      ];
      console.log("📦 branchIds:", branchIds);

      let branchMap = {};
      if (branchIds.length > 0) {
        const branchQuery = branchIds.map((id) => `id.eq.${id}`).join(",");
        const branches = await supabaseRequest(
          `branches?select=id,name&or=(${branchQuery})`,
        );
        console.log("📦 branches from DB:", branches);

        for (const b of branches) {
          branchMap[b.id] = b;
        }
      }

      // 3. ✅ جلب أسماء المستخدمين (created_by)
      const userIds = [
        ...new Set(audits.map((a) => a.created_by).filter((id) => id)),
      ];
      console.log("📦 userIds:", userIds);

      let userMap = {};
      if (userIds.length > 0) {
        // ✅ استخدم or بدل &
        const userQuery = userIds.map((id) => `id.eq.${id}`).join(",");
        const users = await supabaseRequest(
          `profiles?select=id,full_name&or=(${userQuery})`,
        );
        console.log("📦 users from DB:", users);

        // ✅ دمج يدوي
        for (const u of users) {
          userMap[u.id] = u;
        }
        console.log("📦 userMap after merge:", userMap);
      }

      // 4. دمج البيانات
      this.allAudits = audits.map((audit) => {
        // ✅ تأكد من وجود user
        const user = userMap[audit.created_by] || null;
        console.log("🔍 audit.created_by:", audit.created_by);
        console.log("🔍 user found:", user);

        return {
          ...audit,
          branch: branchMap[audit.branch_id] || null,
          user: user,
        };
      });

      console.log("📦 أول جرد مدمج:", this.allAudits[0]);
      console.log("📦 اسم الفرع:", this.allAudits[0]?.branch?.name);
      console.log("📦 اسم المستخدم:", this.allAudits[0]?.user?.full_name);

      // 5. عرض في الجدول
      this.renderTable(this.allAudits);

      // 6. تحميل الإحصائيات لكل جرد
      for (const audit of this.allAudits) {
        this.loadAuditStats(audit.id);
      }
    } catch (error) {
      console.error("❌ خطأ في loadAudits:", error);
    }
  }

  renderTable(audits) {
    const tbody = document.getElementById("inventoryReportsTable");
    if (!audits || audits.length === 0) {
      tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">لا توجد عمليات جرد مسجلة</td>
            </tr>
        `;
      return;
    }

    tbody.innerHTML = audits
      .map((audit, index) => {
        // ✅ تأكد من اسم المستخدم
        const userName =
          audit.user?.full_name || audit.created_by || "غير معروف";

        return `
            <tr style="cursor: pointer;" onclick="showDetails('${audit.id}')">
                <td>${index + 1}</td>
                <td>${audit.branch?.name || "غير معروف"}</td>
                <td>${new Date(audit.audit_date).toLocaleDateString("ar-EG")}</td>
                <td>${userName}</td>
                <td><span class="badge bg-secondary" id="itemCount_${audit.id}">جاري...</span></td>
                <td id="totalDiff_${audit.id}">جاري...</td>
                <td>${audit.notes || "-"}</td>
            </tr>
        `;
      })
      .join("");
  }

  async loadAuditStats(auditId) {
    try {
      const response = await supabaseRequest(`
            inventory_audit_items?select=difference&audit_id=eq.${auditId}
        `);

      const totalItems = response.length;
      const totalDiff = response.reduce(
        (sum, item) => sum + (item.difference || 0),
        0,
      );

      const itemCountEl = document.getElementById(`itemCount_${auditId}`);
      const diffEl = document.getElementById(`totalDiff_${auditId}`);

      if (itemCountEl) itemCountEl.textContent = totalItems;

      if (diffEl) {
        const diffClass =
          totalDiff === 0 ? "secondary" : totalDiff > 0 ? "success" : "danger";
        diffEl.innerHTML = `
                <span class="badge bg-${diffClass}">
                    ${totalDiff === 0 ? "متطابق" : totalDiff > 0 ? `+${totalDiff}` : totalDiff}
                </span>
            `;
      }
    } catch (error) {
      console.error("خطأ في تحميل إحصائيات الجرد:", error);
    }
  }

  async loadFilters() {
    try {
      const response = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true&order=name.asc",
      );
      const select = document.getElementById("filterBranch");

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
    showLoading();
    try {
      const dateFrom = document.getElementById("filterDateFrom").value;
      const dateTo = document.getElementById("filterDateTo").value;
      const branchId = document.getElementById("filterBranch").value;

      let filtered = this.allAudits;

      if (dateFrom) {
        filtered = filtered.filter((a) => a.audit_date >= dateFrom);
      }
      if (dateTo) {
        filtered = filtered.filter((a) => a.audit_date <= dateTo);
      }
      if (branchId !== "all") {
        filtered = filtered.filter((a) => a.branch_id === branchId);
      }

      this.renderTable(filtered);
      showToast("تم تطبيق الفلتر بنجاح", "success");
    } catch (error) {
      console.error("خطأ في تطبيق الفلتر:", error);
      showToast("حدث خطأ في تطبيق الفلتر", "error");
    } finally {
      hideLoading();
    }
  }

  // ============================================
  // عرض تفاصيل الجرد (بدون JOIN معقد)
  // ============================================

  async showDetails(auditId) {
    console.log("🔄 showDetails بدأت");
    console.log("📦 auditId:", auditId);

    if (!auditId || auditId === "undefined") {
      showToast("معرف الجرد غير صحيح", "error");
      return;
    }

    showLoading();
    try {
      // 1. جلب عناصر الجرد
      const items = await supabaseRequest(`
            inventory_audit_items?select=product_id,system_quantity,actual_quantity,difference&audit_id=eq.${auditId}
        `);
      console.log("📦 عدد العناصر:", items.length);

      // 2. جلب أسماء المنتجات
      const productIds = [
        ...new Set(items.map((item) => item.product_id).filter((id) => id)),
      ];
      console.log("📦 productIds:", productIds);

      let productMap = {};
      if (productIds.length > 0) {
        const productQuery = productIds.map((id) => `id.eq.${id}`).join(",");
        const products = await supabaseRequest(
          `products?select=id,name&or=(${productQuery})`,
        );
        console.log("📦 products from DB:", products);

        for (const p of products) {
          productMap[p.id] = p;
        }
      }

      // 3. دمج البيانات
      const itemsWithProducts = items.map((item) => ({
        ...item,
        products: productMap[item.product_id] || { name: "غير معروف" },
      }));
      console.log("📦 itemsWithProducts:", itemsWithProducts);

      // 4. عرض التفاصيل
      const card = document.getElementById("detailsCard");
      const tbody = document.getElementById("detailsTable");

      if (itemsWithProducts.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-muted">لا توجد تفاصيل للجرد</td>
                </tr>
            `;
      } else {
        tbody.innerHTML = itemsWithProducts
          .map(
            (item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.products?.name || "غير معروف"}</td>
                    <td>${item.system_quantity}</td>
                    <td>${item.actual_quantity}</td>
                    <td>
                        <span class="badge ${item.difference === 0 ? "bg-secondary" : item.difference > 0 ? "bg-success" : "bg-danger"}">
                            ${item.difference === 0 ? "متطابق" : item.difference > 0 ? `+${item.difference}` : item.difference}
                        </span>
                    </td>
                </tr>
            `,
          )
          .join("");
      }

      card.style.display = "block";
      card.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      console.error("❌ خطأ في تحميل تفاصيل الجرد:", error);
      showToast("حدث خطأ في تحميل التفاصيل", "error");
    } finally {
      hideLoading();
    }
  }

  closeDetails() {
    document.getElementById("detailsCard").style.display = "none";
  }
}

// ============================================
// دوال مساعدة
// ============================================

let reportsManager;

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
  if (reportsManager) reportsManager.applyFilters();
}

function showDetails(auditId) {
  if (reportsManager) reportsManager.showDetails(auditId);
}

function closeDetails() {
  if (reportsManager) reportsManager.closeDetails();
}

document.addEventListener("DOMContentLoaded", () => {
  reportsManager = new InventoryReportsManager();
});

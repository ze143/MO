// ============================================
// تقارير الإقفال
// ============================================

class DayClosingReportsManager {
  constructor() {
    this.allClosings = [];
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
      await Promise.all([this.loadClosings(), this.loadStats()]);
    } catch (error) {
      console.error("خطأ في تحميل البيانات:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  async loadClosings() {
    try {
      console.log("🔄 loadClosings بدأت");

      // 1. جلب الإقفالات
      const closings = await supabaseRequest(`
            day_closing?select=*&order=closing_date.desc
        `);
      console.log("📦 عدد الإقفالات:", closings.length);

      // 2. جلب أسماء الفروع
      const branchIds = [
        ...new Set(closings.map((c) => c.branch_id).filter((id) => id)),
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

      // 3. جلب أسماء المستخدمين (closed_by)
      const userIds = [
        ...new Set(closings.map((c) => c.closed_by).filter((id) => id)),
      ];
      console.log("📦 userIds:", userIds);

      let userMap = {};
      if (userIds.length > 0) {
        const userQuery = userIds.map((id) => `id.eq.${id}`).join(",");
        const users = await supabaseRequest(
          `profiles?select=id,full_name&or=(${userQuery})`,
        );
        console.log("📦 users from DB:", users);

        for (const u of users) {
          userMap[u.id] = u;
        }
      }

      // 4. دمج البيانات
      this.allClosings = closings.map((closing) => {
        return {
          ...closing,
          branch: branchMap[closing.branch_id] || null,
          user: userMap[closing.closed_by] || null,
        };
      });

      console.log("📦 أول إقفال مدمج:", this.allClosings[0]);
      console.log("📦 اسم الفرع:", this.allClosings[0]?.branch?.name);
      console.log("📦 اسم المستخدم:", this.allClosings[0]?.user?.full_name);

      // 5. عرض في الجدول
      this.renderTable(this.allClosings);
    } catch (error) {
      console.error("❌ خطأ في loadClosings:", error);
    }
  }

  renderTable(closings) {
    const tbody = document.getElementById("closingsTable");
    if (!closings || closings.length === 0) {
      tbody.innerHTML = `
            <tr>
                <td colspan="7" class="text-center text-muted">لا توجد عمليات إقفال مسجلة</td>
            </tr>
        `;
      return;
    }

    tbody.innerHTML = closings
      .map(
        (closing, index) => `
        <tr>
            <td>${index + 1}</td>
            <td>${closing.branch?.name || "غير معروف"}</td>
            <td>${new Date(closing.closing_date).toLocaleDateString("ar-EG")}</td>
            <td><strong>${closing.total_items}</strong></td>
            <td>${closing.user?.full_name || "غير معروف"}</td>
            <td>${new Date(closing.created_at).toLocaleString("ar-EG")}</td>
            <td>
                <button class="btn btn-sm btn-info" onclick="showClosingDetails('${closing.id}', '${closing.branch?.name || "غير معروف"}', '${closing.closing_date}')">
                    <i class="fas fa-eye"></i> عرض
                </button>
            </td>
        </tr>
    `,
      )
      .join("");
  }

  async loadStats() {
    try {
      const response = await supabaseRequest(
        "day_closing?select=id,total_items",
      );

      document.getElementById("totalClosings").textContent = response.length;

      const totalItems = response.reduce(
        (sum, c) => sum + (c.total_items || 0),
        0,
      );
      document.getElementById("totalItemsClosed").textContent = totalItems;
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
    showLoading();
    try {
      const dateFrom = document.getElementById("filterDateFrom").value;
      const dateTo = document.getElementById("filterDateTo").value;
      const branchId = document.getElementById("filterBranch").value;

      let filtered = this.allClosings;

      if (dateFrom) {
        filtered = filtered.filter((c) => c.closing_date >= dateFrom);
      }
      if (dateTo) {
        filtered = filtered.filter((c) => c.closing_date <= dateTo);
      }
      if (branchId !== "all") {
        filtered = filtered.filter((c) => c.branch_id === branchId);
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
  // عرض تفاصيل الإقفال (داخل الكلاس)
  // ============================================

  async showClosingDetails(closingId, branchName, closingDate) {
    showLoading();
    try {
      console.log("🔄 showClosingDetails بدأت");
      console.log("📦 closingId:", closingId);

      // 1. جلب تفاصيل الإقفال (المبيعات المقفلة)
      const closingRecord = await supabaseRequest(`
            day_closing?select=branch_id,closing_date&id=eq.${closingId}
        `);
      console.log("📦 closingRecord:", closingRecord);

      if (!closingRecord || closingRecord.length === 0) {
        showToast("لم يتم العثور على سجل الإقفال", "error");
        hideLoading();
        return;
      }

      const branchId = closingRecord[0].branch_id;
      const closingDateStr = closingRecord[0].closing_date;
      console.log("📦 branchId:", branchId);
      console.log("📦 closingDate:", closingDateStr);

      // 2. جلب المبيعات المقفلة لهذا اليوم
      const sales = await supabaseRequest(`
            daily_sales?select=product_id,quantity&branch_id=eq.${branchId}&sale_date=eq.${closingDateStr}&is_closed=eq.true
        `);
      console.log("📦 عدد المبيعات:", sales.length);

      // 3. جلب أسماء المنتجات
      const productIds = [
        ...new Set(sales.map((s) => s.product_id).filter((id) => id)),
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

      // 4. دمج البيانات
      const salesWithProducts = sales.map((item) => ({
        ...item,
        product_name: productMap[item.product_id]?.name || "غير معروف",
      }));
      console.log("📦 salesWithProducts:", salesWithProducts);

      // 5. عرض التفاصيل
      const card = document.getElementById("detailsCard");
      const tbody = document.getElementById("closingDetailsTable");
      const totalItems = salesWithProducts.reduce(
        (sum, s) => sum + s.quantity,
        0,
      );

      // تحديث المعلومات
      document.getElementById("detailsBranchName").textContent =
        `الفرع: ${branchName}`;
      document.getElementById("detailsClosingDate").textContent =
        `التاريخ: ${new Date(closingDateStr).toLocaleDateString("ar-EG")}`;
      document.getElementById("detailsTotalItems").textContent = totalItems;

      if (salesWithProducts.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-muted">لا توجد مبيعات مقفلة في هذا اليوم</td>
                </tr>
            `;
      } else {
        tbody.innerHTML = salesWithProducts
          .map(
            (item, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${item.product_name}</td>
                    <td><strong>${item.quantity}</strong></td>
                </tr>
            `,
          )
          .join("");
      }

      card.style.display = "block";
      card.scrollIntoView({ behavior: "smooth" });
    } catch (error) {
      console.error("❌ خطأ في تحميل تفاصيل الإقفال:", error);
      showToast("حدث خطأ في تحميل التفاصيل", "error");
    } finally {
      hideLoading();
    }
  }

  closeClosingDetails() {
    document.getElementById("detailsCard").style.display = "none";
  }
}

// ============================================
// دوال مساعدة (خارج الكلاس)
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

// ✅ دوال جديدة
function showClosingDetails(closingId, branchName, closingDate) {
  if (reportsManager)
    reportsManager.showClosingDetails(closingId, branchName, closingDate);
}

function closeClosingDetails() {
  if (reportsManager) reportsManager.closeClosingDetails();
}

document.addEventListener("DOMContentLoaded", () => {
  reportsManager = new DayClosingReportsManager();
});

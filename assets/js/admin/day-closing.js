// ============================================
// إقفال اليوم
// ============================================

class DayClosingManager {
  constructor() {
    this.currentBranchId = null;
    this.currentSales = [];
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    const today = new Date().toISOString().split("T")[0];
    document.getElementById("closingDate").value = today;

    await this.loadBranches();
  }

  async loadBranches() {
    try {
      const response = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true&order=name.asc",
      );

      const select = document.getElementById("closingBranch");
      response.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        select.appendChild(option);
      });
    } catch (error) {
      console.error("خطأ في تحميل الفروع:", error);
      showToast("حدث خطأ في تحميل الفروع", "error");
    }
  }

  // ============================================
  // تحميل مبيعات الفرع
  // ============================================

  async loadBranchSales() {
    const branchId = document.getElementById("closingBranch").value;
    const closingDate = document.getElementById("closingDate").value;

    if (!branchId || !closingDate) {
      document.getElementById("salesPreview").style.display = "none";
      return;
    }

    this.currentBranchId = branchId;

    showLoading();

    try {
      // 1. التحقق من وجود إقفال سابق
      const closingCheck = await supabaseRequest(`
            day_closing?select=id&branch_id=eq.${branchId}&closing_date=eq.${closingDate}
        `);

      if (closingCheck.length > 0) {
        showToast("تم إقفال هذا اليوم مسبقاً لهذا الفرع", "warning");
        document.getElementById("salesPreview").style.display = "block";
        document.getElementById("salesPreviewTable").innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-warning">
                        ⚠️ هذا اليوم مقفل مسبقاً
                    </td>
                </tr>
            `;
        document.getElementById("salesPreviewCount").textContent = "0 قطعة";
        document.getElementById("closeDayBtn").disabled = true;
        hideLoading();
        return;
      }

      // 2. جلب المبيعات غير المقفلة
      const salesResponse = await supabaseRequest(`
            daily_sales?select=id,product_id,quantity&branch_id=eq.${branchId}&sale_date=eq.${closingDate}&is_closed=eq.false
        `);
      console.log("📦 salesResponse:", salesResponse);

      // 3. جلب أسماء المنتجات
      const productIds = [
        ...new Set(
          salesResponse.map((item) => item.product_id).filter((id) => id),
        ),
      ];
      console.log("📦 productIds:", productIds);

      let productMap = {};
      if (productIds.length > 0) {
        // ✅ استخدم or بدل &
        const productQuery = productIds.map((id) => `id.eq.${id}`).join(",");
        const products = await supabaseRequest(
          `products?select=id,name&or=(${productQuery})`,
        );
        console.log("📦 products from DB:", products);

        for (const p of products) {
          productMap[p.id] = p;
        }
        console.log("📦 productMap:", productMap);
      }

      // 4. دمج البيانات
      const salesWithProducts = salesResponse.map((sale) => {
        const product = productMap[sale.product_id] || { name: "غير معروف" };
        return {
          ...sale,
          products: product,
        };
      });

      this.currentSales = salesWithProducts;
      console.log("📦 this.currentSales:", this.currentSales);

      const previewDiv = document.getElementById("salesPreview");
      const tbody = document.getElementById("salesPreviewTable");

      // ✅ خليه يظهر دايماً
      previewDiv.style.display = "block";

      if (salesWithProducts.length === 0) {
        tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-muted">
                        ✅ لا توجد مبيعات غير مقفلة لهذا اليوم
                    </td>
                </tr>
            `;
        document.getElementById("salesPreviewCount").textContent = "0 قطعة";
        document.getElementById("closeDayBtn").disabled = true;
        hideLoading();
        return;
      }

      const totalItems = salesWithProducts.reduce(
        (sum, s) => sum + s.quantity,
        0,
      );
      document.getElementById("salesPreviewCount").textContent =
        `${totalItems} قطعة`;

      tbody.innerHTML = salesWithProducts
        .map(
          (sale, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td>${sale.products?.name || "غير معروف"}</td>
                    <td>${sale.quantity}</td>
                </tr>
            `,
        )
        .join("");

      document.getElementById("closeDayBtn").disabled = false;
    } catch (error) {
      console.error("خطأ في تحميل مبيعات اليوم:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  // ============================================
  // تأكيد إقفال اليوم
  // ============================================

  async confirmClosing() {
    const branchId = this.currentBranchId;
    const closingDate = document.getElementById("closingDate").value;

    if (!branchId || !closingDate) {
      showToast("يرجى اختيار الفرع والتاريخ", "warning");
      return;
    }

    if (this.currentSales.length === 0) {
      showToast("لا توجد مبيعات لإقفالها", "warning");
      return;
    }

    const totalItems = this.currentSales.reduce(
      (sum, s) => sum + s.quantity,
      0,
    );

    if (
      !confirm(
        `هل أنت متأكد من إقفال اليوم لفرع ${document.getElementById("closingBranch").options[document.getElementById("closingBranch").selectedIndex].text}؟\n\nإجمالي القطع: ${totalItems}\n\nهذا الإجراء نهائي ولا يمكن التراجع عنه!`,
      )
    ) {
      return;
    }

    showLoading();

    try {
      await supabaseRequest("rpc/close_day", {
        method: "POST",
        body: JSON.stringify({
          p_branch_id: branchId,
          p_closing_date: closingDate,
        }),
      });

      showToast("تم إقفال اليوم بنجاح", "success");

      authManager.notifyPageUpdate({
        type: "day_closed",
        branchId: branchId,
        date: closingDate,
      });

      await this.loadBranchSales();
    } catch (error) {
      console.error("خطأ في إقفال اليوم:", error);
      showToast(`حدث خطأ في إقفال اليوم: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  // ============================================
  // فتح اليوم لفرع معين
  // ============================================

  async confirmReopen() {
    const branchId = this.currentBranchId;
    const closingDate = document.getElementById("closingDate").value;

    if (!branchId || !closingDate) {
      showToast("يرجى اختيار الفرع والتاريخ", "warning");
      return;
    }

    // التحقق من وجود إقفال
    const closingCheck = await supabaseRequest(`
            day_closing?select=id&branch_id=eq.${branchId}&closing_date=eq.${closingDate}
        `);

    if (closingCheck.length === 0) {
      showToast("⚠️ هذا اليوم غير مقفل أساساً", "warning");
      return;
    }

    const branchName =
      document.getElementById("closingBranch").options[
        document.getElementById("closingBranch").selectedIndex
      ].text;

    if (
      !confirm(
        `⚠️ هل أنت متأكد من فتح اليوم؟\n\nالفرع: ${branchName}\nالتاريخ: ${closingDate}\n\nسيتم فتح اليوم وإعادة المخزون للطبيعي!`,
      )
    ) {
      return;
    }

    await this.reopenDay(branchId, closingDate);
  }

  // ============================================
  // دالة فتح اليوم (قابلة لإعادة الاستخدام)
  // ============================================

  async reopenDay(branchId, closingDate) {
    showLoading();

    try {
      // 1. حذف سجل الإقفال
      await supabaseRequest(
        `day_closing?branch_id=eq.${branchId}&closing_date=eq.${closingDate}`,
        {
          method: "DELETE",
        },
      );

      // 2. فتح المبيعات
      await supabaseRequest(
        `
                daily_sales?branch_id=eq.${branchId}&sale_date=eq.${closingDate}&is_closed=eq.true
            `,
        {
          method: "PATCH",
          body: JSON.stringify({
            is_closed: false,
            closed_at: null,
          }),
        },
      );

      // 3. إعادة المخزون
      const sales = await supabaseRequest(`
                daily_sales?select=product_id,quantity&branch_id=eq.${branchId}&sale_date=eq.${closingDate}
            `);

      for (const sale of sales) {
        const stock = await supabaseRequest(`
                    branch_stock?select=quantity&branch_id=eq.${branchId}&product_id=eq.${sale.product_id}
                `);

        if (stock.length > 0) {
          await supabaseRequest(
            `
                        branch_stock?branch_id=eq.${branchId}&product_id=eq.${sale.product_id}
                    `,
            {
              method: "PATCH",
              body: JSON.stringify({
                quantity: stock[0].quantity + sale.quantity,
              }),
            },
          );
        }
      }

      showToast(`✅ تم فتح اليوم ${closingDate} بنجاح`, "success");

      await this.loadBranchSales();

      authManager.notifyPageUpdate({
        type: "day_reopened",
        branchId: branchId,
        date: closingDate,
      });
    } catch (error) {
      console.error("خطأ في فتح اليوم:", error);
      showToast(`❌ حدث خطأ: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  // ============================================
  // فتح أيام متعددة
  // ============================================

  async reopenMultipleDays() {
    const branchId = document.getElementById("reopenAllBranch").value;
    const type = document.getElementById("reopenAllType").value;

    if (!branchId) {
      showToast("يرجى اختيار الفرع", "warning");
      return;
    }

    let dates = [];

    if (type === "single") {
      const date = document.getElementById("reopenDate").value;
      if (!date) {
        showToast("يرجى اختيار التاريخ", "warning");
        return;
      }
      dates = [date];
    } else if (type === "range") {
      const from = document.getElementById("reopenDateFrom").value;
      const to = document.getElementById("reopenDateTo").value;
      if (!from || !to) {
        showToast("يرجى اختيار نطاق التواريخ", "warning");
        return;
      }
      let current = new Date(from);
      const end = new Date(to);
      while (current <= end) {
        dates.push(current.toISOString().split("T")[0]);
        current.setDate(current.getDate() + 1);
      }
    } else if (type === "all") {
      const closedDays = await supabaseRequest(`
                day_closing?select=closing_date&branch_id=eq.${branchId}
            `);
      dates = closedDays.map((d) => d.closing_date);
    }

    if (dates.length === 0) {
      showToast("لا توجد أيام مقفلة للفتح", "warning");
      return;
    }

    const branchName =
      document.getElementById("reopenAllBranch").options[
        document.getElementById("reopenAllBranch").selectedIndex
      ].text;
    if (
      !confirm(
        `⚠️ هل أنت متأكد من فتح ${dates.length} يوم للفرع ${branchName}؟`,
      )
    ) {
      return;
    }

    showLoading();

    try {
      let successCount = 0;
      let failCount = 0;

      for (const date of dates) {
        try {
          await this.reopenDay(branchId, date);
          successCount++;
        } catch (e) {
          failCount++;
          console.error(`فشل فتح ${date}:`, e);
        }
      }

      showToast(
        `✅ تم فتح ${successCount} يوم بنجاح${failCount > 0 ? `، فشل ${failCount} يوم` : ""}`,
        successCount > 0 ? "success" : "error",
      );

      bootstrap.Modal.getInstance(
        document.getElementById("reopenAllModal"),
      ).hide();
      await this.loadBranchSales();
    } catch (error) {
      console.error("خطأ:", error);
      showToast("❌ حدث خطأ", "error");
    } finally {
      hideLoading();
    }
  }

  // ============================================
  // عرض مودال فتح الأيام المتعددة
  // ============================================

  async showReopenAllModal() {
    const select = document.getElementById("reopenAllBranch");
    select.innerHTML = '<option value="">-- اختر الفرع --</option>';

    const branches = await supabaseRequest(
      "branches?select=id,name&is_active=eq.true",
    );
    branches.forEach((branch) => {
      const option = document.createElement("option");
      option.value = branch.id;
      option.textContent = branch.name;
      select.appendChild(option);
    });

    const today = new Date().toISOString().split("T")[0];
    document.getElementById("reopenDate").value = today;
    document.getElementById("reopenDateFrom").value = today;
    document.getElementById("reopenDateTo").value = today;

    document
      .getElementById("reopenAllType")
      .addEventListener("change", function () {
        document.getElementById("reopenSingleDate").style.display =
          this.value === "single" ? "block" : "none";
        document.getElementById("reopenRangeDates").style.display =
          this.value === "range" ? "block" : "none";
        document.getElementById("reopenAllInfo").style.display =
          this.value === "all" ? "block" : "none";
      });

    new bootstrap.Modal(document.getElementById("reopenAllModal")).show();
  }
}

// ============================================
// دوال مساعدة (خارج الكلاس)
// ============================================

let closingManager;

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

function loadBranchSales() {
  if (closingManager) closingManager.loadBranchSales();
}

function confirmClosing() {
  if (closingManager) closingManager.confirmClosing();
}

function confirmReopen() {
  if (closingManager) closingManager.confirmReopen();
}

function showReopenAllModal() {
  if (closingManager) closingManager.showReopenAllModal();
}

function reopenMultipleDays() {
  if (closingManager) closingManager.reopenMultipleDays();
}

document.addEventListener("DOMContentLoaded", () => {
  closingManager = new DayClosingManager();
});

// ✅ تصدير closingManager للاستخدام في الـ HTML
window.closingManager = closingManager;

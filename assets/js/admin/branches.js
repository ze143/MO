// ============================================
// إدارة الفروع
// ============================================

class BranchesManager {
  constructor() {
    this.branchModal = null;
    this.userModal = null;
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    // تهيئة الـ Modals
    this.branchModal = new bootstrap.Modal(
      document.getElementById("branchModal"),
    );
    this.userModal = new bootstrap.Modal(document.getElementById("userModal"));

    // تحميل البيانات
    await this.loadBranches();
  }

  async loadBranches() {
    try {
      const response = await supabaseRequest(
        "branches?select=*&order=created_at.desc",
      );

      const tbody = document.getElementById("branchesTable");
      if (response.length === 0) {
        tbody.innerHTML = `
                    <tr>
                        <td colspan="7" class="text-center text-muted">لا توجد فروع مسجلة</td>
                    </tr>
                `;
        return;
      }

      tbody.innerHTML = response
        .map(
          (branch, index) => `
                <tr>
                    <td>${index + 1}</td>
                    <td><strong>${branch.code}</strong></td>
                    <td>${branch.name}</td>
                    <td>${branch.manager_name || "-"}</td>
                    <td>${branch.phone || "-"}</td>
                    <td>
                        <span class="badge-status ${branch.is_active ? "active" : "inactive"}">
                            ${branch.is_active ? "نشط" : "غير نشط"}
                        </span>
                    </td>
                    <td>
                        <button class="btn btn-sm btn-warning" onclick="editBranch('${branch.id}')">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="btn btn-sm btn-info" onclick="showCreateUser('${branch.id}')">
                            <i class="fas fa-user-plus"></i>
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteBranch('${branch.id}')">
                            <i class="fas fa-trash"></i>
                        </button>
                    </td>
                </tr>
            `,
        )
        .join("");
    } catch (error) {
      console.error("خطأ في تحميل الفروع:", error);
      showToast("حدث خطأ في تحميل الفروع", "error");
    }
  }

  showAddBranch() {
    document.getElementById("branchModalTitle").textContent = "إضافة فرع جديد";
    document.getElementById("editBranchId").value = "";
    document.getElementById("branchForm").reset();
    document.getElementById("branchActive").checked = true;
    this.branchModal.show();
  }

  async editBranch(id) {
    try {
      const response = await supabaseRequest(`branches?id=eq.${id}`);
      if (response.length === 0) {
        showToast("الفرع غير موجود", "error");
        return;
      }

      const branch = response[0];
      document.getElementById("branchModalTitle").textContent = "تعديل الفرع";
      document.getElementById("editBranchId").value = branch.id;
      document.getElementById("branchName").value = branch.name;
      document.getElementById("branchCode").value = branch.code;
      document.getElementById("branchManager").value =
        branch.manager_name || "";
      document.getElementById("branchPhone").value = branch.phone || "";
      document.getElementById("branchAddress").value = branch.address || "";
      document.getElementById("branchActive").checked = branch.is_active;

      this.branchModal.show();
    } catch (error) {
      console.error("خطأ في تحميل بيانات الفرع:", error);
      showToast("حدث خطأ في تحميل بيانات الفرع", "error");
    }
  }

  async saveBranch() {
    const id = document.getElementById("editBranchId").value;
    const data = {
      name: document.getElementById("branchName").value.trim(),
      code: document.getElementById("branchCode").value.trim(),
      manager_name: document.getElementById("branchManager").value.trim(),
      phone: document.getElementById("branchPhone").value.trim(),
      address: document.getElementById("branchAddress").value.trim(),
      is_active: document.getElementById("branchActive").checked,
    };

    if (!data.name || !data.code) {
      showToast("يرجى إدخال اسم الفرع والكود", "warning");
      return;
    }

    showLoading();

    try {
      if (id) {
        // تحديث
        await supabaseRequest(`branches?id=eq.${id}`, {
          method: "PATCH",
          body: JSON.stringify(data),
        });
        showToast("تم تحديث الفرع بنجاح", "success");
      } else {
        // إضافة
        await supabaseRequest("branches", {
          method: "POST",
          body: JSON.stringify(data),
        });
        showToast("تم إضافة الفرع بنجاح", "success");
      }

      this.branchModal.hide();
      await this.loadBranches();
    } catch (error) {
      console.error("خطأ في حفظ الفرع:", error);
      showToast("حدث خطأ في حفظ الفرع", "error");
    } finally {
      hideLoading();
    }
  }

  async deleteBranch(id) {
    if (!confirm("هل أنت متأكد من حذف هذا الفرع؟")) return;

    showLoading();

    try {
      await supabaseRequest(`branches?id=eq.${id}`, { method: "DELETE" });
      showToast("تم حذف الفرع بنجاح", "success");
      await this.loadBranches();
    } catch (error) {
      console.error("خطأ في حذف الفرع:", error);
      showToast("حدث خطأ في حذف الفرع", "error");
    } finally {
      hideLoading();
    }
  }

  showCreateUser(branchId) {
    document.getElementById("userBranchId").value = branchId;
    document.getElementById("userForm").reset();
    this.userModal.show();
  }

  // ============================================
  // إنشاء مستخدم جديد (بعد تعديل الجدول)
  // ============================================

  async saveUser() {
    const branchId = document.getElementById("userBranchId").value;
    const username = document.getElementById("userUsername").value.trim();
    const fullName = document.getElementById("userFullName").value.trim();
    const password = document.getElementById("userPassword").value;
    const phone = document.getElementById("userPhone").value.trim();

    if (!username || !fullName || !password) {
      showToast("يرجى ملء جميع الحقول المطلوبة", "warning");
      return;
    }

    if (password.length < 6) {
      showToast("كلمة المرور يجب أن تكون 6 أحرف على الأقل", "warning");
      return;
    }

    if (!branchId) {
      showToast("يرجى اختيار الفرع", "warning");
      return;
    }

    showLoading();

    try {
      // 🔥 بدون ID - سيتولد تلقائياً من Supabase
      const data = {
        username: username,
        full_name: fullName,
        role: "branch_user",
        branch_id: branchId,
        phone: phone || "",
        is_active: true,
        password: password,
      };

      console.log("📝 إرسال البيانات:", data);

      const result = await supabaseRequest("profiles", {
        method: "POST",
        body: JSON.stringify(data),
      });

      console.log("✅ النتيجة:", result);

      showToast(
        `✅ تم إنشاء المستخدم: ${username} - كلمة المرور: ${password}`,
        "success",
      );
      this.userModal.hide();

      setTimeout(() => {
        location.reload();
      }, 1500);
    } catch (error) {
      console.error("❌ خطأ:", error);

      let errorMsg = "حدث خطأ في إنشاء المستخدم";
      if (error.message.includes("duplicate")) {
        errorMsg = "اسم المستخدم موجود مسبقاً";
      } else if (error.message.includes("foreign key")) {
        errorMsg = "الفرع غير موجود، تأكد من اختيار فرع صحيح";
      }

      showToast(`❌ ${errorMsg}`, "error");
    } finally {
      hideLoading();
    }
  }
}

// ============================================
// دوال مساعدة
// ============================================

let branchesManager;

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

function showAddBranchModal() {
  if (branchesManager) branchesManager.showAddBranch();
}

function editBranch(id) {
  if (branchesManager) branchesManager.editBranch(id);
}

function deleteBranch(id) {
  if (branchesManager) branchesManager.deleteBranch(id);
}

function showCreateUser(id) {
  if (branchesManager) branchesManager.showCreateUser(id);
}

function saveBranch() {
  if (branchesManager) branchesManager.saveBranch();
}

function saveUser() {
  if (branchesManager) branchesManager.saveUser();
}

// ============================================
// تهيئة الصفحة
// ============================================

document.addEventListener("DOMContentLoaded", () => {
  branchesManager = new BranchesManager();
});

// ============================================
// نظام المصادقة والصلاحيات
// ============================================

class AuthManager {
  constructor() {
    this.supabaseUrl = SUPABASE_CONFIG.URL;
    this.supabaseKey = SUPABASE_CONFIG.ANON_KEY;
    this.currentUser = null;
    this.currentProfile = null;
    this.init();
  }

  // ============================================
  // التهيئة
  // ============================================
  init() {
    // التحقق من وجود جلسة نشطة
    this.checkSession();

    // إضافة مستمع لتغيير حالة المصادقة
    window.addEventListener("storage", (e) => {
      if (e.key === "supabase.auth.token") {
        this.checkSession();
      }
    });
  }

  // ============================================
  // التحقق من الجلسة
  // ============================================
  async checkSession() {
    try {
      const session = localStorage.getItem("mo_session");
      if (session) {
        const data = JSON.parse(session);
        this.currentUser = data.user;
        this.currentProfile = data.profile;

        // التحقق من صلاحية التوكن
        if (this.currentUser && this.currentUser.expires_at) {
          const now = Math.floor(Date.now() / 1000);
          if (this.currentUser.expires_at < now) {
            this.logout();
            return;
          }
        }

        return this.currentUser;
      }
      return null;
    } catch (error) {
      console.error("خطأ في التحقق من الجلسة:", error);
      return null;
    }
  }

  // ============================================
  // تسجيل الدخول (من جدول profiles مباشرة)
  // ============================================

  async login(username, password) {
    try {
      console.log("🔍 محاولة تسجيل الدخول:", username);

      // 1. البحث عن المستخدم في جدول profiles
      const response = await fetch(
        `${this.supabaseUrl}profiles?username=eq.${username}&select=*`,
        {
          headers: {
            apikey: this.supabaseKey,
            Authorization: `Bearer ${this.supabaseKey}`,
          },
        },
      );

      if (!response.ok) {
        throw new Error(`خطأ في الاتصال: ${response.status}`);
      }

      const profiles = await response.json();

      if (!profiles || profiles.length === 0) {
        showToast("❌ اسم المستخدم غير صحيح", "error");
        return null;
      }

      const profile = profiles[0];
      console.log("👤 المستخدم:", profile);

      // 2. التحقق من كلمة المرور
      const storedPassword = profile.password || "123456";

      if (password !== storedPassword) {
        showToast("❌ كلمة المرور غير صحيحة", "error");
        return null;
      }

      // 3. التحقق من نشاط الحساب
      if (!profile.is_active) {
        showToast("❌ الحساب غير مفعل", "error");
        return null;
      }

      // 4. إنشاء جلسة
      const sessionData = {
        user: {
          id: profile.id,
          username: profile.username,
          role: profile.role,
          full_name: profile.full_name,
          branch_id: profile.branch_id,
          expires_at: Math.floor(Date.now() / 1000) + 86400,
        },
        profile: profile,
        timestamp: Date.now(),
      };

      localStorage.setItem("mo_session", JSON.stringify(sessionData));
      console.log("✅ تم حفظ الجلسة:", sessionData);

      this.currentUser = sessionData.user;
      this.currentProfile = profile;

      showToast(`👋 مرحباً ${profile.full_name}`, "success");
      return sessionData;
    } catch (error) {
      console.error("❌ خطأ في تسجيل الدخول:", error);
      showToast(`❌ حدث خطأ: ${error.message}`, "error");
      return null;
    }
  }

  // ============================================
  // التحقق من كلمة المرور (محاكاة)
  // ============================================
  verifyPassword(profile, password) {
    // في الإنتاج، استخدم Supabase Auth API
    // هذه محاكاة للتجربة فقط
    // كلمة المرور الافتراضية: 123456
    return password === "123456";
  }

  // ============================================
  // تسجيل الخروج
  // ============================================
  logout() {
    localStorage.removeItem("mo_session");
    this.currentUser = null;
    this.currentProfile = null;
    window.location.href = "/pages/login.html";
  }

  // ============================================
  // الحصول على المستخدم الحالي
  // ============================================
  getCurrentUser() {
    return this.currentUser;
  }

  // ============================================
  // الحصول على الملف الشخصي
  // ============================================
  getCurrentProfile() {
    return this.currentProfile;
  }

  // ============================================
  // التحقق من الصلاحيات
  // ============================================
  hasRole(role) {
    if (!this.currentUser) return false;
    return this.currentUser.role === role;
  }

  isAdmin() {
    return this.hasRole(ROLES.ADMIN);
  }

  isBranchUser() {
    return this.hasRole(ROLES.BRANCH_USER);
  }

  isOwner() {
    return this.hasRole(ROLES.OWNER);
  }

  // ============================================
  // الحصول على الفرع الخاص بالمستخدم
  // ============================================
  getBranchId() {
    if (this.currentProfile && this.currentProfile.branch_id) {
      return this.currentProfile.branch_id;
    }
    return null;
  }

  // ============================================
  // التحقق من المصادقة
  // ============================================
  requireAuth(redirectToLogin = true) {
    if (!this.currentUser) {
      if (redirectToLogin) {
        window.location.href = "/pages/login.html";
      }
      return false;
    }
    return true;
  }

  // ============================================
  // التحقق من صلاحية الدور
  // ============================================
  requireRole(role, redirectTo = null) {
    if (!this.requireAuth()) return false;

    if (this.currentUser.role !== role) {
      if (redirectTo) {
        window.location.href = redirectTo;
      } else {
        // توجيه إلى الصفحة المناسبة حسب الدور
        switch (this.currentUser.role) {
          case ROLES.ADMIN:
            window.location.href = PAGES.ADMIN_DASHBOARD;
            break;
          case ROLES.BRANCH_USER:
            window.location.href = PAGES.BRANCH_DASHBOARD;
            break;
          case ROLES.OWNER:
            window.location.href = PAGES.OWNER_DASHBOARD;
            break;
          default:
            window.location.href = PAGES.LOGIN;
        }
      }
      return false;
    }
    return true;
  }

  // ============================================
  // تحديث الصفحات المفتوحة
  // ============================================
  notifyPageUpdate(data) {
    localStorage.setItem(
      "mo_page_update",
      JSON.stringify({
        timestamp: Date.now(),
        data: data,
      }),
    );
  }

  // ============================================
  // الاستماع لتحديثات الصفحة
  // ============================================
  listenForUpdates(callback) {
    window.addEventListener("storage", (e) => {
      if (e.key === "mo_page_update") {
        const update = JSON.parse(e.newValue);
        if (update && callback) {
          callback(update.data);
        }
      }
    });
  }
}

// ============================================
// إنشاء نسخة واحدة من مدير المصادقة
// ============================================
const authManager = new AuthManager();

// ============================================
// دالة عرض الإشعارات (Toast)
// ============================================
function showToast(message, type = "info", duration = 4000) {
  const container =
    document.getElementById("toastContainer") ||
    (() => {
      const div = document.createElement("div");
      div.id = "toastContainer";
      div.className = "toast-container";
      document.body.appendChild(div);
      return div;
    })();

  const icons = {
    success: "✅",
    error: "❌",
    warning: "⚠️",
    info: "ℹ️",
  };

  const toast = document.createElement("div");
  toast.className = `toast-custom ${type}`;
  toast.innerHTML = `
        <span class="toast-icon">${icons[type] || "ℹ️"}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" onclick="this.parentElement.remove()">✕</button>
    `;

  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100px)";
      setTimeout(() => toast.remove(), 300);
    }
  }, duration);
}

// ============================================
// دالة عرض شاشة التحميل
// ============================================
function showLoading() {
  let loading = document.getElementById("loadingScreen");
  if (!loading) {
    loading = document.createElement("div");
    loading.id = "loadingScreen";
    loading.className = "loading-screen";
    loading.innerHTML = `
            <div class="spinner"></div>
            <p style="color: var(--primary-color); font-weight: 600;">جاري التحميل...</p>
        `;
    document.body.appendChild(loading);
  }
  loading.style.display = "flex";
}

function hideLoading() {
  const loading = document.getElementById("loadingScreen");
  if (loading) {
    loading.style.display = "none";
  }
}

// ============================================
// دالة مساعدة لتصحيح بيانات Supabase
// ============================================

function fixSupabaseData(data) {
  if (Array.isArray(data)) {
    return data.map((item) => {
      const fixed = { ...item };
      // تصحيح أي حقل قد يكون مصفوفة
      Object.keys(fixed).forEach((key) => {
        if (Array.isArray(fixed[key]) && fixed[key].length === 1) {
          fixed[key] = fixed[key][0];
        }
      });
      return fixed;
    });
  }
  return data;
}

// ============================================
// دالة مساعدة لطلبات Supabase (النسخة النهائية)
// ============================================
async function supabaseRequest(endpoint, options = {}) {
  // تنظيف endpoint
  endpoint = endpoint.trim();

  const url = `https://lxolskydwrnkefanzamv.supabase.co/rest/v1/${endpoint}`;

  console.log("📡 طلب:", url);

  const headers = {
    apikey:
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4b2xza3lkd3Jua2VmYW56YW12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTg5ODUsImV4cCI6MjA5OTg3NDk4NX0.0T4Ltlg0qFRrVqSYXnAVcpcsR00hvqMlUMNmeE44qXg",
    Authorization:
      "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4b2xza3lkd3Jua2VmYW56YW12Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyOTg5ODUsImV4cCI6MjA5OTg3NDk4NX0.0T4Ltlg0qFRrVqSYXnAVcpcsR00hvqMlUMNmeE44qXg",
    "Content-Type": "application/json",
  };

  const mergedOptions = {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  };

  try {
    const response = await fetch(url, mergedOptions);

    console.log("📡 Status:", response.status);

    // 🔥 إذا كان 204 أو لا يوجد محتوى
    if (response.status === 204) {
      return { success: true };
    }

    // التحقق من وجود محتوى
    const text = await response.text();

    if (!response.ok) {
      let errorMsg = `خطأ ${response.status}`;
      try {
        const errorData = JSON.parse(text);
        errorMsg = errorData.message || errorMsg;
      } catch (e) {}
      throw new Error(errorMsg);
    }

    // إذا كان الرد فارغاً
    if (!text || text.trim() === "") {
      return { success: true };
    }

    // محاولة تحويل إلى JSON
    try {
      return JSON.parse(text);
    } catch (e) {
      return { success: true, data: text };
    }
  } catch (error) {
    console.error("❌ خطأ:", error);
    throw error;
  }
}

// ============================================
// دالة الحصول على الفرع الحالي
// ============================================
function getCurrentBranchId() {
  const profile = authManager.getCurrentProfile();
  return profile ? profile.branch_id : null;
}

// ============================================
// دالة الحصول على الدور الحالي
// ============================================
function getCurrentRole() {
  const user = authManager.getCurrentUser();
  return user ? user.role : null;
}

// ============================================
// دالة مساعدة لجلب البيانات مع JOIN يدوي
// ============================================

async function fetchWithRelation(
  mainTable,
  mainFields,
  mainFilters,
  relationTable,
  relationField,
  relationFields,
) {
  try {
    // 1. جلب البيانات من الجدول الرئيسي
    let query = `${mainTable}?select=${mainFields.join(",")}`;
    if (mainFilters) {
      query += `&${mainFilters}`;
    }

    const mainData = await supabaseRequest(query);

    if (!mainData || mainData.length === 0) {
      return mainData;
    }

    // 2. استخراج الـ IDs للعلاقة
    const ids = [
      ...new Set(
        mainData.map((item) => item[relationField]).filter((id) => id),
      ),
    ];

    if (ids.length === 0) {
      return mainData;
    }

    // 3. جلب البيانات من الجدول المرتبط
    const idQuery = ids.map((id) => `id=eq.${id}`).join("&");
    const relationData = await supabaseRequest(
      `${relationTable}?select=id,${relationFields.join(",")}&${idQuery}`,
    );

    // 4. دمج البيانات
    const relationMap = {};
    relationData.forEach((item) => {
      relationMap[item.id] = item;
    });

    return mainData.map((item) => ({
      ...item,
      [relationTable]: relationMap[item[relationField]] || null,
    }));
  } catch (error) {
    console.error("خطأ في fetchWithRelation:", error);
    throw error;
  }
}

// ============================================
// دالة مساعدة لجلب البيانات مع الأسماء
// ============================================

async function fetchWithRelations(mainData, relations) {
  try {
    if (!mainData || mainData.length === 0) return mainData;

    let result = [...mainData];

    for (const rel of relations) {
      const ids = [
        ...new Set(result.map((item) => item[rel.field]).filter((id) => id)),
      ];

      if (ids.length === 0) continue;

      const idQuery = ids.map((id) => `id=eq.${id}`).join("&");
      const relatedData = await supabaseRequest(
        `${rel.table}?select=id,${rel.fields.join(",")}&${idQuery}`,
      );

      const relatedMap = {};
      relatedData.forEach((item) => {
        relatedMap[item.id] = item;
      });

      result = result.map((item) => ({
        ...item,
        [rel.as || rel.table]: relatedMap[item[rel.field]] || null,
      }));
    }

    return result;
  } catch (error) {
    console.error("خطأ في fetchWithRelations:", error);
    return mainData;
  }
}

window.fetchWithRelations = fetchWithRelations;

// تصدير الدوال للاستخدام العام
window.authManager = authManager;
window.showToast = showToast;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.supabaseRequest = supabaseRequest;
window.getCurrentBranchId = getCurrentBranchId;
window.getCurrentRole = getCurrentRole;
window.ROLES = ROLES;
window.PAGES = PAGES;

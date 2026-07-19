// ============================================
// توريدات وحركات الفروع
// ============================================

class BranchTransfersManager {
  constructor() {
    this.allTransfers = [];
    this.movementModal = null;
    this.currentType = "";
    this.init();
  }

  async init() {
    if (!authManager.requireAuth()) return;
    if (!authManager.requireRole(ROLES.ADMIN)) return;

    this.movementModal = new bootstrap.Modal(
      document.getElementById("movementModal"),
    );
    await this.loadData();
    await this.loadOptions();
    await this.loadFilters();
    this.addEventListeners();
  }

  addEventListeners() {
    document
      .getElementById("fromBranch")
      .addEventListener("change", async (e) => {
        const branchId = e.target.value;
        const type = document.getElementById("movementType").value;
        if (type === "exchange" && branchId) {
          await this.loadBranchStockForExchange(branchId);
        }
      });

    document
      .getElementById("oldProduct")
      .addEventListener("change", function () {
        const selected = this.options[this.selectedIndex];
        const qty = selected?.dataset?.quantity || 0;
        const oldQtyInput = document.getElementById("oldQuantity");
        oldQtyInput.max = qty;
        oldQtyInput.placeholder = `الحد الأقصى: ${qty}`;
      });
  }

  async loadData() {
    showLoading();
    try {
      await Promise.all([this.loadTransfers(), this.loadStats()]);
    } catch (error) {
      console.error("خطأ في تحميل البيانات:", error);
      showToast("حدث خطأ في تحميل البيانات", "error");
    } finally {
      hideLoading();
    }
  }

  async loadTransfers() {
    try {
      console.log("🔄 loadTransfers بدأت");

      // 1. جلب الحركات
      const transfers = await supabaseRequest(`
            branch_transfers?select=*&order=created_at.desc&limit=100
        `);
      console.log("📦 عدد الحركات:", transfers.length);

      // 2. جلب أسماء الفروع
      const branchIds = [
        ...new Set([
          ...transfers.map((m) => m.from_branch_id).filter((id) => id),
          ...transfers.map((m) => m.to_branch_id).filter((id) => id),
        ]),
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
        console.log("📦 branchMap after merge:", branchMap);
      }

      // 3. جلب أسماء المنتجات
      const productIds = [
        ...new Set([
          ...transfers.map((m) => m.product_id).filter((id) => id),
          ...transfers.map((m) => m.old_product_id).filter((id) => id),
          ...transfers.map((m) => m.new_product_id).filter((id) => id),
        ]),
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
        console.log("📦 productMap after merge:", productMap);
      }

      // 4. دمج البيانات
      this.allTransfers = transfers.map((movement) => {
        const fromBranch = branchMap[movement.from_branch_id] || null;
        const toBranch = branchMap[movement.to_branch_id] || null;
        const product = productMap[movement.product_id] || null;
        const oldProduct = productMap[movement.old_product_id] || null;
        const newProduct = productMap[movement.new_product_id] || null;

        return {
          ...movement,
          from_branch: fromBranch,
          to_branch: toBranch,
          products: product,
          old_product: oldProduct,
          new_product: newProduct,
        };
      });

      console.log("📦 أول حركة مدمجة:", this.allTransfers[0]);
      console.log("📦 اسم المنتج:", this.allTransfers[0]?.products?.name);
      console.log(
        "📦 اسم الفرع المصدر:",
        this.allTransfers[0]?.from_branch?.name,
      );
      console.log("📦 اسم الفرع الهدف:", this.allTransfers[0]?.to_branch?.name);

      // 5. عرض في الجدول
      this.renderTable(this.allTransfers);
    } catch (error) {
      console.error("❌ خطأ في loadTransfers:", error);
    }
  }

  renderTable(transfers) {
    const tbody = document.getElementById("transfersTable");
    if (!transfers || transfers.length === 0) {
      tbody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center text-muted">لا توجد حركات مسجلة</td>
            </tr>
        `;
      return;
    }

    const typeLabels = {
      transfer: "تحويل",
      return: "مرتجع للمخزن",
      customer_return: "مرتجع من عميل",
      exchange: "استبدال",
      supply: "توريد",
    };

    const typeColors = {
      transfer: "primary",
      return: "danger",
      customer_return: "info",
      exchange: "secondary",
      supply: "success",
    };

    tbody.innerHTML = transfers
      .map((movement, index) => {
        const productName =
          movement.products?.name ||
          movement.old_product?.name ||
          movement.new_product?.name ||
          "غير معروف";

        const fromName =
          movement.from_branch?.name ||
          (movement.from_branch_id ? "فرع غير معروف" : "المخزن");

        const toName =
          movement.to_branch?.name ||
          (movement.to_branch_id ? "فرع غير معروف" : "-");

        let details = "";
        if (movement.transfer_type === "exchange") {
          details = `مرتجع: ${movement.old_product?.name || "غير معروف"} (${movement.old_quantity}) → جديد: ${movement.new_product?.name || "غير معروف"} (${movement.new_quantity})`;
        } else if (movement.transfer_type === "customer_return") {
          details = `العميل: ${movement.customer_name || "غير معروف"}`;
        } else {
          details = movement.notes || "-";
        }

        return `
                <tr>
                    <td>${index + 1}</td>
                    <td>
                        <span class="badge bg-${typeColors[movement.transfer_type] || "secondary"}">
                            ${typeLabels[movement.transfer_type] || movement.transfer_type}
                        </span>
                    </td>
                    <td>${productName}</td>
                    <td><strong>${movement.quantity || movement.old_quantity || 0}</strong></td>
                    <td>${fromName}</td>
                    <td>${toName}</td>
                    <td style="font-size: 13px;">${details}</td>
                    <td>${new Date(movement.created_at).toLocaleString("ar-EG")}</td>
                </tr>
            `;
      })
      .join("");
  }

  async loadStats() {
    try {
      const allResponse = await supabaseRequest("branch_transfers?select=id");
      document.getElementById("totalTransfers").textContent =
        allResponse.length;

      const itemsResponse = await supabaseRequest(
        "branch_transfers?select=quantity",
      );
      const totalItems = itemsResponse.reduce(
        (sum, t) => sum + (t.quantity || 0),
        0,
      );
      document.getElementById("totalItemsTransferred").textContent = totalItems;

      const branchesResponse = await supabaseRequest(
        "branches?select=id&is_active=eq.true",
      );
      document.getElementById("branchesCount").textContent =
        branchesResponse.length;

      const daysResponse = await supabaseRequest(
        "branch_transfers?select=transfer_date",
      );
      const uniqueDays = new Set(daysResponse.map((t) => t.transfer_date));
      document.getElementById("daysCount").textContent = uniqueDays.size;
    } catch (error) {
      console.error("خطأ في تحميل الإحصائيات:", error);
    }
  }

  async loadOptions() {
    try {
      const branches = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true&order=name.asc",
      );
      const fromSelect = document.getElementById("fromBranch");
      const toSelect = document.getElementById("toBranch");

      fromSelect.innerHTML = '<option value="">اختر الفرع</option>';
      toSelect.innerHTML = '<option value="">اختر الفرع</option>';

      branches.forEach((branch) => {
        const opt1 = document.createElement("option");
        opt1.value = branch.id;
        opt1.textContent = branch.name;
        fromSelect.appendChild(opt1);

        const opt2 = document.createElement("option");
        opt2.value = branch.id;
        opt2.textContent = branch.name;
        toSelect.appendChild(opt2);
      });

      const products = await supabaseRequest(
        "products?select=id,name&is_active=eq.true&order=name.asc",
      );
      const productSelect = document.getElementById("movementProduct");
      const oldProductSelect = document.getElementById("oldProduct");
      const newProductSelect = document.getElementById("newProduct");

      productSelect.innerHTML = '<option value="">اختر المنتج</option>';
      oldProductSelect.innerHTML =
        '<option value="">اختر المنتج المرتجع</option>';
      newProductSelect.innerHTML =
        '<option value="">اختر المنتج الجديد</option>';

      products.forEach((product) => {
        [productSelect, oldProductSelect, newProductSelect].forEach(
          (select) => {
            const option = document.createElement("option");
            option.value = product.id;
            option.textContent = product.name;
            select.appendChild(option);
          },
        );
      });
    } catch (error) {
      console.error("خطأ في تحميل الخيارات:", error);
    }
  }

  async loadFilters() {
    try {
      console.log("🔄 loadFilters بدأت");

      // 1. تحميل الفروع للفلتر
      const branches = await supabaseRequest(
        "branches?select=id,name&is_active=eq.true&order=name.asc",
      );
      console.log("📦 branches for filter:", branches);

      const branchSelect = document.getElementById("filterBranch");
      if (!branchSelect) {
        console.error("❌ filterBranch element not found");
        return;
      }

      // ✅ إفراغ القائمة قبل الإضافة
      branchSelect.innerHTML = '<option value="all">جميع الفروع</option>';

      branches.forEach((branch) => {
        const option = document.createElement("option");
        option.value = branch.id;
        option.textContent = branch.name;
        branchSelect.appendChild(option);
      });

      // 2. تحميل المنتجات للفلتر
      const products = await supabaseRequest(
        "products?select=id,name&is_active=eq.true&order=name.asc",
      );
      console.log("📦 products for filter:", products);

      const productSelect = document.getElementById("filterProduct");
      if (!productSelect) {
        console.error("❌ filterProduct element not found");
        return;
      }

      // ✅ إفراغ القائمة قبل الإضافة
      productSelect.innerHTML = '<option value="all">جميع المنتجات</option>';

      products.forEach((product) => {
        const option = document.createElement("option");
        option.value = product.id;
        option.textContent = product.name;
        productSelect.appendChild(option);
      });

      console.log("✅ loadFilters completed");
    } catch (error) {
      console.error("خطأ في تحميل الفلاتر:", error);
      showToast("حدث خطأ في تحميل الفلاتر", "error");
    }
  }

  async applyFilters() {
    showLoading();
    try {
      const dateFrom = document.getElementById("filterDateFrom").value;
      const dateTo = document.getElementById("filterDateTo").value;
      const branchId = document.getElementById("filterBranch").value;
      const type = document.getElementById("filterType").value;
      const productId = document.getElementById("filterProduct").value;

      let filtered = this.allTransfers;

      if (dateFrom) {
        filtered = filtered.filter((t) => t.transfer_date >= dateFrom);
      }
      if (dateTo) {
        filtered = filtered.filter((t) => t.transfer_date <= dateTo);
      }
      if (branchId !== "all") {
        filtered = filtered.filter(
          (t) => t.from_branch_id === branchId || t.to_branch_id === branchId,
        );
      }
      if (type !== "all") {
        filtered = filtered.filter((t) => t.transfer_type === type);
      }
      if (productId !== "all") {
        filtered = filtered.filter(
          (t) =>
            t.product_id === productId ||
            t.old_product_id === productId ||
            t.new_product_id === productId,
        );
      }

      // ✅ تحديث الجدول
      this.renderTable(filtered);

      // ✅ تحديث الإحصائيات بناءً على الفلتر
      this.updateStats(filtered);

      showToast("تم تطبيق الفلتر بنجاح", "success");
    } catch (error) {
      console.error("خطأ في تطبيق الفلتر:", error);
      showToast("حدث خطأ في تطبيق الفلتر", "error");
    } finally {
      hideLoading();
    }
  }

  // ✅ أضف هذه الدالة الجديدة
  updateStats(data) {
    const totalTransfers = data.length;
    const totalItems = data.reduce(
      (sum, t) => sum + (t.quantity || t.old_quantity || 0),
      0,
    );

    // عدد الفروع من البيانات المصفاة
    const branchIds = new Set();
    data.forEach((t) => {
      if (t.from_branch_id) branchIds.add(t.from_branch_id);
      if (t.to_branch_id) branchIds.add(t.to_branch_id);
    });
    const branchesCount = branchIds.size;

    // عدد الأيام من البيانات المصفاة
    const days = new Set(data.map((t) => t.transfer_date));
    const daysCount = days.size;

    document.getElementById("totalTransfers").textContent = totalTransfers;
    document.getElementById("totalItemsTransferred").textContent = totalItems;
    document.getElementById("branchesCount").textContent =
      branchesCount || document.getElementById("branchesCount").textContent;
    document.getElementById("daysCount").textContent =
      daysCount || document.getElementById("daysCount").textContent;
  }

  // ✅ عدل resetFilters
  resetFilters() {
    document.getElementById("filterDateFrom").value = "";
    document.getElementById("filterDateTo").value = "";
    document.getElementById("filterBranch").value = "all";
    document.getElementById("filterType").value = "all";
    document.getElementById("filterProduct").value = "all";

    this.renderTable(this.allTransfers);

    // ✅ إرجاع الإحصائيات الكاملة
    this.loadStats();

    showToast("تم إعادة تعيين الفلاتر", "info");
  }

  // ============================================
  // دوال إضافة الحركات الجديدة
  // ============================================

  showMovementModal(type) {
    this.currentType = type;
    document.getElementById("movementType").value = type;

    const titles = {
      transfer: "تحويل بين الفروع",
      return: "مرتجع للمخزن",
      customer_return: "مرتجع من عميل",
      exchange: "استبدال",
    };
    document.getElementById("movementModalTitle").innerHTML =
      `<i class="fas fa-plus"></i> ${titles[type] || "حركة جديدة"}`;

    document.getElementById("fromBranchGroup").style.display = "block";
    document.getElementById("toBranchGroup").style.display = "block";
    document.getElementById("oldProductGroup").style.display = "none";
    document.getElementById("oldQuantityGroup").style.display = "none";
    document.getElementById("newProductGroup").style.display = "none";
    document.getElementById("newQuantityGroup").style.display = "none";
    document.getElementById("customerNameGroup").style.display = "none";
    document.getElementById("customerPhoneGroup").style.display = "none";

    switch (type) {
      case "transfer":
        document.getElementById("fromBranchGroup").style.display = "block";
        document.getElementById("toBranchGroup").style.display = "block";
        document.getElementById("movementModalTitle").innerHTML =
          '<i class="fas fa-exchange-alt"></i> تحويل بين الفروع';
        break;

      case "return":
        document.getElementById("fromBranchGroup").style.display = "block";
        document.getElementById("toBranchGroup").style.display = "none";
        document.getElementById("movementModalTitle").innerHTML =
          '<i class="fas fa-undo-alt"></i> مرتجع للمخزن';
        break;

      case "customer_return":
        document.getElementById("fromBranchGroup").style.display = "block";
        document.getElementById("toBranchGroup").style.display = "none";
        document.getElementById("customerNameGroup").style.display = "block";
        document.getElementById("customerPhoneGroup").style.display = "block";
        document.getElementById("movementModalTitle").innerHTML =
          '<i class="fas fa-user-undo"></i> مرتجع من عميل';
        break;

      case "exchange":
        document.getElementById("toBranchGroup").style.display = "none";
        document
          .getElementById("movementProduct")
          .closest(".col-md-6").style.display = "none";
        document
          .getElementById("movementQuantity")
          .closest(".col-md-6").style.display = "none";
        document.getElementById("oldProductGroup").style.display = "block";
        document.getElementById("oldQuantityGroup").style.display = "block";
        document.getElementById("newProductGroup").style.display = "block";
        document.getElementById("newQuantityGroup").style.display = "block";

        const currentBranch = document.getElementById("fromBranch").value;
        if (currentBranch) {
          this.loadBranchStockForExchange(currentBranch);
        }

        document.getElementById("movementModalTitle").innerHTML =
          '<i class="fas fa-random"></i> استبدال منتج';
        break;
    }

    document.getElementById("movementForm").reset();
    this.movementModal.show();
  }

  async loadBranchStockForExchange(branchId) {
    try {
      const productSelect = document.getElementById("oldProduct");

      const allProducts = await supabaseRequest(
        "products?select=id,name,code&is_active=eq.true&order=name.asc",
      );

      const stock = await supabaseRequest(`
            branch_stock?select=product_id,quantity&branch_id=eq.${branchId}
        `);

      const stockMap = {};
      stock.forEach((s) => {
        stockMap[s.product_id] = s.quantity;
      });

      productSelect.innerHTML = '<option value="">اختر المنتج المرتجع</option>';

      allProducts.forEach((p) => {
        const qty = stockMap[p.id] || 0;
        const option = document.createElement("option");
        option.value = p.id;
        option.textContent = `${p.name} (${p.code})`;
        option.dataset.quantity = qty;
        productSelect.appendChild(option);
      });

      document.getElementById("oldQuantity").value = "";
      document.getElementById("oldQuantity").max = 0;
    } catch (error) {
      console.error("خطأ في تحميل مخزون الفرع:", error);
      showToast("حدث خطأ في تحميل مخزون الفرع", "error");
    }
  }

  async saveMovement() {
    const type = document.getElementById("movementType").value;
    const fromBranch = document.getElementById("fromBranch").value;
    const toBranch = document.getElementById("toBranch").value;
    const productId = document.getElementById("movementProduct").value;
    const quantity = parseInt(
      document.getElementById("movementQuantity").value,
    );
    const reason = document.getElementById("movementReason").value.trim();

    let oldProductId = null;
    let oldQuantity = null;
    let newProductId = null;
    let newQuantity = null;
    let customerName = null;
    let customerPhone = null;
    let movementData = {};

    // ============================================
    // التحقق حسب نوع الحركة
    // ============================================

    // 1. التحقق من الاستبدال
    if (type === "exchange") {
      oldProductId = document.getElementById("oldProduct").value;
      oldQuantity = parseInt(document.getElementById("oldQuantity").value);
      newProductId = document.getElementById("newProduct").value;
      newQuantity = parseInt(document.getElementById("newQuantity").value);

      if (!oldProductId || !oldQuantity || !newProductId || !newQuantity) {
        showToast("يرجى ملء جميع بيانات الاستبدال", "warning");
        return;
      }

      if (oldQuantity < 1 || newQuantity < 1) {
        showToast("الكميات يجب أن تكون أكبر من صفر", "warning");
        return;
      }

      // ✅ التحقق من توفر المنتج المرتجع في الفرع المصدر
      try {
        const stockCheck = await supabaseRequest(`
                branch_stock?select=quantity&branch_id=eq.${fromBranch}&product_id=eq.${oldProductId}
            `);

        if (stockCheck.length === 0 || stockCheck[0].quantity < oldQuantity) {
          showToast(
            `المنتج المرتجع غير متوفر بالكمية المطلوبة. المتاح: ${stockCheck[0]?.quantity || 0}`,
            "error",
          );
          return;
        }
      } catch (error) {
        console.error("خطأ في التحقق من المخزون:", error);
        showToast("حدث خطأ في التحقق من المخزون", "error");
        return;
      }

      // بناء بيانات الحركة للاستبدال
      movementData = {
        transfer_type: "exchange",
        from_branch_id: fromBranch,
        to_branch_id: fromBranch,
        product_id: oldProductId,
        quantity: oldQuantity,
        old_product_id: oldProductId,
        old_quantity: oldQuantity,
        new_product_id: newProductId,
        new_quantity: newQuantity,
        notes: reason || "استبدال منتج",
      };
    }
    // 2. التحقق من التحويل
    else if (type === "transfer") {
      if (!fromBranch || !toBranch) {
        showToast("يرجى اختيار الفرع المصدر والهدف", "warning");
        return;
      }
      if (fromBranch === toBranch) {
        showToast("لا يمكن التحويل لنفس الفرع", "warning");
        return;
      }

      if (!productId || !quantity || quantity < 1) {
        showToast("يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
      }

      // ✅ التحقق من توفر الكمية
      try {
        const stockCheck = await supabaseRequest(`
                branch_stock?select=quantity&branch_id=eq.${fromBranch}&product_id=eq.${productId}
            `);

        if (stockCheck.length === 0 || stockCheck[0].quantity < quantity) {
          showToast(
            `المنتج غير متوفر بالكمية المطلوبة. المتاح: ${stockCheck[0]?.quantity || 0}`,
            "error",
          );
          return;
        }
      } catch (error) {
        console.error("خطأ في التحقق من المخزون:", error);
        showToast("حدث خطأ في التحقق من المخزون", "error");
        return;
      }

      movementData = {
        transfer_type: "transfer",
        from_branch_id: fromBranch,
        to_branch_id: toBranch,
        product_id: productId,
        quantity: quantity,
        notes: reason || "تحويل بين الفروع",
      };
    }

    // 3. التحقق من مرتجع المخزن
    else if (type === "return") {
      if (!fromBranch) {
        showToast("يرجى اختيار الفرع المصدر", "warning");
        return;
      }

      if (!productId || !quantity || quantity < 1) {
        showToast("يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
      }

      // ✅ التحقق من توفر الكمية
      try {
        const stockCheck = await supabaseRequest(`
                branch_stock?select=quantity&branch_id=eq.${fromBranch}&product_id=eq.${productId}
            `);

        if (stockCheck.length === 0 || stockCheck[0].quantity < quantity) {
          showToast(
            `المنتج غير متوفر بالكمية المطلوبة. المتاح: ${stockCheck[0]?.quantity || 0}`,
            "error",
          );
          return;
        }
      } catch (error) {
        console.error("خطأ في التحقق من المخزون:", error);
        showToast("حدث خطأ في التحقق من المخزون", "error");
        return;
      }

      movementData = {
        transfer_type: "return",
        from_branch_id: fromBranch,
        product_id: productId,
        quantity: quantity,
        notes: reason || "مرتجع للمخزن",
      };
    }

    // 4. التحقق من مرتجع العميل
    else if (type === "customer_return") {
      if (!fromBranch) {
        showToast("يرجى اختيار الفرع", "warning");
        return;
      }

      if (!productId || !quantity || quantity < 1) {
        showToast("يرجى ملء جميع الحقول المطلوبة", "warning");
        return;
      }

      customerName = document.getElementById("customerName").value.trim();
      customerPhone = document.getElementById("customerPhone").value.trim();

      if (!customerName) {
        showToast("يرجى إدخال اسم العميل", "warning");
        return;
      }

      movementData = {
        transfer_type: "customer_return",
        from_branch_id: fromBranch,
        product_id: productId,
        quantity: quantity,
        customer_name: customerName,
        customer_phone: customerPhone || "",
        notes: reason || "مرتجع من عميل",
      };
    }

    // ✅ منغير التحقق العام اللي كان بيسبب المشكلة
    if (!movementData.transfer_type) {
      showToast("نوع الحركة غير معروف", "error");
      return;
    }

    // ============================================
    // حفظ الحركة
    // ============================================

    showLoading();

    try {
      console.log("📝 بيانات الحركة:", movementData);

      await supabaseRequest("branch_transfers", {
        method: "POST",
        body: JSON.stringify(movementData),
      });

      await this.updateStock(movementData);

      showToast("✅ تم تسجيل الحركة بنجاح", "success");
      this.movementModal.hide();
      await this.loadData();
    } catch (error) {
      console.error("خطأ في حفظ الحركة:", error);
      showToast(`❌ حدث خطأ: ${error.message}`, "error");
    } finally {
      hideLoading();
    }
  }

  async updateStock(data) {
    const type = data.transfer_type;
    const fromBranch = data.from_branch_id;
    const toBranch = data.to_branch_id;
    const productId = data.product_id;
    const quantity = data.quantity;

    try {
      switch (type) {
        case "transfer":
          await this.decreaseStock(fromBranch, productId, quantity);
          await this.increaseStock(toBranch, productId, quantity);
          break;

        case "return":
          await this.decreaseStock(fromBranch, productId, quantity);
          await this.increaseWarehouseStock(productId, quantity);
          break;

        case "customer_return":
          await this.increaseStock(fromBranch, productId, quantity);
          break;

        case "exchange":
          const oldProductId = data.old_product_id;
          const oldQuantity = data.old_quantity;
          const newProductId = data.new_product_id;
          const newQuantity = data.new_quantity;
          const branchId = data.from_branch_id;

          // ✅ المنتج المرتجع (اللي رجعه العميل) → يزيد في المخزون
          await this.increaseStock(branchId, oldProductId, oldQuantity);

          // ✅ المنتج الجديد (اللي أخده العميل) → يقل من المخزون
          await this.decreaseStock(branchId, newProductId, newQuantity);

          console.log(
            `✅ استبدال في فرع ${branchId}: +${oldProductId} (${oldQuantity}) → -${newProductId} (${newQuantity})`,
          );
          break;
      }
    } catch (error) {
      console.error("خطأ في تحديث المخزون:", error);
      throw error;
    }
  }

  async decreaseStock(branchId, productId, quantity) {
    try {
      const stock = await supabaseRequest(`
                branch_stock?select=quantity&branch_id=eq.${branchId}&product_id=eq.${productId}
            `);

      if (stock.length > 0) {
        const newQty = Math.max(0, stock[0].quantity - quantity);
        await supabaseRequest(
          `branch_stock?branch_id=eq.${branchId}&product_id=eq.${productId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ quantity: newQty }),
          },
        );
      }
    } catch (error) {
      console.error("خطأ في نقص المخزون:", error);
      throw error;
    }
  }

  async increaseStock(branchId, productId, quantity) {
    try {
      const stock = await supabaseRequest(`
                branch_stock?select=quantity&branch_id=eq.${branchId}&product_id=eq.${productId}
            `);

      if (stock.length > 0) {
        await supabaseRequest(
          `branch_stock?branch_id=eq.${branchId}&product_id=eq.${productId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ quantity: stock[0].quantity + quantity }),
          },
        );
      } else {
        await supabaseRequest("branch_stock", {
          method: "POST",
          body: JSON.stringify({
            branch_id: branchId,
            product_id: productId,
            quantity: quantity,
          }),
        });
      }
    } catch (error) {
      console.error("خطأ في زيادة المخزون:", error);
      throw error;
    }
  }

  async decreaseWarehouseStock(productId, quantity) {
    try {
      const stock = await supabaseRequest(`
                warehouse_stock?select=quantity&product_id=eq.${productId}
            `);

      if (stock.length > 0) {
        const newQty = Math.max(0, stock[0].quantity - quantity);
        await supabaseRequest(`warehouse_stock?product_id=eq.${productId}`, {
          method: "PATCH",
          body: JSON.stringify({ quantity: newQty }),
        });
      }
    } catch (error) {
      console.error("خطأ في نقص مخزون المخزن:", error);
      throw error;
    }
  }

  async increaseWarehouseStock(productId, quantity) {
    try {
      const stock = await supabaseRequest(`
                warehouse_stock?select=quantity&product_id=eq.${productId}
            `);

      if (stock.length > 0) {
        await supabaseRequest(`warehouse_stock?product_id=eq.${productId}`, {
          method: "PATCH",
          body: JSON.stringify({ quantity: stock[0].quantity + quantity }),
        });
      } else {
        await supabaseRequest("warehouse_stock", {
          method: "POST",
          body: JSON.stringify({
            product_id: productId,
            quantity: quantity,
          }),
        });
      }
    } catch (error) {
      console.error("خطأ في زيادة مخزون المخزن:", error);
      throw error;
    }
  }
}

// ============================================
// دوال مساعدة
// ============================================

let transfersManager;

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
  if (transfersManager) transfersManager.applyFilters();
}

// ✅ دالة إعادة تعيين الفلاتر
function resetFilters() {
  if (transfersManager) transfersManager.resetFilters();
}

function showMovementModal(type) {
  if (transfersManager) transfersManager.showMovementModal(type);
}

function saveMovement() {
  if (transfersManager) transfersManager.saveMovement();
}

document.addEventListener("DOMContentLoaded", () => {
  transfersManager = new BranchTransfersManager();
});

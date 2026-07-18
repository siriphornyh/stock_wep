// ============================================================
//  SUPA_API — เลเยอร์แทนที่ Code.gs (Google Apps Script) ทั้งหมด
//  ทุกฟังก์ชันในนี้มีชื่อ + พารามิเตอร์ + รูปแบบผลลัพธ์ { ok, data/message, ... }
//  เหมือนเดิมทุกประการกับฝั่ง Code.gs เดิม เพื่อให้ app.js (UI) ไม่ต้องแก้โค้ดเลย
//
//  หมายเหตุสำคัญเรื่อง Security:
//  ระบบเดิมใช้รหัสผ่านเดียวเก็บใน Sheet (ไม่ใช่ Supabase Auth จริง) — โค้ดนี้คงพฤติกรรม
//  เดิมไว้ (เช็ครหัสผ่านตรงกับที่เก็บในตาราง config) เพื่อความเข้ากันได้ แต่ควรตั้งค่า
//  Row Level Security (RLS) ของ Supabase ให้เหมาะสม ไม่ควรเปิด public เต็มรูปแบบถ้าเป็น
//  ระบบใช้งานจริัง แนะนำให้ดูไฟล์ policies.sql ที่แนบมาประกอบ
// ============================================================

var SUPA_API = (function () {

  var STOCK_NAME = { office: "office", machine: "machine", medicine: "medicine", uniform: "uniform" };

  function tbl(stockType, kind) {
    // kind: 'receive' | 'issue'
    var st = (stockType || "").toLowerCase();
    if (!STOCK_NAME[st]) throw new Error("ไม่รู้จักประเภท: " + stockType);
    return st + "_" + kind;
  }

  // ------------------------------------------------------------
  //  วันที่แบบ Asia/Bangkok (UTC+7, ไม่มี DST) — YYYY-MM-DD
  // ------------------------------------------------------------
  function todayBangkok() {
    var now = new Date();
    var utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
    var bkk = new Date(utcMs + 7 * 3600000);
    var yyyy = bkk.getFullYear();
    var mm = String(bkk.getMonth() + 1).padStart(2, "0");
    var dd = String(bkk.getDate()).padStart(2, "0");
    return yyyy + "-" + mm + "-" + dd;
  }

  function isFutureDate(dateStr) {
    if (!dateStr) return false;
    try { return dateStr > todayBangkok(); } catch (e) { return false; }
  }

  // ------------------------------------------------------------
  //  แปลง master_products (DB, snake_case) <-> product (Frontend, camelCase)
  // ------------------------------------------------------------
  function productFromRow(r) {
    return {
      stockType: (r.stock_type || "").toString(),
      category: (r.category || "").toString(),
      itemCode: (r.item_code || "").toString(),
      itemName: (r.item_name || "").toString(),
      unit: (r.unit || "").toString(),
      minStock: Number(r.min_stock) || 0,
      imageUrl: (r.image_url || "").toString(),
      extra1: (r.extra1 || "").toString(),
      extra2: (r.extra2 || "").toString(),
      price: r.price !== null && r.price !== undefined ? Number(r.price) || 0 : 0,
      deductSalary: r.deduct_salary ? r.deduct_salary.toString().trim().toUpperCase() : "N",
      aliases: (r.aliases || "").toString(),
      verified: r.verified ? r.verified.toString().trim().toUpperCase() : "N"
    };
  }

  function throwIfError(res) {
    if (res.error) throw new Error(res.error.message);
    return res;
  }

  // ------------------------------------------------------------
  //  LOG WRITER (เหมือน writeLog_ ใน Code.gs)
  // ------------------------------------------------------------
  function writeLog(adminName, activity, detail) {
    return sb.from("admin_logs").insert([{
      admin_name: adminName || "SYSTEM",
      activity: activity,
      detail: detail || ""
    }]).then(function () { /* ไม่ throw ถ้าล้มเหลว เหมือนต้นฉบับ */ }).catch(function () {});
  }

  // ============================================================
  //  DROPDOWN OPTIONS
  //  (เดิมอ่านจาก Sheet "Dropdown_Options" — ในเวอร์ชัน Supabase ใช้ default
  //   เป็นค่าตั้งต้น + รวมกับ category/unit ที่มีอยู่จริงในตาราง master_products
  //   เพื่อให้ dropdown โตขึ้นเรื่อยๆ ตามข้อมูลจริงโดยไม่ต้องมีตารางแยก)
  // ============================================================
  var DROPDOWN_DEFAULTS = {
    office: { categories: ["Stationery", "Paper", "Toner/Ink", "Electronics", "MISC", "General"], units: ["pcs.", "pack", "roll", "set", "dozen", "ream", "Sheet", "bottle", "book", "box"] },
    machine: { categories: ["Lubricants", "Belts", "Machine Parts", "Needles", "Blades", "Electric/Air", "Tools"], units: ["pack", "unit", "set", "line", "belt", "gal", "tube", "pcs."] },
    medicine: { categories: ["Anti-Inflam", "Muscle Relax", "Herbal", "Topical", "Allergy", "Vitamin", "First Aid", "Pain Relief", "Diarrhea", "Covid-Supplies"], units: ["pcs.", "tablet", "blister pack", "sachet", "tube", "bottle", "jar", "pair", "box", "set"] },
    uniform: { categories: ["Polo", "Face Mask", "Cap", "Pants", "Shirt", "shoe"], units: ["pcs.", "set", "pair"] }
  };

  async function getDropdownOptions(stockType) {
    try {
      var st = (stockType || "").toLowerCase();
      var base = DROPDOWN_DEFAULTS[st];
      if (!base) return { ok: false, message: "ไม่รู้จัก stockType: " + stockType };

      var res = throwIfError(await sb.from("master_products")
        .select("category, unit")
        .eq("stock_type", st.toUpperCase()));

      var cats = base.categories.slice();
      var units = base.units.slice();
      (res.data || []).forEach(function (r) {
        if (r.category && cats.indexOf(r.category) === -1) cats.push(r.category);
        if (r.unit && units.indexOf(r.unit) === -1) units.push(r.unit);
      });

      return { ok: true, categories: cats, units: units };
    } catch (e) {
      return { ok: false, categories: [], units: [], message: e.message };
    }
  }

  // ============================================================
  //  AUTH
  // ============================================================
  async function login(password, adminName) {
    try {
      var res = throwIfError(await sb.from("config").select("system_password").eq("id", true).single());
      if (!res.data) return { ok: false, message: "ไม่พบการตั้งค่าระบบ กรุณา Setup ก่อน" };
      var storedPw = (res.data.system_password || "").toString().trim();
      if ((password || "").toString().trim() !== storedPw) {
        return { ok: false, message: "❌ รหัสผ่านไม่ถูกต้อง" };
      }
      await writeLog(adminName, "LOGIN", "เข้าสู่ระบบ");
      return { ok: true, adminName: adminName, message: "✅ เข้าสู่ระบบสำเร็จ" };
    } catch (e) {
      return { ok: false, message: "Error: " + e.message };
    }
  }

  async function changePassword(oldPw, newPw, adminName) {
    try {
      var res = throwIfError(await sb.from("config").select("system_password").eq("id", true).single());
      var storedPw = (res.data.system_password || "").toString().trim();
      if ((oldPw || "").toString().trim() !== storedPw) {
        return { ok: false, message: "❌ รหัสผ่านเดิมไม่ถูกต้อง" };
      }
      throwIfError(await sb.from("config").update({ system_password: newPw }).eq("id", true));
      await writeLog(adminName, "CHANGE_PASSWORD", "เปลี่ยนรหัสผ่านระบบ");
      return { ok: true, message: "✅ เปลี่ยนรหัสผ่านสำเร็จ" };
    } catch (e) {
      return { ok: false, message: "Error: " + e.message };
    }
  }

  // ============================================================
  //  ADMIN LIST (employee_list)
  // ============================================================
  async function getAdminList() {
    try {
      var res = throwIfError(await sb.from("employee_list").select("admin_name").order("id"));
      return { ok: true, data: (res.data || []).map(function (r) { return r.admin_name; }) };
    } catch (e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  async function saveAdminList(names, adminName) {
    try {
      throwIfError(await sb.from("employee_list").delete().gte("id", 0));
      if (names && names.length) {
        throwIfError(await sb.from("employee_list").insert(names.map(function (n) { return { admin_name: n }; })));
      }
      await writeLog(adminName, "SAVE_ADMIN_LIST", "แก้ไขรายชื่อแอดมิน " + (names ? names.length : 0) + " คน");
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  // ============================================================
  //  EMPLOYEES
  // ============================================================
  async function getEmployees() {
    try {
      var res = throwIfError(await sb.from("employees").select("emp_code, emp_name, department").order("emp_code"));
      var list = (res.data || []).map(function (r) {
        return { code: r.emp_code, name: r.emp_name || "", department: r.department || "" };
      });
      return { ok: true, data: list };
    } catch (e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  async function saveEmployee(empCode, empName, department, adminName) {
    // backward-compat แบบเดียวกับต้นฉบับ (เผื่อเรียกแบบ 3 args เดิม)
    if (adminName === undefined && typeof department === "string" && arguments.length === 3) {
      adminName = department;
      department = "";
    }
    try {
      var existing = throwIfError(await sb.from("employees").select("emp_code").eq("emp_code", empCode.toString()));
      if (existing.data && existing.data.length) {
        return { ok: false, message: "รหัสพนักงานซ้ำ: " + empCode };
      }
      throwIfError(await sb.from("employees").insert([{ emp_code: empCode, emp_name: empName, department: department || null }]));
      await writeLog(adminName, "ADD_EMPLOYEE", empCode + " — " + empName + (department ? " (" + department + ")" : ""));
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function deleteEmployee(empCode, adminName) {
    try {
      var existing = throwIfError(await sb.from("employees").select("emp_code").eq("emp_code", empCode.toString()));
      if (!existing.data || !existing.data.length) {
        return { ok: false, message: "ไม่พบรหัส: " + empCode };
      }
      throwIfError(await sb.from("employees").delete().eq("emp_code", empCode.toString()));
      await writeLog(adminName, "DELETE_EMPLOYEE", empCode);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function getDeptForEmployee(empCode) {
    try {
      var res = await sb.from("employees").select("department").eq("emp_code", (empCode || "").toString()).single();
      if (res.error || !res.data) return "";
      return res.data.department || "";
    } catch (e) {
      return "";
    }
  }

  // ============================================================
  //  DEPARTMENTS
  // ============================================================
  async function getDepartments() {
    try {
      var res = throwIfError(await sb.from("departments").select("department_name").order("department_name"));
      return { ok: true, data: (res.data || []).map(function (r) { return r.department_name; }) };
    } catch (e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  async function saveDepartment(deptName, adminName) {
    try {
      throwIfError(await sb.from("departments").insert([{ department_name: deptName }]));
      await writeLog(adminName, "ADD_DEPARTMENT", deptName);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function deleteDepartment(deptName, adminName) {
    try {
      var existing = throwIfError(await sb.from("departments").select("department_name").eq("department_name", deptName));
      if (!existing.data || !existing.data.length) {
        return { ok: false, message: "ไม่พบแผนก: " + deptName };
      }
      throwIfError(await sb.from("departments").delete().eq("department_name", deptName));
      await writeLog(adminName, "DELETE_DEPARTMENT", deptName);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  // ============================================================
  //  MASTER PRODUCTS
  // ============================================================
  async function getProducts(stockType) {
    try {
      var q = sb.from("master_products").select("*");
      if (stockType) q = q.eq("stock_type", stockType.toString().toUpperCase());
      var res = throwIfError(await q.order("item_code"));
      return { ok: true, data: (res.data || []).map(productFromRow) };
    } catch (e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  async function saveProduct(product, adminName) {
    try {
      var price = product.price !== undefined ? Number(product.price) || 0 : 0;
      var deductSalary = product.deductSalary ? product.deductSalary.toString().trim().toUpperCase() : "N";
      var aliases = product.aliases || "";

      var existingRes = throwIfError(await sb.from("master_products").select("item_code, verified").eq("item_code", product.itemCode.toString()));
      var existing = existingRes.data && existingRes.data[0];

      if (existing) {
        var existingVerified = existing.verified ? existing.verified.toString().trim().toUpperCase() : "N";
        var verifiedOnUpdate = product.verified !== undefined ? (product.verified ? "Y" : "N") : existingVerified;
        throwIfError(await sb.from("master_products").update({
          stock_type: product.stockType, category: product.category, item_name: product.itemName,
          unit: product.unit, min_stock: product.minStock, image_url: product.imageUrl || "",
          extra1: product.extra1 || "", extra2: product.extra2 || "",
          price: price, deduct_salary: deductSalary, aliases: aliases, verified: verifiedOnUpdate
        }).eq("item_code", product.itemCode.toString()));
        await writeLog(adminName, "UPDATE_PRODUCT", product.itemCode + " — " + product.itemName);
        return { ok: true, action: "updated" };
      }

      throwIfError(await sb.from("master_products").insert([{
        stock_type: product.stockType, category: product.category, item_code: product.itemCode,
        item_name: product.itemName, unit: product.unit, min_stock: product.minStock,
        image_url: product.imageUrl || "", extra1: product.extra1 || "", extra2: product.extra2 || "",
        price: price, deduct_salary: deductSalary, aliases: aliases, verified: "N"
      }]));
      await writeLog(adminName, "ADD_PRODUCT", product.itemCode + " — " + product.itemName);
      return { ok: true, action: "added" };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function deleteProduct(itemCode, adminName) {
    try {
      var existing = throwIfError(await sb.from("master_products").select("item_code").eq("item_code", itemCode.toString()));
      if (!existing.data || !existing.data.length) {
        return { ok: false, message: "ไม่พบสินค้า: " + itemCode };
      }
      throwIfError(await sb.from("master_products").delete().eq("item_code", itemCode.toString()));
      await writeLog(adminName, "DELETE_PRODUCT", itemCode);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function setVerifiedStatus(itemCode, verified, adminName) {
    try {
      var verifiedVal = verified ? "Y" : "N";
      var existing = throwIfError(await sb.from("master_products").select("item_code").eq("item_code", itemCode.toString()));
      if (!existing.data || !existing.data.length) {
        return { ok: false, message: "ไม่พบสินค้า: " + itemCode };
      }
      throwIfError(await sb.from("master_products").update({ verified: verifiedVal }).eq("item_code", itemCode.toString()));
      await writeLog(adminName, "SET_VERIFIED_STATUS",
        itemCode + " → " + (verified ? "✅ ตรวจนับแล้ว" : "⚪ ยังไม่ได้นับสต็อค (UNVERIFIED)"));
      return { ok: true, itemCode: itemCode, verified: verifiedVal };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  // ============================================================
  //  IMAGE UPLOAD (Supabase Storage แทน Google Drive)
  // ============================================================
  function base64ToBlob(base64Data, mimeType) {
    var byteChars = atob(base64Data);
    var byteNumbers = new Array(byteChars.length);
    for (var i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
    var byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mimeType || "image/jpeg" });
  }

  async function uploadImage(base64Data, fileName, mimeType, adminName) {
    try {
      var blob = base64ToBlob(base64Data, mimeType);
      var path = Date.now() + "_" + fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      var up = throwIfError(await sb.storage.from(SUPABASE_IMAGE_BUCKET).upload(path, blob, {
        contentType: mimeType || "image/jpeg", upsert: true
      }));
      var pub = sb.storage.from(SUPABASE_IMAGE_BUCKET).getPublicUrl(path);
      var url = pub.data.publicUrl;
      await writeLog(adminName, "UPLOAD_IMAGE", fileName + " → " + path);
      return { ok: true, url: url, fileId: path };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  async function bulkUploadImages(files, adminName) {
    try {
      if (!files || !files.length) return { ok: false, message: "ไม่มีไฟล์ที่จะอัปโหลด" };

      var prodRes = throwIfError(await sb.from("master_products").select("item_code"));
      var codeSet = {};
      (prodRes.data || []).forEach(function (r) {
        if (r.item_code) codeSet[r.item_code.toString().trim().toUpperCase()] = true;
      });

      var results = [];
      for (var i = 0; i < files.length; i++) {
        var f = files[i];
        try {
          var baseName = (f.fileName || "").replace(/\.[^/.]+$/, "").trim();
          var blob = base64ToBlob(f.base64Data, f.mimeType);
          var path = Date.now() + "_" + i + "_" + f.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
          throwIfError(await sb.storage.from(SUPABASE_IMAGE_BUCKET).upload(path, blob, {
            contentType: f.mimeType || "image/jpeg", upsert: true
          }));
          var pub = sb.storage.from(SUPABASE_IMAGE_BUCKET).getPublicUrl(path);
          var url = pub.data.publicUrl;

          if (codeSet[baseName.toUpperCase()]) {
            throwIfError(await sb.from("master_products").update({ image_url: url }).eq("item_code", baseName));
            results.push({ fileName: f.fileName, itemCode: baseName, matched: true, url: url });
          } else {
            results.push({ fileName: f.fileName, itemCode: baseName, matched: false, url: url,
              message: "ไม่พบรหัสสินค้าที่ตรงกับชื่อไฟล์: " + baseName });
          }
        } catch (e) {
          results.push({ fileName: f.fileName, matched: false, message: "อัปโหลดล้มเหลว: " + e.message });
        }
      }

      var matchedCount = results.filter(function (r) { return r.matched; }).length;
      await writeLog(adminName, "BULK_UPLOAD_IMAGES", "จับคู่สำเร็จ " + matchedCount + "/" + files.length + " ไฟล์");
      return { ok: true, results: results, matchedCount: matchedCount, total: files.length };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  // ============================================================
  //  PRICE SNAPSHOT (หักเงินเดือน)
  // ============================================================
  function computeSnapshotPrice(stockType, product, issueType, historicalPrice) {
    var st = (stockType || "").toLowerCase();
    var basePrice = Number(historicalPrice) || Number((product||{}).price) || 0;

    if (st === "medicine") return basePrice; // บันทึกต้นทุนเสมอ ไม่หักเงินเดือน

    // office, machine, uniform — หักเงินเดือนเฉพาะ issueType === 'self', 'new'
    if (st === "office" || st === "machine" || st === "uniform") {
      if (!product) return basePrice;
      var deduct = (product.deductSalary || "N").toString().trim().toUpperCase();
      var type = (issueType || "").toString().trim().toLowerCase();
      if (deduct === "Y" && type === "self" || type === "new") return basePrice; // หักเงินเดือน
      return basePrice; // บันทึกต้นทุนเสมอ (แต่ report แยกได้ว่าหักหรือไม่จาก issueType)
    }

    return basePrice;
  }

  // ============================================================
  //  RECEIVE
  // ============================================================
  async function saveReceive(stockType, record, adminName) {
    try {
      if (isFutureDate(record.date)) {
        return { ok: false, message: "❌ วันที่ดังกล่าวไม่สามารถบันทึกได้ขณะนี้ (" + record.date + ")" };
      }
      var priceVal = Number(record.price) || 0;
      throwIfError(await sb.from(tbl(stockType, "receive")).insert([{
        date: record.date, item_code: record.itemCode, item_name: record.itemName,
        qty: record.qty, price: priceVal, recorded_by: adminName, note: record.note || ""
      }]));
      // อัปเดตราคาล่าสุดใน master_products เมื่อมีราคาจริง
      if (priceVal > 0) {
        await sb.from("master_products").update({ price: priceVal }).eq("item_code", record.itemCode);
      }
      await writeLog(adminName, "RECEIVE_" + stockType.toUpperCase(), record.itemCode + " x" + record.qty);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: "Error: " + e.message };
    }
  }

  async function getReceiveHistory(stockType) {
    try {
      var res = throwIfError(await sb.from(tbl(stockType, "receive")).select("*").order("id", { ascending: false }));
      var list = (res.data || []).map(function (r) {
        return {
          rowIndex: r.id,
          timestamp: r.timestamp || "",
          date: r.date || "",
          itemCode: r.item_code || "",
          itemName: r.item_name || "",
          qty: Number(r.qty) || 0,
          price: Number(r.price) || 0,
          recordedBy: r.recorded_by || "",
          note: r.note || ""
        };
      });
      return { ok: true, data: list };
    } catch (e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  async function deleteReceive(stockType, rowIndex, adminName) {
    try {
      throwIfError(await sb.from(tbl(stockType, "receive")).delete().eq("id", rowIndex));
      await writeLog(adminName, "DELETE_RECEIVE_" + stockType.toUpperCase(), "ID " + rowIndex);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  // ============================================================
  //  ISSUE
  // ============================================================
  async function saveIssue(stockType, record, adminName) {
    try {
      if (isFutureDate(record.date)) {
        return { ok: false, message: "❌ วันที่ดังกล่าวไม่สามารถบันทึกได้ขณะนี้ (" + record.date + ")" };
      }
      var st = stockType.toLowerCase();

      // --- ตรวจยอดคงเหลือ real-time ---
      var balResult = await getBalance(st);
      if (balResult.ok && balResult.data) {
        var prod = balResult.data.filter(function (p) { return p.itemCode === record.itemCode; })[0];
        if (prod) {
          var qtyRequested = Number(record.qty) || 0;
          if (qtyRequested > prod.balance) {
            return {
              ok: false,
              message: "❌ ไม่สามารถบันทึกได้ — ยอดคงเหลือมีเพียง " + prod.balance + " " + prod.unit +
                " แต่ต้องการเบิก " + qtyRequested + " " + prod.unit + " ยอคคงเหลือไม่เพียงพอ "
            };
          }
        }
      }

      // --- แผนกพนักงานจากฐานข้อมูลหลังบ้าน ---
      var deptFromBackend = await getDeptForEmployee(record.empCode);
      var finalDept = deptFromBackend || record.dept || "";

      // --- Price Snapshot ---
      var productInfo = null;
      try {
        var allProducts = await getProducts(st.toUpperCase());
        if (allProducts.ok) {
          productInfo = allProducts.data.filter(function (p) { return p.itemCode === record.itemCode; })[0];
        }
      } catch (e) { /* ไม่มีข้อมูลสินค้า -> snapshot = 0 */ }

      var issueTypeForPricing = record.issueType || "";
      var historicalPrice = await getHistoricalPrice(st, record.itemCode, record.date);
      var priceSnapshot = computeSnapshotPrice(st, productInfo, issueTypeForPricing, historicalPrice);

      var row = {
        date: record.date, item_code: record.itemCode, item_name: record.itemName, qty: record.qty,
        emp_code: record.empCode, emp_name: record.empName, department: finalDept || null,
        recorded_by: adminName, price_snapshot: priceSnapshot
      };
      if (st === "machine") {
        row.machine_code = record.machineCode || ""; row.issue_type = record.issueType || "use"; row.note = record.note || "";
      } else if (st === "medicine") {
        row.symptom = record.symptom || ""; row.note = record.note || "";
      } else if (st === "uniform") {
        row.issue_type = record.issueType || "new"; row.note = record.note || "";
      } else if (st === "office") {
        row.issue_type = record.issueType || "use"; row.note = record.note || "";
      } else {
        row.note = record.note || "";
      }

      row.total_amount = (Number(priceSnapshot) || 0) * (Number(record.qty) || 0);
      throwIfError(await sb.from(tbl(st, "issue")).insert([row]));
      await writeLog(adminName, "ISSUE_" + stockType.toUpperCase(),
        record.itemCode + " x" + record.qty + " → " + record.empName +
        (priceSnapshot > 0 ? " (หักเงินเดือน " + priceSnapshot + " บาท)" : ""));

      return { ok: true, priceSnapshot: priceSnapshot, department: finalDept };
    } catch (e) {
      return { ok: false, message: "❌ " + e.message };
    }
  }

  async function getIssueHistory(stockType) {
    try {
      var st = stockType.toLowerCase();
      var res = throwIfError(await sb.from(tbl(st, "issue")).select("*").order("id", { ascending: false }));
      var list = (res.data || []).map(function (r) {
        var base = {
          rowIndex: r.id, timestamp: r.timestamp || "", date: r.date || "",
          itemCode: r.item_code || "", itemName: r.item_name || "", qty: Number(r.qty) || 0,
          empCode: r.emp_code || "", empName: r.emp_name || "", dept: r.department || ""
        };
        if (st === "machine") {
          base.machineCode = r.machine_code || ""; base.issueType = r.issue_type || "";
          base.note = r.note || ""; base.priceSnapshot = Number(r.price_snapshot) || 0;
        } else if (st === "medicine") {
          base.symptom = r.symptom || ""; base.note = r.note || ""; base.priceSnapshot = Number(r.price_snapshot) || 0;
        } else if (st === "uniform") {
          base.issueType = r.issue_type || ""; base.note = r.note || ""; base.priceSnapshot = Number(r.price_snapshot) || 0;
        } else if (st === "office") {
          base.issueType = r.issue_type || ""; base.note = r.note || ""; base.priceSnapshot = Number(r.price_snapshot) || 0;
        } else {
          base.note = r.note || ""; base.priceSnapshot = Number(r.price_snapshot) || 0;
        }
        return base;
      });
      return { ok: true, data: list };
    } catch (e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  async function deleteIssue(stockType, rowIndex, adminName) {
    try {
      throwIfError(await sb.from(tbl(stockType, "issue")).delete().eq("id", rowIndex));
      await writeLog(adminName, "DELETE_ISSUE_" + stockType.toUpperCase(), "ID " + rowIndex);
      return { ok: true };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }

  // ============================================================
  //  BALANCE — คำนวณยอดคงเหลือ Real-Time
  // ============================================================
  async function getBalance(stockType) {
    try {
      if (!stockType) return { ok: false, message: "กรุณาระบุประเภทสต็อก" };
      var st = stockType.toLowerCase();
      if (!STOCK_NAME[st]) return { ok: false, message: "ไม่รู้จักประเภท: " + stockType };

      var recRes = throwIfError(await sb.from(tbl(st, "receive")).select("item_code, qty"));
      var issRes = throwIfError(await sb.from(tbl(st, "issue")).select("item_code, qty"));

      var inMap = {}, outMap = {};
      (recRes.data || []).forEach(function (r) {
        var code = r.item_code ? r.item_code.toString().trim() : "";
        if (code) inMap[code] = (inMap[code] || 0) + (Number(r.qty) || 0);
      });
      (issRes.data || []).forEach(function (r) {
        var code = r.item_code ? r.item_code.toString().trim() : "";
        if (code) outMap[code] = (outMap[code] || 0) + (Number(r.qty) || 0);
      });

      var products = await getProducts(st.toUpperCase());
      if (!products.ok) return { ok: false, message: products.message || "ดึงรายการสินค้าไม่ได้" };
      if (!products.data || products.data.length === 0) {
        return { ok: true, data: [], message: "ยังไม่มีสินค้าในหมวดนี้" };
      }

      var result = products.data.map(function (p) {
        var totalIn = inMap[p.itemCode] || 0;
        var totalOut = outMap[p.itemCode] || 0;
        var balance = totalIn - totalOut;
        var status = balance <= 0 ? "OUT OF STOCK" : balance <= p.minStock ? "LOW STOCK" : "OK";
        var out = Object.assign({}, p);
        out.totalIn = totalIn; out.totalOut = totalOut; out.balance = balance; out.status = status;
        return out;
      });

      return { ok: true, data: result };
    } catch (e) {
      return { ok: false, data: [], message: "getBalance Error: " + e.message };
    }
  }

  // ============================================================
  //  DASHBOARD SUMMARY
  // ============================================================
  async function getDashboardSummary(stockType) {
    try {
      if (!stockType) return { ok: false, message: "กรุณาระบุประเภทสต็อก" };
      var bal = await getBalance(stockType);
      if (!bal.ok) return { ok: false, message: bal.message };

      var items = bal.data || [];
      var okCount = 0, low = 0, out = 0, soon = 0, unverified = 0;

      items.forEach(function (p) {
        if (p.status === "OK") okCount++;
        else if (p.status === "LOW STOCK") low++;
        else out++;

        if (p.verified !== "Y") unverified++;

        if (stockType.toLowerCase() === "medicine" && p.extra1) {
          try {
            var days = Math.ceil((new Date(p.extra1) - new Date()) / (1000 * 60 * 60 * 24));
            if (days >= 0 && days <= 30) soon++;
          } catch (e) { /* วันหมดอายุรูปแบบผิด */ }
        }
      });

      var alerts = items.filter(function (p) { return p.status !== "OK"; });

      return { ok: true, total: items.length, okCount: okCount, low: low, out: out, soon: soon, unverified: unverified, alerts: alerts };
    } catch (e) {
      return { ok: false, message: "getDashboardSummary Error: " + e.message };
    }
  }

  // ============================================================
  //  ADMIN LOGS
  // ============================================================
  async function getAdminLogs(limit) {
    try {
      limit = limit || 100;
      var countRes = throwIfError(await sb.from("admin_logs").select("id", { count: "exact", head: true }));
      var total = countRes.count || 0;
      var res = throwIfError(await sb.from("admin_logs").select("*").order("timestamp", { ascending: false }).limit(limit));
      var list = (res.data || []).map(function (r) {
        return { timestamp: r.timestamp || "", adminName: r.admin_name || "", activity: r.activity || "", detail: r.detail || "" };
      });
      return { ok: true, data: list, total: total };
    } catch (e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  // ดึงรายการเบิกที่หักเงินเดือน (price_snapshot > 0) จากทุกหมวดในครั้งเดียว
  async function getDeductionReport(dateFrom, dateTo) {
    try {
      var STOCK_TYPES = ['office', 'machine', 'uniform', 'medicine'];
      var allRows = [];

      for (var i = 0; i < STOCK_TYPES.length; i++) {
        var st = STOCK_TYPES[i];
        var q = sb.from(st + '_issue')
          .select('id,date,emp_code,emp_name,department,item_code,item_name,qty,price_snapshot,total_amount,issue_type,note')
          .in('issue_type', ['self', 'new']);
        if (dateFrom) q = q.gte('date', dateFrom);
        if (dateTo)   q = q.lte('date', dateTo);
        var res = throwIfError(await q.order('date'));

        var itemCodes = [...new Set((res.data || []).map(function(r){ return r.item_code; }))];
        var prodMap = {};
        if (itemCodes.length) {
          var pr = await sb.from('master_products').select('item_code,extra1').in('item_code', itemCodes);
          if (!pr.error) (pr.data || []).forEach(function(p){ prodMap[p.item_code] = p; });
        }

        (res.data || []).forEach(function(r) {
          var prod = prodMap[r.item_code] || {};
          var unitPrice = Number(r.price_snapshot) || 0;
          var qty = Number(r.qty) || 0;
          // ใช้ total_amount จาก DB ถ้ามี ไม่งั้นคำนวณ fallback
          var totalAmt = Number(r.total_amount) > 0 ? Number(r.total_amount) : unitPrice * qty;
          allRows.push({
            stockType: st,
            date: r.date || '',
            department: r.department || '',
            empCode: r.emp_code || '',
            empName: r.emp_name || '',
            itemCode: r.item_code || '',
            itemName: r.item_name || '',
            partNo: prod.extra1 || '',
            pricePerUnit: unitPrice,
            qty: qty,
            totalAmount: totalAmt,
            note: r.note || '',
            issueType: r.issue_type || ''
          });
        });
      }

      return { ok: true, data: allRows };
    } catch(e) {
      return { ok: false, data: [], message: e.message };
    }
  }

  async function getHistoricalPrice(stockType, itemCode, targetDate) {
    try {
      var res = await sb.from(tbl(stockType, "receive"))
        .select("price, date")
        .eq("item_code", itemCode)
        .lte("date", targetDate)          // date <= วันที่เบิก
        .gt("price", 0)                   // มีราคาจริง
        .order("date", { ascending: false })
        .limit(1)
        .single();
      if (res.error || !res.data) return 0;
      return Number(res.data.price) || 0;
    } catch(e) { return 0; }
  }

  async function getDashboardReport(dateFrom, dateTo) {
    try {
      var TYPES = ['office','machine','uniform','medicine'];
      var issueRows = [], receiveRows = [], products = [];

      // ดึงข้อมูลขนานกัน
      var [prodRes, ...issueResults] = await Promise.all([
        sb.from('master_products').select('item_code,stock_type,price,unit,item_name,category,extra1,extra2'),
        ...TYPES.map(function(st) {
          var cols = 'date,item_code,item_name,qty,price_snapshot,total_amount,issue_type,department'
            + (st === 'machine' ? ',machine_code' : '');
          var q = sb.from(st+'_issue').select(cols);
          if (dateFrom) q = q.gte('date', dateFrom);
          if (dateTo)   q = q.lte('date', dateTo);
          return q;
        })
      ]);
      if (!prodRes.error) products = prodRes.data || [];

      var receiveResults = await Promise.all(
        TYPES.map(function(st) {
          return sb.from(st+'_receive').select('item_code,qty,price,date').order('date',{ascending:false});
        })
      );

      TYPES.forEach(function(st, i) {
        (issueResults[i].data || []).forEach(function(r) { r._stockType = st; issueRows.push(r); });
        (receiveResults[i].data || []).forEach(function(r) { r._stockType = st; receiveRows.push(r); });
      });

      return { ok: true, issueRows: issueRows, receiveRows: receiveRows, products: products };
    } catch(e) {
      return { ok: false, issueRows: [], receiveRows: [], products: [], message: e.message };
    }
  }

  return {
    getDropdownOptions: getDropdownOptions,
    login: login,
    changePassword: changePassword,
    getAdminList: getAdminList,
    saveAdminList: saveAdminList,
    getEmployees: getEmployees,
    saveEmployee: saveEmployee,
    deleteEmployee: deleteEmployee,
    getDepartments: getDepartments,
    saveDepartment: saveDepartment,
    deleteDepartment: deleteDepartment,
    getProducts: getProducts,
    saveProduct: saveProduct,
    deleteProduct: deleteProduct,
    setVerifiedStatus: setVerifiedStatus,
    uploadImage: uploadImage,
    bulkUploadImages: bulkUploadImages,
    saveReceive: saveReceive,
    getReceiveHistory: getReceiveHistory,
    deleteReceive: deleteReceive,
    saveIssue: saveIssue,
    getIssueHistory: getIssueHistory,
    deleteIssue: deleteIssue,
    getBalance: getBalance,
    getDashboardSummary: getDashboardSummary,
    getAdminLogs: getAdminLogs,
    getDeductionReport: getDeductionReport,
    getHistoricalPrice: getHistoricalPrice,
    getDashboardReport: getDashboardReport,
  };
})();

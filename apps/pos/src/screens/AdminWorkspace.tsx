import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";

interface Envelope<T> { data: T; message: { code: string; text: string } | null; }
interface CategoryRow { id: string; name: string; sortOrder: number; isActive: boolean; }
interface PresetRow { id: string; name: string; weight: string | null; pricePerUnit: string | null; fixedPrice: string | null; isActive: boolean; }
interface ProductRow {
  id: string;
  categoryId: string;
  name: string;
  code: string;
  pricingType: "WEIGHT_BASED" | "FIXED_PACKAGE";
  defaultPricePerUnit: string | null;
  defaultFixedPrice: string | null;
  estimatedCostPerUnit: string | null;
  lowStockThreshold: number;
  isActive: boolean;
  category: { id: string; name: string };
  presets: PresetRow[];
}
interface UserRow { id: string; username: string; displayName: string; role: "ADMIN" | "SELLER"; isActive: boolean; createdAt: string; }
interface OrderRow { id: string; code: string; status: "COMPLETED" | "CANCELLED"; totalAmount: string; createdAt: string; items: Array<{ id: string; packageCodeSnapshot: string; productNameSnapshot: string; }>; }
interface PageResult<T> { items: T[]; total: number; page: number; pageSize: number; }
interface InventoryHistoryRow {
  id: string;
  type: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
  package: { code: string; product: { name: string } };
  createdBy: { displayName: string };
}
interface AuditRow {
  id: string;
  category: string;
  action: string;
  success: boolean;
  actorUsernameAttempted: string | null;
  createdAt: string;
  actor: { displayName: string } | null;
}
type AdminPage = "MENU" | "CATALOG" | "USERS" | "ORDERS" | "INVENTORY_HISTORY" | "AUDIT" | "SETTINGS";

async function read<T>(request: Promise<AxiosResponse<Envelope<T>, unknown>>): Promise<T> {
  return (await request).data.data;
}

function get<T>(api: AxiosInstance, path: string, config?: AxiosRequestConfig<unknown>): Promise<T> {
  return read(api.get<Envelope<T>, AxiosResponse<Envelope<T>, unknown>, unknown>(path, config));
}

function post<T>(api: AxiosInstance, path: string, body: unknown): Promise<T> {
  return read(api.post<Envelope<T>, AxiosResponse<Envelope<T>, unknown>, unknown>(path, body));
}

function put<T>(api: AxiosInstance, path: string, body: unknown): Promise<T> {
  return read(api.put<Envelope<T>, AxiosResponse<Envelope<T>, unknown>, unknown>(path, body));
}

function patch<T>(api: AxiosInstance, path: string, body: unknown): Promise<T> {
  return read(api.patch<Envelope<T>, AxiosResponse<Envelope<T>, unknown>, unknown>(path, body));
}

function errorText(error: unknown): string {
  if (axios.isAxiosError<Envelope<unknown>>(error)) {
    const message = error.response?.data?.message?.text;
    if (message) return message;
  }
  return error instanceof Error ? error.message : "Không thể hoàn tất thao tác.";
}

function AdminCard({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return <section className="content-card">
    <div className="screen-actions"><button type="button" className="secondary-button" onClick={onBack}>← QUẢN LÝ</button></div>
    <h2>{title}</h2>
    {children}
  </section>;
}

export function AdminWorkspace({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [page, setPage] = useState<AdminPage>("MENU");
  if (page === "MENU") {
    const actions: Array<{ page: AdminPage; label: string }> = [
      { page: "CATALOG", label: "DANH MỤC & SẢN PHẨM" },
      { page: "USERS", label: "NGƯỜI DÙNG" },
      { page: "ORDERS", label: "ĐƠN HÀNG" },
      { page: "INVENTORY_HISTORY", label: "LỊCH SỬ KHO" },
      { page: "AUDIT", label: "NHẬT KÝ HOẠT ĐỘNG" },
      { page: "SETTINGS", label: "CÀI ĐẶT GIÁ" },
    ];
    return <AdminCard title="QUẢN LÝ" onBack={onBack}>
      <div className="admin-action-grid">{actions.map((action) => <button type="button" className="action-button" key={action.page} onClick={() => setPage(action.page)}>{action.label}</button>)}</div>
    </AdminCard>;
  }
  const returnToMenu = () => setPage("MENU");
  if (page === "CATALOG") return <CatalogAdmin api={api} onBack={returnToMenu} />;
  if (page === "USERS") return <UsersAdmin api={api} onBack={returnToMenu} />;
  if (page === "ORDERS") return <OrdersAdmin api={api} onBack={returnToMenu} />;
  if (page === "INVENTORY_HISTORY") return <InventoryHistoryAdmin api={api} onBack={returnToMenu} />;
  if (page === "AUDIT") return <AuditAdmin api={api} onBack={returnToMenu} />;
  return <SettingsAdmin api={api} onBack={returnToMenu} />;
}

function CatalogAdmin({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [productName, setProductName] = useState("");
  const [productCode, setProductCode] = useState("");
  const [pricingType, setPricingType] = useState<ProductRow["pricingType"]>("WEIGHT_BASED");
  const [productPrice, setProductPrice] = useState("");
  const [estimatedCost, setEstimatedCost] = useState("");
  const [lowStockThreshold, setLowStockThreshold] = useState("5");
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [presetProductId, setPresetProductId] = useState("");
  const [presetName, setPresetName] = useState("");
  const [presetWeight, setPresetWeight] = useState("");
  const [presetPrice, setPresetPrice] = useState("");
  const [presetPriceKind, setPresetPriceKind] = useState<"FIXED" | "PER_UNIT">("FIXED");

  useEffect(() => {
    let active = true;
    void Promise.all([
      get<CategoryRow[]>(api, "/api/v1/categories", { params: { includeInactive: true } }),
      get<ProductRow[]>(api, "/api/v1/products", { params: { includeInactive: true } }),
    ]).then(([nextCategories, nextProducts]) => {
      if (!active) return;
      setCategories(nextCategories);
      setProducts(nextProducts);
      setCategoryId((current) => current || nextCategories[0]?.id || "");
      setPresetProductId((current) => current || nextProducts[0]?.id || "");
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api, reload]);

  const selectedProduct = useMemo(() => products.find((item) => item.id === presetProductId), [products, presetProductId]);
  const resetProductForm = () => {
    setEditingProductId(null);
    setProductName(""); setProductCode(""); setProductPrice(""); setEstimatedCost(""); setLowStockThreshold("5");
    setPricingType("WEIGHT_BASED");
  };

  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null);
    try {
      const body = { name: categoryName, sortOrder: 0 };
      if (editingCategoryId) await put(api, `/api/v1/categories/${editingCategoryId}`, body);
      else await post(api, "/api/v1/categories", body);
      setNotice(editingCategoryId ? "Đã cập nhật danh mục." : "Đã tạo danh mục.");
      setCategoryName(""); setEditingCategoryId(null); setReload((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
  }

  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null);
    const body = {
      categoryId, name: productName, code: productCode.toUpperCase(), pricingType, baseUnit: "kg",
      lowStockThreshold: Number(lowStockThreshold),
      ...(estimatedCost.length > 0 ? { estimatedCostPerUnit: estimatedCost } : {}),
      ...(pricingType === "WEIGHT_BASED" ? { defaultPricePerUnit: productPrice } : { defaultFixedPrice: productPrice }),
    };
    try {
      if (editingProductId) await put(api, `/api/v1/products/${editingProductId}`, body);
      else await post(api, "/api/v1/products", body);
      setNotice(editingProductId ? "Đã cập nhật sản phẩm." : "Đã tạo sản phẩm.");
      resetProductForm(); setReload((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
  }

  async function savePreset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(null); setNotice(null);
    if (!selectedProduct) { setError("Hãy chọn sản phẩm trước."); return; }
    const body = selectedProduct.pricingType === "WEIGHT_BASED"
      ? { pricingType: selectedProduct.pricingType, name: presetName, weight: presetWeight, ...(presetPriceKind === "FIXED" ? { fixedPrice: presetPrice } : { pricePerUnit: presetPrice }) }
      : { pricingType: selectedProduct.pricingType, name: presetName, weight: presetWeight || undefined, fixedPrice: presetPrice };
    try {
      await post(api, `/api/v1/products/${selectedProduct.id}/presets`, body);
      setNotice("Đã tạo mẫu hộp."); setPresetName(""); setPresetWeight(""); setPresetPrice("");
      setReload((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
  }

  async function setActive(path: string, isActive: boolean) {
    if (!isActive && !window.confirm("Bạn muốn ngừng hoạt động mục này? Lịch sử giao dịch sẽ được giữ nguyên.")) return;
    setError(null); setNotice(null);
    try {
      await patch(api, path, { isActive });
      setNotice(isActive ? "Đã bật lại." : "Đã ngừng hoạt động."); setReload((value) => value + 1);
    } catch (cause) { setError(errorText(cause)); }
  }

  return <AdminCard title="DANH MỤC & SẢN PHẨM" onBack={onBack}>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="status-message">{notice}</p>}
    <div className="admin-columns">
      <section><h3>Danh mục</h3>
        <form className="admin-form" onSubmit={(event) => void saveCategory(event)}>
          <label>Tên danh mục<input className="pos-input" required maxLength={100} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} /></label>
          <div className="screen-actions"><button className="primary-button">{editingCategoryId ? "LƯU DANH MỤC" : "THÊM DANH MỤC"}</button>{editingCategoryId && <button type="button" className="secondary-button" onClick={() => { setEditingCategoryId(null); setCategoryName(""); }}>HỦY</button>}</div>
        </form>
        {categories.map((category) => <div className="admin-row" key={category.id}><span>{category.name} {!category.isActive && "(đã ẩn)"}</span><div className="screen-actions">
          <button className="secondary-button" onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }}>SỬA</button>
          <button className="secondary-button" onClick={() => void setActive(`/api/v1/categories/${category.id}/active`, !category.isActive)}>{category.isActive ? "ẨN" : "BẬT"}</button>
        </div></div>)}
      </section>
      <section><h3>{editingProductId ? "Sửa sản phẩm" : "Tạo sản phẩm"}</h3>
        <form className="admin-form" onSubmit={(event) => void saveProduct(event)}>
          <label>Danh mục<select className="pos-select" required value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{categories.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Tên sản phẩm<input className="pos-input" required maxLength={100} value={productName} onChange={(event) => setProductName(event.target.value)} /></label>
          <label>Mã sản phẩm<input className="pos-input" required maxLength={10} value={productCode} onChange={(event) => setProductCode(event.target.value.toUpperCase())} /></label>
          <label>Kiểu tính giá<select className="pos-select" value={pricingType} onChange={(event) => { setPricingType(event.target.value as ProductRow["pricingType"]); setProductPrice(""); }}><option value="WEIGHT_BASED">Theo kg</option><option value="FIXED_PACKAGE">Theo hộp</option></select></label>
          <label>{pricingType === "WEIGHT_BASED" ? "Giá mặc định / kg" : "Giá mặc định / hộp"}<input className="pos-input" required inputMode="decimal" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} /></label>
          <label>Ngưỡng sắp hết (hộp)<input className="pos-input" type="number" min="0" value={lowStockThreshold} onChange={(event) => setLowStockThreshold(event.target.value)} /></label>
          <div className="screen-actions"><button className="primary-button">{editingProductId ? "LƯU SẢN PHẨM" : "THÊM SẢN PHẨM"}</button>{editingProductId && <button type="button" className="secondary-button" onClick={resetProductForm}>HỦY</button>}</div>
        </form>
        <div className="admin-list">{products.map((product) => <article className="admin-row" key={product.id}>
          <span><strong>{product.name}</strong><br /><small>{product.code} · {product.category.name} · {product.pricingType === "WEIGHT_BASED" ? `${product.defaultPricePerUnit ?? "—"}đ/kg` : `${product.defaultFixedPrice ?? "—"}đ/hộp`}{!product.isActive && " · đã ẩn"}</small></span>
          <div className="screen-actions"><button className="secondary-button" onClick={() => { setEditingProductId(product.id); setProductName(product.name); setProductCode(product.code); setCategoryId(product.categoryId); setPricingType(product.pricingType); setProductPrice(product.pricingType === "WEIGHT_BASED" ? product.defaultPricePerUnit ?? "" : product.defaultFixedPrice ?? ""); setEstimatedCost(product.estimatedCostPerUnit ?? ""); setLowStockThreshold(String(product.lowStockThreshold)); }}>SỬA</button><button className="secondary-button" onClick={() => void setActive(`/api/v1/products/${product.id}/active`, !product.isActive)}>{product.isActive ? "ẨN" : "BẬT"}</button></div>
        </article>)}</div>
      </section>
    </div>
    <section><h3>Mẫu hộp</h3>
      <form className="admin-form admin-inline-form" onSubmit={(event) => void savePreset(event)}>
        <label>Sản phẩm<select className="pos-select" value={presetProductId} onChange={(event) => setPresetProductId(event.target.value)}>{products.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>Tên mẫu<input className="pos-input" required value={presetName} onChange={(event) => setPresetName(event.target.value)} /></label>
        <label>Khối lượng (kg)<input className="pos-input" required={selectedProduct?.pricingType === "WEIGHT_BASED"} value={presetWeight} onChange={(event) => setPresetWeight(event.target.value)} /></label>
        {selectedProduct?.pricingType === "WEIGHT_BASED" && <label>Loại giá<select className="pos-select" value={presetPriceKind} onChange={(event) => setPresetPriceKind(event.target.value as "FIXED" | "PER_UNIT")}><option value="FIXED">Giá cố định / hộp</option><option value="PER_UNIT">Giá / kg</option></select></label>}
        <label>{selectedProduct?.pricingType === "WEIGHT_BASED" && presetPriceKind === "PER_UNIT" ? "Giá / kg" : "Giá / hộp"}<input className="pos-input" required inputMode="decimal" value={presetPrice} onChange={(event) => setPresetPrice(event.target.value)} /></label>
        <button className="primary-button">THÊM MẪU</button>
      </form>
      {products.flatMap((product) => product.presets.map((preset) => <div className="admin-row" key={preset.id}><span>{product.name} · {preset.name} · {preset.weight ?? "—"}kg · {preset.fixedPrice ?? preset.pricePerUnit ?? "—"}đ {!preset.isActive && "(đã ẩn)"}</span><button className="secondary-button" onClick={() => void setActive(`/api/v1/products/${product.id}/presets/${preset.id}/active`, !preset.isActive)}>{preset.isActive ? "ẨN" : "BẬT"}</button></div>))}
    </section>
  </AdminCard>;
}

function UsersAdmin({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [username, setUsername] = useState(""); const [displayName, setDisplayName] = useState(""); const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRow["role"]>("SELLER");
  useEffect(() => { let active = true; void get<UserRow[]>(api, "/api/v1/users").then((rows) => { if (active) setUsers(rows); }).catch((cause: unknown) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [api, reload]);
  async function createUser(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); setNotice(null); try { await post(api, "/api/v1/users", { username, displayName, password, role }); setUsername(""); setDisplayName(""); setPassword(""); setNotice("Đã tạo tài khoản."); setReload((value) => value + 1); } catch (cause) { setError(errorText(cause)); } }
  async function changeStatus(user: UserRow) { if (user.isActive && !window.confirm(`Khóa tài khoản ${user.displayName}?`)) return; setError(null); try { await patch(api, `/api/v1/users/${user.id}/active`, { isActive: !user.isActive }); setReload((value) => value + 1); } catch (cause) { setError(errorText(cause)); } }
  async function changeRole(user: UserRow) { const nextRole = user.role === "ADMIN" ? "SELLER" : "ADMIN"; if (!window.confirm(`Đổi quyền ${user.displayName} thành ${nextRole === "ADMIN" ? "Quản lý" : "Người bán"}?`)) return; setError(null); try { await put(api, `/api/v1/users/${user.id}`, { displayName: user.displayName, role: nextRole }); setReload((value) => value + 1); } catch (cause) { setError(errorText(cause)); } }
  async function resetPassword(user: UserRow) { const nextPassword = window.prompt(`Mật khẩu mới cho ${user.displayName} (ít nhất 8 ký tự):`); if (nextPassword == null) return; setError(null); try { await post(api, `/api/v1/users/${user.id}/reset-password`, { password: nextPassword }); setNotice(`Đã đặt lại mật khẩu và đăng xuất các thiết bị của ${user.displayName}.`); } catch (cause) { setError(errorText(cause)); } }
  return <AdminCard title="NGƯỜI DÙNG" onBack={onBack}>
    {error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="status-message">{notice}</p>}
    <form className="admin-form admin-inline-form" onSubmit={(event) => void createUser(event)}>
      <label>Tên đăng nhập<input className="pos-input" required minLength={3} maxLength={50} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
      <label>Tên hiển thị<input className="pos-input" required value={displayName} onChange={(event) => setDisplayName(event.target.value)} /></label>
      <label>Mật khẩu ban đầu<input className="pos-input" required minLength={8} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label>Quyền<select className="pos-select" value={role} onChange={(event) => setRole(event.target.value as UserRow["role"])}><option value="SELLER">Người bán</option><option value="ADMIN">Quản lý</option></select></label>
      <button className="primary-button">TẠO TÀI KHOẢN</button>
    </form>
    {users.map((user) => <div className="admin-row" key={user.id}><span>{user.displayName} · {user.username} · {user.role === "ADMIN" ? "Quản lý" : "Người bán"} · {user.isActive ? "Đang hoạt động" : "Đã khóa"}</span><div className="screen-actions"><button className="secondary-button" onClick={() => void changeRole(user)}>ĐỔI QUYỀN</button><button className="secondary-button" onClick={() => void resetPassword(user)}>ĐẶT LẠI MẬT KHẨU</button><button className="secondary-button" onClick={() => void changeStatus(user)}>{user.isActive ? "KHÓA" : "MỞ KHÓA"}</button></div></div>)}
  </AdminCard>;
}

function OrdersAdmin({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [orders, setOrders] = useState<PageResult<OrderRow> | null>(null);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("Nhập nhầm đơn hàng");
  useEffect(() => { let active = true; void get<PageResult<OrderRow>>(api, "/api/v1/orders", { params: { page: 1, pageSize: 50 } }).then((value) => { if (active) setOrders(value); }).catch((cause: unknown) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [api, reload]);
  async function cancel(order: OrderRow) { if (!window.confirm(`Hủy đơn ${order.code} và đưa ${order.items.length} hộp trở lại kho?`)) return; setError(null); try { await post(api, `/api/v1/orders/${order.id}/cancel`, { reason }); setReload((value) => value + 1); } catch (cause) { setError(errorText(cause)); } }
  return <AdminCard title="ĐƠN HÀNG" onBack={onBack}>
    {error && <p className="error-message" role="alert">{error}</p>}
    <label>Lý do hủy đơn<input className="pos-input" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
    {orders?.items.map((order) => <article className="admin-row" key={order.id}><span><strong>{order.code}</strong> · {order.items.length} hộp · {order.totalAmount}đ · {new Date(order.createdAt).toLocaleString("vi-VN")} · {order.status === "COMPLETED" ? "Đã bán" : "Đã hủy"}<br /><small>{order.items.map((item) => `${item.productNameSnapshot} (${item.packageCodeSnapshot})`).join(", ")}</small></span>{order.status === "COMPLETED" && <button className="secondary-button" onClick={() => void cancel(order)}>HỦY ĐƠN</button>}</article>)}
    {orders?.items.length === 0 && <p>Chưa có đơn hàng.</p>}
  </AdminCard>;
}

function InventoryHistoryAdmin({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [result, setResult] = useState<PageResult<InventoryHistoryRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; void get<PageResult<InventoryHistoryRow>>(api, "/api/v1/inventory/transactions", { params: { page: 1, pageSize: 100 } }).then((value) => { if (active) setResult(value); }).catch((cause: unknown) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [api]);
  return <AdminCard title="LỊCH SỬ KHO" onBack={onBack}>{error && <p className="error-message" role="alert">{error}</p>}{result?.items.map((row) => <div className="admin-row" key={row.id}><span>{new Date(row.createdAt).toLocaleString("vi-VN")} · {row.type} · {row.package.product.name} · {row.package.code} · {row.createdBy.displayName}{row.reason ? ` · ${row.reason}` : ""}{row.note ? ` · ${row.note}` : ""}</span></div>)}{result?.items.length === 0 && <p>Chưa có giao dịch kho.</p>}</AdminCard>;
}

function AuditAdmin({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [result, setResult] = useState<PageResult<AuditRow> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { let active = true; void get<PageResult<AuditRow>>(api, "/api/v1/audit-log", { params: { page: 1, pageSize: 100 } }).then((value) => { if (active) setResult(value); }).catch((cause: unknown) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [api]);
  return <AdminCard title="NHẬT KÝ HOẠT ĐỘNG" onBack={onBack}>{error && <p className="error-message" role="alert">{error}</p>}{result?.items.map((row) => <div className="admin-row" key={row.id}><span>{new Date(row.createdAt).toLocaleString("vi-VN")} · {row.category} · {row.action} · {row.success ? "Thành công" : "Thất bại"} · {row.actor?.displayName ?? row.actorUsernameAttempted ?? "Không xác định"}</span></div>)}{result?.items.length === 0 && <p>Chưa có hoạt động được ghi nhận.</p>}</AdminCard>;
}

function SettingsAdmin({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [value, setValue] = useState("20"); const [error, setError] = useState<string | null>(null); const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => { let active = true; void get<{ maxDeviationPercent: number }>(api, "/api/v1/settings/price-override-threshold").then((result) => { if (active) setValue(String(result.maxDeviationPercent)); }).catch((cause: unknown) => { if (active) setError(errorText(cause)); }); return () => { active = false; }; }, [api]);
  async function save(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setError(null); setNotice(null); try { await put(api, "/api/v1/settings/price-override-threshold", { maxDeviationPercent: Number(value) }); setNotice("Đã lưu giới hạn đổi giá."); } catch (cause) { setError(errorText(cause)); } }
  return <AdminCard title="CÀI ĐẶT GIÁ" onBack={onBack}>{error && <p className="error-message" role="alert">{error}</p>}{notice && <p className="status-message">{notice}</p>}<form className="admin-form" onSubmit={(event) => void save(event)}><label>Biên độ cho phép người bán đổi giá (%)<input className="pos-input" type="number" min="0" max="1000" step="0.1" value={value} onChange={(event) => setValue(event.target.value)} /></label><p>Giới hạn so sánh với giá mặc định cùng kiểu. Quản lý vẫn có thể duyệt mọi mức giá.</p><button className="primary-button">LƯU CÀI ĐẶT</button></form></AdminCard>;
}

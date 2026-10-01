import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from "axios";
import Decimal from "decimal.js";
import { parseWeight, resolvePriceBasis } from "@seafood-pos/utils";
import { AdminWorkspace } from "./AdminWorkspace";
import { useCartStore } from "../stores/cartStore";

export interface LoggedInUser {
  id: string;
  username: string;
  displayName: string;
  role: "ADMIN" | "SELLER";
}

interface Envelope<T> { data: T; message: { code: string; text: string }; }
interface Category { id: string; name: string; }
interface Preset { id: string; name: string; weight: string | null; pricePerUnit: string | null; fixedPrice: string | null; }
interface Product {
  id: string;
  name: string;
  code: string;
  imageUrl: string | null;
  pricingType: "WEIGHT_BASED" | "FIXED_PACKAGE";
  defaultPricePerUnit: string | null;
  defaultFixedPrice: string | null;
  category: Category;
  presets: Preset[];
}
interface PackageItem {
  id: string;
  code: string;
  actualWeight: string;
  sellingPrice: string;
  product?: { name: string };
}
interface InventoryItem {
  id: string;
  name: string;
  code: string;
  boxCount: number;
  totalWeight: string;
  totalValue: string;
  isLowStock: boolean;
  category: Category;
}
interface Dashboard {
  revenue: string;
  orderCount: number;
  boxCount: number;
  totalWeight: string;
  lowStock: Array<{ productId: string; productName: string; boxCount: number; threshold: number }>;
}
interface StockInResult { session: { code: string }; packageCount: number; totalWeight: string; packages: PackageItem[]; }
interface OrderResult { code: string; totalAmount: string; items: Array<{ id: string }>; }
interface StockInBatch { weights: string[]; presetId: string | null; priceOverride: string; }
type Page = "HOME" | "SELL" | "STOCK_IN" | "INVENTORY" | "REVENUE" | "ADMIN";

function previewStockInPrice(product: Product, preset: Preset | undefined, weight: string, override: string) {
  try {
    const pricing = resolvePriceBasis(
      {
        pricingType: product.pricingType,
        defaultPricePerUnit: product.defaultPricePerUnit == null ? null : new Decimal(product.defaultPricePerUnit),
        defaultFixedPrice: product.defaultFixedPrice == null ? null : new Decimal(product.defaultFixedPrice),
      },
      preset == null ? null : {
        weight: preset.weight == null ? null : new Decimal(preset.weight),
        pricePerUnit: preset.pricePerUnit == null ? null : new Decimal(preset.pricePerUnit),
        fixedPrice: preset.fixedPrice == null ? null : new Decimal(preset.fixedPrice),
      },
      product.pricingType === "WEIGHT_BASED"
        ? { pricingType: product.pricingType, actualWeight: parseWeight(weight), ...(override.length > 0 ? { pricePerUnitOverride: new Decimal(override) } : {}) }
        : { pricingType: product.pricingType, actualWeight: parseWeight(weight), ...(override.length > 0 ? { fixedPriceOverride: new Decimal(override) } : {}) },
    );
    return { amount: pricing.sellingPrice.toFixed(), error: null };
  } catch (error) {
    return { amount: null, error: error instanceof Error ? error.message : "Không tính được giá xem trước" };
  }
}

async function requestData<T>(request: Promise<AxiosResponse<Envelope<T>, unknown>>): Promise<T> {
  return (await request).data.data;
}

function getData<T>(api: AxiosInstance, path: string, config?: AxiosRequestConfig<unknown>): Promise<T> {
  return requestData(api.get<Envelope<T>, AxiosResponse<Envelope<T>, unknown>, unknown>(path, config));
}

function postData<T>(api: AxiosInstance, path: string, body: unknown): Promise<T> {
  return requestData(api.post<Envelope<T>, AxiosResponse<Envelope<T>, unknown>, unknown>(path, body));
}

function errorText(error: unknown): string {
  if (axios.isAxiosError<Envelope<unknown>>(error)) {
    const message = error.response?.data?.message?.text;
    if (message) return message;
  }
  return error instanceof Error ? error.message : "Không thể hoàn tất thao tác. Hãy thử lại.";
}

function moneyToInteger(value: string): bigint {
  const [whole, fraction = "0"] = value.split(".");
  if (fraction.split("").some((digit) => digit !== "0")) throw new Error("Giá trong đơn chưa được làm tròn về đồng");
  return BigInt(whole ?? "0");
}

function formatMoney(value: bigint | string): string {
  const amount = typeof value === "bigint" ? value : moneyToInteger(value);
  return `${new Intl.NumberFormat("vi-VN").format(amount)}đ`;
}

function formatWeight(value: string): string {
  return `${Number(value).toFixed(3).replace(/0+$/, "").replace(/\.$/, "")} kg`;
}

export function PosWorkspace({
  api,
  user,
  onLogout,
}: {
  api: AxiosInstance;
  user: LoggedInUser;
  onLogout: () => Promise<void>;
}) {
  const [page, setPage] = useState<Page>("HOME");
  const [logoutError, setLogoutError] = useState<string | null>(null);
  async function logout() {
    setLogoutError(null);
    try {
      await onLogout();
    } catch (error) {
      setLogoutError(errorText(error));
    }
  }
  return (
    <main className="workspace">
      <header className="workspace-header">
        <div><h1>Seafood POS</h1><p>Xin chào, {user.displayName}</p></div>
        <button className="secondary-button" onClick={() => void logout()}>ĐĂNG XUẤT</button>
      </header>
      {logoutError != null && <p className="error-message" role="alert">{logoutError}</p>}
      {page === "HOME" && <HomePage user={user} onNavigate={setPage} />}
      {page === "SELL" && <SellPage api={api} onBack={() => setPage("HOME")} />}
      {page === "STOCK_IN" && <StockInPage api={api} onBack={() => setPage("HOME")} />}
      {page === "INVENTORY" && <InventoryPage api={api} onBack={() => setPage("HOME")} />}
      {page === "REVENUE" && <RevenuePage api={api} onBack={() => setPage("HOME")} />}
      {page === "ADMIN" && user.role === "ADMIN" && <AdminWorkspace api={api} onBack={() => setPage("HOME")} />}
    </main>
  );
}

function HomePage({ user, onNavigate }: { user: LoggedInUser; onNavigate: (page: Page) => void }) {
  const actions: Array<{ page: Page; label: string }> = [
    { page: "SELL", label: "BÁN HÀNG" },
    { page: "STOCK_IN", label: "THÊM HÀNG" },
    { page: "INVENTORY", label: "XEM KHO" },
    { page: "REVENUE", label: "DOANH THU" },
  ];
  return (
    <section className="action-grid" aria-label="Thao tác chính">
      {actions.map((action) => <button key={action.page} className="action-button" onClick={() => onNavigate(action.page)}>{action.label}</button>)}
      {user.role === "ADMIN" && <button className="action-button admin-action" onClick={() => onNavigate("ADMIN")}>QUẢN LÝ</button>}
    </section>
  );
}

function ScreenCard({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <section className="content-card">
      <div className="screen-actions"><button className="secondary-button" onClick={onBack}>← TRANG CHÍNH</button></div>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function SellPage({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const cart = useCartStore((state) => state.items);
  const addToCart = useCartStore((state) => state.addPackage);
  const removeFromCart = useCartStore((state) => state.removePackage);
  const replaceCart = useCartStore((state) => state.replacePackages);
  const clearCart = useCartStore((state) => state.clear);
  const [validatingCart, setValidatingCart] = useState(false);
  const validatedCartKey = useRef<string | null>(null);
  const [scanCode, setScanCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const total = useMemo(() => cart.reduce((sum, item) => sum + moneyToInteger(item.sellingPrice), 0n), [cart]);
  const cartKey = cart.map((item) => item.id).sort().join("|");

  useEffect(() => {
    if (cart.length === 0) { validatedCartKey.current = ""; setValidatingCart(false); return; }
    if (validatedCartKey.current === cartKey) return;
    validatedCartKey.current = cartKey;
    let active = true;
    setError(null);
    setValidatingCart(true);
    void Promise.all(cart.map(async (item) => {
      try {
        return await getData<PackageItem>(api, `/api/v1/packages/by-code/${encodeURIComponent(item.code)}`);
      } catch (cause) {
        if (axios.isAxiosError(cause) && cause.response?.status === 404) return null;
        throw cause;
      }
    })).then((checked) => {
      if (!active) return;
      const available = checked.filter((item): item is PackageItem => item !== null);
      const missingCount = checked.length - available.length;
      const nextKey = available.map((item) => item.id).sort().join("|");
      validatedCartKey.current = nextKey;
      const changed = available.length !== cart.length || available.some((item, index) => {
        const previous = cart[index];
        return previous == null || previous.id !== item.id || previous.sellingPrice !== item.sellingPrice || previous.actualWeight !== item.actualWeight || previous.product?.name !== item.product?.name;
      });
      if (changed) replaceCart(available);
      if (missingCount > 0) setNotice(`${missingCount} hộp trong giỏ không còn hàng và đã được bỏ khỏi đơn.`);
      setValidatingCart(false);
    }).catch((cause: unknown) => {
      if (!active) return;
      validatedCartKey.current = null;
      setError(errorText(cause));
      setValidatingCart(false);
    });
    return () => {
      active = false;
      if (validatedCartKey.current === cartKey) validatedCartKey.current = null;
    };
  }, [api, cart, cartKey, replaceCart]);

  useEffect(() => {
    let active = true;
    void getData<Product[]>(api, "/api/v1/products").then((items) => {
      if (active) setProducts(items);
    }).catch((cause: unknown) => {
      if (active) setError(errorText(cause));
    });
    return () => { active = false; };
  }, [api]);

  useEffect(() => {
    let active = true;
    if (productId.length === 0) { setPackages([]); return () => { active = false; }; }
    void getData<{ items: PackageItem[] }>(api, `/api/v1/inventory/products/${productId}/packages`, { params: { status: "IN_STOCK", page: 1, pageSize: 100 } })
      .then((result) => { if (active) setPackages(result.items); })
      .catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api, productId]);

  function addPackage(item: PackageItem) {
    addToCart(item);
    setNotice(null);
    setError(null);
  }

  async function scan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = scanCode.trim();
    if (code.length === 0) return;
    setError(null);
    try {
      const item = await getData<PackageItem>(api, `/api/v1/packages/by-code/${encodeURIComponent(code)}`);
      addPackage(item);
      setScanCode("");
    } catch (cause) { setError(errorText(cause)); }
  }

  async function checkout(paymentMethod: "CASH" | "TRANSFER") {
    if (cart.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const order = await postData<OrderResult>(api, "/api/v1/orders", {
        packageIds: cart.map((item) => item.id),
        paymentMethod,
      });
      setNotice(`ĐÃ BÁN ${order.items.length} HỘP — ĐƠN ${order.code} — ${formatMoney(order.totalAmount)}`);
      clearCart();
      setProductId("");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return (
    <ScreenCard title="BÁN HÀNG" onBack={onBack}>
      {notice != null && <p className="status-message">{notice}</p>}
      {error != null && <p className="error-message" role="alert">{error}</p>}
      <form className="toolbar" onSubmit={(event) => void scan(event)}>
        <label>Mã hộp / mã vạch<input className="pos-input" value={scanCode} onChange={(event) => setScanCode(event.target.value)} /></label>
        <button className="secondary-button">TÌM HỘP</button>
      </form>
      <div className="two-column">
        <div>
          <label className="toolbar">Chọn sản phẩm
            <select className="pos-select" value={productId} onChange={(event) => setProductId(event.target.value)}>
              <option value="">Tất cả sản phẩm</option>
              {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
            </select>
          </label>
          <div className="package-grid">
            {packages.map((item) => <button key={item.id} className="package-button" onClick={() => addPackage(item)}>
              <strong>{formatWeight(item.actualWeight)}</strong><small>{formatMoney(item.sellingPrice)} · {item.code}</small>
            </button>)}
          </div>
          {productId.length === 0 && <p>Chọn sản phẩm để xem các hộp còn trong kho, hoặc quét mã hộp.</p>}
          {productId.length > 0 && packages.length === 0 && <p>Không còn hộp của sản phẩm này trong kho.</p>}
        </div>
        <aside className="cart-panel">
          <h3>ĐƠN HÀNG · {cart.length} hộp</h3>
          {validatingCart && <p role="status">Đang kiểm tra lại hộp trong giỏ…</p>}
          {cart.map((item) => <div className="cart-line" key={item.id}>
            <span>{item.product?.name ?? item.code}<br /><small>{formatWeight(item.actualWeight)}</small></span>
            <span>{formatMoney(item.sellingPrice)} <button aria-label={`Bỏ ${item.code}`} onClick={() => removeFromCart(item.id)}>×</button></span>
          </div>)}
          <p className="cart-total">{formatMoney(total)}</p>
          <div className="screen-actions">
            <button className="primary-button" disabled={busy || validatingCart || cart.length === 0} onClick={() => void checkout("CASH")}>TIỀN MẶT</button>
            <button className="secondary-button" disabled={busy || validatingCart || cart.length === 0} onClick={() => void checkout("TRANSFER")}>CHUYỂN KHOẢN</button>
          </div>
        </aside>
      </div>
    </ScreenCard>
  );
}

function StockInPage({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [presetId, setPresetId] = useState("");
  const [weight, setWeight] = useState("0.5");
  const [quantity, setQuantity] = useState(1);
  const [batches, setBatches] = useState<StockInBatch[]>([]);
  const [priceOverride, setPriceOverride] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getData<Product[]>(api, "/api/v1/products").then((items) => {
      if (active) { setProducts(items); if (items[0]) setProductId(items[0].id); }
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api]);

  const product = products.find((item) => item.id === productId);
  const preset = product?.presets.find((item) => item.id === presetId);
  const preview = product == null ? null : previewStockInPrice(product, preset, weight.replace(",", "."), priceOverride.trim().replace(",", "."));
  function pressKey(key: string) {
    setWeight((current) => key === "⌫" ? current.slice(0, -1) : key === "." && current.includes(".") ? current : `${current}${key}`);
  }
  function choosePreset(id: string) {
    setPresetId(id);
    const selected = product?.presets.find((item) => item.id === id);
    if (selected?.weight != null) setWeight(selected.weight);
  }

  function addWeightBatch() {
    if (product == null) return;
    const normalizedWeight = weight.trim().replace(",", ".");
    const parsed = previewStockInPrice(product, preset, normalizedWeight, priceOverride.trim().replace(",", "."));
    if (parsed.amount == null) { setError(parsed.error); return; }
    const stagedPackageCount = batches.reduce((sum, batch) => sum + batch.weights.length, 0);
    if (stagedPackageCount + quantity > 100) { setError("Mỗi lần thêm hàng tối đa 100 hộp. Hãy chia thành nhiều lần."); return; }
    setBatches((current) => [...current, {
      weights: Array.from({ length: quantity }, () => normalizedWeight),
      presetId: presetId.length === 0 ? null : presetId,
      priceOverride: priceOverride.trim().replace(",", "."),
    }]);
    setQuantity(1); setError(null);
  }

  function removeWeight(batchIndex: number, weightIndex: number) {
    setBatches((current) => current.flatMap((batch, index) => {
      if (index !== batchIndex) return [batch];
      const remainingWeights = batch.weights.filter((_, itemIndex) => itemIndex !== weightIndex);
      return remainingWeights.length === 0 ? [] : [{ ...batch, weights: remainingWeights }];
    }));
  }

  async function submit() {
    if (!product) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    const normalizedOverride = priceOverride.trim().replace(",", ".");
    const stockInBatches = batches.length > 0
      ? batches
      : [{ weights: Array.from({ length: quantity }, () => weight.trim().replace(",", ".")), presetId: presetId || null, priceOverride: normalizedOverride }];
    const lines = stockInBatches.map((batch) => {
      const common = { productId: product.id, ...(batch.presetId == null ? {} : { packagePresetId: batch.presetId }), weights: batch.weights };
      return product.pricingType === "WEIGHT_BASED"
        ? { ...common, pricingType: "WEIGHT_BASED" as const, ...(batch.priceOverride.length > 0 ? { pricePerUnitOverride: batch.priceOverride } : {}) }
        : { ...common, pricingType: "FIXED_PACKAGE" as const, ...(batch.priceOverride.length > 0 ? { fixedPriceOverride: batch.priceOverride } : {}) };
    });
    try {
      const result = await postData<StockInResult>(api, "/api/v1/stock-in", { note, lines });
      setNotice(`ĐÃ THÊM HÀNG · ${result.packageCount} hộp · ${formatWeight(result.totalWeight)} · ${result.session.code}`);
      setBatches([]); setPriceOverride("");
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return (
    <ScreenCard title="THÊM HÀNG VÀO KHO" onBack={onBack}>
      {notice != null && <p className="status-message">{notice}</p>}
      {error != null && <p className="error-message" role="alert">{error}</p>}
      <div className="toolbar">
        <label>Sản phẩm<select className="pos-select" value={productId} onChange={(event) => { setProductId(event.target.value); setPresetId(""); setBatches([]); setPriceOverride(""); }}>
          {products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Mẫu hộp<select className="pos-select" value={presetId} onChange={(event) => choosePreset(event.target.value)}>
          <option value="">Khối lượng khác</option>
          {product?.presets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>Số hộp<div className="screen-actions">
          <button className="secondary-button" onClick={() => setQuantity((value) => Math.max(1, value - 1))}>−</button>
          <strong className="large-number">{quantity}</strong>
          <button className="secondary-button" onClick={() => setQuantity((value) => Math.min(100, value + 1))}>+</button>
        </div></label>
      </div>
      <div className="toolbar">
        <label>Khối lượng mỗi hộp (kg)<output className="large-number">{weight || "0"} kg</output></label>
        <div className="keypad" aria-label="Bàn phím khối lượng">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "⌫"].map((key) => <button type="button" className="key-button" key={key} onClick={() => pressKey(key)}>{key}</button>)}
        </div>
      </div>
      {product && <div className="pricing-preview">
        <p>{preview?.amount != null ? `Giá dự kiến mỗi hộp: ${formatMoney(preview.amount)}` : preview?.error ?? "Chọn sản phẩm để xem giá."}</p>
        <label>{product.pricingType === "WEIGHT_BASED" ? "Giá/kg khác cho lô này (tùy chọn)" : "Giá/hộp khác cho lô này (tùy chọn)"}<input className="pos-input" inputMode="decimal" value={priceOverride} onChange={(event) => setPriceOverride(event.target.value)} /></label>
        <button type="button" className="secondary-button" onClick={addWeightBatch}>THÊM {quantity} HỘP CÂN NÀY VÀO DANH SÁCH</button>
        {batches.length > 0 && <><p>{batches.reduce((sum, batch) => sum + batch.weights.length, 0)} hộp đã sẵn sàng:</p><div className="package-grid">{batches.flatMap((batch, batchIndex) => batch.weights.map((item, weightIndex) => {
          const batchPreset = product.presets.find((row) => row.id === batch.presetId);
          const itemPreview = previewStockInPrice(product, batchPreset, item, batch.priceOverride);
          return <button type="button" className="package-button" key={`${batchIndex}-${weightIndex}`} onClick={() => removeWeight(batchIndex, weightIndex)}>{formatWeight(item)} · {itemPreview.amount == null ? "Lỗi giá" : formatMoney(itemPreview.amount)} · BỎ</button>;
        }))}</div><small>Giá, mẫu hộp và cân nặng đã lưu riêng theo từng dòng.</small></>}
      </div>}
      <label className="toolbar">Ghi chú<input className="pos-input" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
      {preset && <p>Mẫu đã chọn: {preset.name}{preset.fixedPrice ? ` · ${formatMoney(preset.fixedPrice)}` : ""}</p>}
      <button className="primary-button" disabled={busy || !product || weight.length === 0} onClick={() => void submit()}>
        {busy ? "ĐANG THÊM…" : `THÊM ${batches.length > 0 ? batches.reduce((sum, batch) => sum + batch.weights.length, 0) : quantity} HỘP VÀO KHO`}
      </button>
    </ScreenCard>
  );
}

function InventoryPage({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [productId, setProductId] = useState("");
  const [packages, setPackages] = useState<PackageItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [reason, setReason] = useState("HOME_USE");
  const [note, setNote] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    let active = true;
    void getData<InventoryItem[]>(api, "/api/v1/inventory/summary").then((rows) => {
      if (active) setItems(rows);
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api, reload]);

  useEffect(() => {
    let active = true;
    if (productId.length === 0) { setPackages([]); return () => { active = false; }; }
    void getData<{ items: PackageItem[] }>(api, `/api/v1/inventory/products/${productId}/packages`, { params: { status: "IN_STOCK", page: 1, pageSize: 100 } })
      .then((result) => { if (active) setPackages(result.items); })
      .catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api, productId, reload]);

  function togglePackage(id: string) {
    setConfirming(false);
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function adjustStock() {
    if (selectedIds.length === 0) return;
    if (!confirming) { setConfirming(true); return; }
    setBusy(true); setError(null); setNotice(null);
    try {
      const result = await postData<{ adjustedCount: number }>(api, "/api/v1/inventory/adjustments", { packageIds: selectedIds, reason, note });
      setSelectedIds([]); setNote(""); setConfirming(false); setReload((value) => value + 1);
      setNotice(`Đã điều chỉnh ${result.adjustedCount} hộp khỏi kho.`);
    } catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }

  return (
    <ScreenCard title="TỒN KHO" onBack={onBack}>
      {error != null && <p className="error-message" role="alert">{error}</p>}
      {notice != null && <p className="status-message">{notice}</p>}
      <div className="inventory-grid">
        {items.map((item) => <article className="inventory-card" key={item.id}>
          <h3>{item.name}</h3><p>{item.category.name}</p>
          <strong>{item.boxCount} hộp · {formatWeight(item.totalWeight)}</strong>
          <p>{formatMoney(item.totalValue)} trong kho</p>
          {item.isLowStock && <p className="error-message">Sắp hết hàng</p>}
          <button className="secondary-button" onClick={() => { setProductId(item.id); setSelectedIds([]); setConfirming(false); }}>CHỌN HỘP</button>
        </article>)}
      </div>
      {productId.length > 0 && <section className="inventory-adjustment">
        <h3>Điều chỉnh kho · {items.find((item) => item.id === productId)?.name}</h3>
        {packages.map((item) => <label className="admin-row" key={item.id}>
          <span><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => togglePackage(item.id)} /> {item.code} · {formatWeight(item.actualWeight)} · {formatMoney(item.sellingPrice)}</span>
        </label>)}
        {packages.length === 0 && <p>Không còn hộp để điều chỉnh.</p>}
        <div className="toolbar">
          <label>Lý do<select className="pos-select" value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="DAMAGED">Hư hỏng</option><option value="PACKAGING_TORN">Rách bao bì</option><option value="HOME_USE">Nhà dùng</option><option value="GIFT">Tặng</option><option value="WRONG_ENTRY">Nhập nhầm</option><option value="STOCKTAKE_DIFF">Lệch kiểm kê</option><option value="OTHER">Khác</option>
          </select></label>
          <label>Ghi chú<input className="pos-input" maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} /></label>
        </div>
        {confirming && <p role="alert" className="confirm-message">Bạn sắp đưa {selectedIds.length} hộp ra khỏi kho. Kiểm tra lý do và các mã hộp trước khi xác nhận.</p>}
        <div className="screen-actions">
          <button className="primary-button" disabled={busy || selectedIds.length === 0} onClick={() => void adjustStock()}>{busy ? "ĐANG CẬP NHẬT…" : confirming ? `XÁC NHẬN ĐIỀU CHỈNH ${selectedIds.length} HỘP` : `ĐIỀU CHỈNH ${selectedIds.length} HỘP`}</button>
          {confirming && <button className="secondary-button" onClick={() => setConfirming(false)}>QUAY LẠI</button>}
        </div>
      </section>}
      {items.length === 0 && error == null && <p>Chưa có sản phẩm trong danh mục.</p>}
    </ScreenCard>
  );
}

function RevenuePage({ api, onBack }: { api: AxiosInstance; onBack: () => void }) {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void getData<Dashboard>(api, "/api/v1/reports/dashboard").then((result) => {
      if (active) setDashboard(result);
    }).catch((cause: unknown) => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [api]);
  return (
    <ScreenCard title="DOANH THU HÔM NAY" onBack={onBack}>
      {error != null && <p className="error-message" role="alert">{error}</p>}
      {dashboard && <>
        <div className="inventory-grid">
          <article className="inventory-card"><h3>Doanh thu</h3><strong>{formatMoney(dashboard.revenue)}</strong></article>
          <article className="inventory-card"><h3>Đơn hàng</h3><strong>{dashboard.orderCount}</strong></article>
          <article className="inventory-card"><h3>Đã bán</h3><strong>{dashboard.boxCount} hộp</strong><p>{formatWeight(dashboard.totalWeight)}</p></article>
        </div>
        <h3>Sắp hết hàng</h3>
        {dashboard.lowStock.length === 0 ? <p>Chưa có sản phẩm sắp hết.</p> : dashboard.lowStock.map((item) => <p key={item.productId}>{item.productName} — {item.boxCount} hộp</p>)}
      </>}
    </ScreenCard>
  );
}

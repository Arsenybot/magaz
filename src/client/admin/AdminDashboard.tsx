import React, { useState, useEffect } from 'react';
import { api } from '../api.ts';
import { Product, Category, Order, StoreSettings, OrderStatus } from '../../core/types.ts';
import { OrderStateMachine } from '../../core/order-state-machine.ts';
import { triggerHaptic } from '../telegram.ts';
import {
  LayoutDashboard,
  Package,
  FolderTree,
  ShoppingBag,
  Users,
  Settings,
  Bell,
  Plus,
  Trash2,
  Edit,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Check,
  X,
} from 'lucide-react';

interface AdminDashboardProps {
  onBackToStore: () => void;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onBackToStore }) => {
  const [activeTab, setActiveTab] = useState<
    'dashboard' | 'products' | 'categories' | 'orders' | 'customers' | 'settings' | 'notifications'
  >('dashboard');

  const [stats, setStats] = useState<any>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Modals
  const [orderSearch, setOrderSearch] = useState('');
  const [orderStatusFilter, setOrderStatusFilter] = useState('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [editingProduct, setEditingProduct] = useState<(Partial<Omit<Product, 'variants'>> & { variants?: any[] }) | null>(null);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, prods, cats, ords, custs, sett, notifs] = await Promise.all([
        api.getAdminDashboard().catch(() => null),
        api.getAdminProducts().catch(() => []),
        api.getCategories().catch(() => []),
        api.getAdminOrders().catch(() => []),
        api.getAdminCustomers().catch(() => []),
        api.getStore().catch(() => null),
        api.getAdminNotifications().catch(() => []),
      ]);
      setStats(statsData);
      setProducts(prods);
      setCategories(cats);
      setOrders(ords);
      setCustomers(custs);
      setSettings(sett);
      setNotifications(notifs);
    } catch (err) {
      console.error('Failed to load admin data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleStatusChange = async (orderId: string, newStatus: string) => {
    try {
      const updated = await api.updateAdminOrderStatus(orderId, newStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
      triggerHaptic('medium');
    } catch (err: any) {
      alert(err.message || 'Ошибка обновления статуса');
    }
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;

    try {
      if (editingProduct.id) {
        await api.updateAdminProduct(editingProduct.id, editingProduct);
      } else {
        await api.createAdminProduct(editingProduct);
      }
      setEditingProduct(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения товара');
    }
  };

  const handleDeleteProduct = async (id: string) => {
    if (!confirm('Вы уверены, что хотите удалить товар?')) return;
    try {
      await api.deleteAdminProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления');
    }
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory) return;
    try {
      if (editingCategory.id) {
        await api.updateAdminCategory(editingCategory.id, editingCategory);
      } else {
        await api.createAdminCategory(editingCategory);
      }
      setEditingCategory(null);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения категории');
    }
  };

  const handleDeleteCategory = async (id: string) => {
    if (!confirm('Удалить категорию?')) return;
    try {
      await api.deleteAdminCategory(id);
      setCategories((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      alert(err.message || 'Ошибка удаления');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    try {
      const updated = await api.updateAdminSettings(settings);
      setSettings(updated);
      alert('Настройки успешно сохранены!');
    } catch (err: any) {
      alert(err.message || 'Ошибка сохранения настроек');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-100 flex flex-col pb-12">
      {/* Admin Top Navigation */}
      <header className="bg-neutral-900 text-white sticky top-0 z-40 border-b border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="font-serif font-bold text-lg tracking-tight text-white">ATELIER</span>
            <span className="text-xs bg-amber-400 text-neutral-950 font-bold px-2 py-0.5 rounded-md">
              ADMIN
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={loadData}
              title="Обновить данные"
              className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>

            <button
              onClick={onBackToStore}
              className="px-3 py-1.5 bg-white text-neutral-900 rounded-lg text-xs font-semibold hover:bg-neutral-200 transition-colors"
            >
              Вернуться в магазин
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto text-xs font-medium py-1 scrollbar-none">
          {[
            { id: 'dashboard', label: 'Дашборд', icon: LayoutDashboard },
            { id: 'products', label: 'Товары', icon: Package },
            { id: 'categories', label: 'Категории', icon: FolderTree },
            { id: 'orders', label: 'Заказы', icon: ShoppingBag },
            { id: 'customers', label: 'Клиенты', icon: Users },
            { id: 'settings', label: 'Настройки', icon: Settings },
            { id: 'notifications', label: 'Уведомления', icon: Bell },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-2 rounded-lg flex items-center gap-1.5 whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-neutral-800 text-amber-400 font-semibold'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-6xl mx-auto px-4 pt-6 w-full flex-1">
        {/* TAB 1: DASHBOARD */}
        {activeTab === 'dashboard' && stats && (
          <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
              <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
                <span className="text-xs text-neutral-500 font-medium">Выручка (Оплачено)</span>
                <div className="text-xl sm:text-2xl font-bold text-neutral-900 tabular-nums mt-1">
                  {(stats.totalRevenue || 0).toLocaleString('ru-RU')} ₽
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
                <span className="text-xs text-neutral-500 font-medium">Всего заказов</span>
                <div className="text-xl sm:text-2xl font-bold text-neutral-900 tabular-nums mt-1">
                  {stats.totalOrders}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
                <span className="text-xs text-neutral-500 font-medium">Оплаченных заказов</span>
                <div className="text-xl sm:text-2xl font-bold text-emerald-700 tabular-nums mt-1">
                  {stats.paidOrders}
                </div>
              </div>

              <div className="bg-white p-4 rounded-2xl border border-neutral-200 shadow-xs">
                <span className="text-xs text-neutral-500 font-medium">Ожидают оплаты</span>
                <div className="text-xl sm:text-2xl font-bold text-amber-600 tabular-nums mt-1">
                  {stats.pendingOrders}
                </div>
              </div>
            </div>

            {/* Low stock alerts (Requirement 17) */}
            {stats.lowStockVariants && stats.lowStockVariants.length > 0 && (
              <div className="bg-white rounded-2xl p-5 border border-amber-200 shadow-xs">
                <div className="flex items-center gap-2 text-amber-900 font-bold text-sm mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Товары с низким остатком на складе (&lt; 5 шт.)</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                  {stats.lowStockVariants.map((item: any) => (
                    <div
                      key={item.id}
                      className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-xl text-xs flex justify-between items-center"
                    >
                      <div>
                        <div className="font-semibold text-neutral-900 truncate max-w-[170px]">{item.product_name}</div>
                        <div className="text-neutral-500 text-[11px]">{item.name} ({item.sku})</div>
                      </div>
                      <span className="px-2 py-0.5 bg-amber-200 text-amber-900 font-bold rounded-md tabular-nums">
                        {item.stock_quantity} шт.
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recent Orders Overview */}
            <div className="bg-white rounded-2xl p-5 border border-neutral-200 shadow-xs">
              <h3 className="font-bold text-sm text-neutral-900 mb-3">Последние заказы</h3>
              <div className="divide-y divide-neutral-100 text-xs">
                {stats.recentOrders?.map((ord: Order) => (
                  <div key={ord.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <span className="font-bold text-neutral-900">#{ord.orderNumber}</span> · {ord.customerName}
                      <span className="text-neutral-400 block text-[11px]">
                        {new Date(ord.createdAt).toLocaleDateString('ru-RU')}
                      </span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold tabular-nums">{ord.total.toLocaleString('ru-RU')} ₽</div>
                      <span className="text-[10px] uppercase font-semibold text-neutral-500">{ord.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PRODUCTS */}
        {activeTab === 'products' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-neutral-900">Товары магазина ({products.length})</h2>
              <button
                onClick={() =>
                  setEditingProduct({
                    name: '',
                    slug: '',
                    description: '',
                    price: 2500,
                    categoryId: categories[0]?.id || '',
                    images: ['/src/assets/images/oversized_tee_1790542603531.jpg'],
                    variants: [
                      { name: 'Размер S', size: 'S', sku: 'NEW-S', stockQuantity: 10, status: 'ACTIVE' as const },
                      { name: 'Размер M', size: 'M', sku: 'NEW-M', stockQuantity: 15, status: 'ACTIVE' as const },
                      { name: 'Размер L', size: 'L', sku: 'NEW-L', stockQuantity: 10, status: 'ACTIVE' as const },
                    ],
                  })
                }
                className="px-3.5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Добавить товар</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {products.map((p) => (
                <div
                  key={p.id}
                  className="bg-white rounded-2xl p-4 border border-neutral-200 shadow-xs flex gap-3 text-xs"
                >
                  <img
                    src={p.images?.[0] || ''}
                    alt={p.name}
                    className="w-20 h-20 rounded-xl object-cover bg-neutral-100 shrink-0 border border-neutral-200/60"
                  />
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="text-[11px] text-neutral-400 uppercase font-semibold">
                        {p.categoryName || 'Категория'}
                      </div>
                      <h4 className="font-bold text-neutral-900 text-sm truncate">{p.name}</h4>
                      <div className="font-bold text-neutral-900 tabular-nums mt-0.5">
                        {p.price.toLocaleString('ru-RU')} ₽
                      </div>
                      <div className="text-neutral-500 mt-1">
                        Остаток по размерам: {p.variants?.map((v) => `${v.size}: ${v.stockQuantity}`).join(', ')}
                      </div>
                    </div>

                    <div className="flex gap-2 justify-end pt-2">
                      <button
                        onClick={() => setEditingProduct(p)}
                        className="px-2.5 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg flex items-center gap-1"
                      >
                        <Edit className="w-3.5 h-3.5" />
                        <span>Изменить</span>
                      </button>
                      <button
                        onClick={() => handleDeleteProduct(p.id)}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: CATEGORIES */}
        {activeTab === 'categories' && (
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-neutral-900">Категории ({categories.length})</h2>
              <button
                onClick={() =>
                  setEditingCategory({
                    name: '',
                    slug: '',
                    description: '',
                    image: '',
                    sortOrder: categories.length + 1,
                    active: true,
                  })
                }
                className="px-3.5 py-2 bg-neutral-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Создать категорию</span>
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs divide-y divide-neutral-100 text-xs">
              {categories.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-neutral-100 flex items-center justify-center font-bold text-neutral-700">
                      {c.sortOrder}
                    </div>
                    <div>
                      <div className="font-bold text-neutral-900 text-sm">{c.name}</div>
                      <div className="text-neutral-500 font-mono text-[11px]">{c.slug} · {c.description}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setEditingCategory(c)}
                      className="p-2 text-neutral-600 hover:text-neutral-950 rounded-lg hover:bg-neutral-100"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(c.id)}
                      className="p-2 text-rose-500 hover:text-rose-700 rounded-lg hover:bg-rose-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 justify-between items-start sm:items-center">
              <h2 className="text-base font-bold text-neutral-900">Заказы ({orders.length})</h2>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="text"
                  placeholder="Поиск по номеру / имени"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  className="bg-white border border-neutral-200 px-3 py-1.5 rounded-xl text-xs flex-1 sm:w-56"
                />

                <select
                  value={orderStatusFilter}
                  onChange={(e) => setOrderStatusFilter(e.target.value)}
                  className="bg-white border border-neutral-200 px-3 py-1.5 rounded-xl text-xs"
                >
                  <option value="">Все статусы</option>
                  <option value="NEW">NEW</option>
                  <option value="PAYMENT_PENDING">PAYMENT_PENDING</option>
                  <option value="PAID">PAID</option>
                  <option value="PROCESSING">PROCESSING</option>
                  <option value="READY">READY</option>
                  <option value="COMPLETED">COMPLETED</option>
                  <option value="CANCELLED">CANCELLED</option>
                  <option value="REFUNDED">REFUNDED</option>
                </select>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs divide-y divide-neutral-100 text-xs">
              {orders
                .filter((o) => (orderStatusFilter ? o.status === orderStatusFilter : true))
                .filter((o) =>
                  orderSearch
                    ? o.orderNumber.includes(orderSearch) ||
                      o.customerName.toLowerCase().includes(orderSearch.toLowerCase())
                    : true
                )
                .map((o) => (
                  <div
                    key={o.id}
                    onClick={() => setSelectedOrder(o)}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-neutral-50 cursor-pointer transition-colors"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-neutral-900 text-sm">Заказ #{o.orderNumber}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-neutral-100 text-neutral-800 border border-neutral-200">
                          {o.status}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                          o.paymentStatus === 'PAID' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {o.paymentStatus}
                        </span>
                      </div>
                      <div className="text-neutral-500 mt-1">
                        {o.customerName} ({o.customerPhone}) · {o.deliveryMethod === 'DELIVERY' ? 'Курьер' : 'Самовывоз'}
                      </div>
                    </div>

                    <div className="flex items-center gap-4 justify-between sm:justify-end">
                      <div className="text-right">
                        <div className="font-bold text-neutral-900 text-sm tabular-nums">
                          {o.total.toLocaleString('ru-RU')} ₽
                        </div>
                        <span className="text-[11px] text-neutral-400">
                          {new Date(o.createdAt).toLocaleDateString('ru-RU')}
                        </span>
                      </div>
                      <button className="px-3 py-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-lg font-medium">
                        Управление
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* TAB 5: CUSTOMERS */}
        {activeTab === 'customers' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-neutral-900">База покупателей ({customers.length})</h2>
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs divide-y divide-neutral-100 text-xs">
              {customers.map((c) => (
                <div key={c.id} className="p-4 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-neutral-900 text-sm">
                      {c.first_name} {c.last_name}
                      {c.username && <span className="text-neutral-500 font-normal ml-1">(@{c.username})</span>}
                    </div>
                    <div className="text-neutral-400 text-[11px] font-mono mt-0.5">
                      TG ID: {c.telegram_id} · Зарегистрирован: {new Date(c.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-neutral-900 tabular-nums text-sm">
                      {Number(c.total_spent || 0).toLocaleString('ru-RU')} ₽
                    </div>
                    <div className="text-neutral-500 text-[11px]">{c.orders_count} заказов</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 6: SETTINGS */}
        {activeTab === 'settings' && settings && (
          <form onSubmit={handleSaveSettings} className="bg-white rounded-2xl p-6 border border-neutral-200 shadow-xs max-w-xl space-y-4 text-xs">
            <h2 className="text-base font-bold text-neutral-900 mb-2">Настройки магазина</h2>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">Название магазина</label>
              <input
                type="text"
                value={settings.storeName}
                onChange={(e) => setSettings({ ...settings, storeName: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">Описание / Слоган</label>
              <input
                type="text"
                value={settings.description}
                onChange={(e) => setSettings({ ...settings, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Telegram поддержки</label>
                <input
                  type="text"
                  value={settings.contactTelegram}
                  onChange={(e) => setSettings({ ...settings, contactTelegram: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Телефон</label>
                <input
                  type="text"
                  value={settings.contactPhone}
                  onChange={(e) => setSettings({ ...settings, contactPhone: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Стоимость доставки (₽)</label>
                <input
                  type="number"
                  value={settings.deliveryPrice}
                  onChange={(e) => setSettings({ ...settings, deliveryPrice: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Порог бесплатной доставки (₽)</label>
                <input
                  type="number"
                  value={settings.freeDeliveryThreshold}
                  onChange={(e) => setSettings({ ...settings, freeDeliveryThreshold: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="mt-4 px-5 py-2.5 bg-neutral-950 text-white rounded-xl font-bold hover:bg-neutral-800 transition-colors shadow-xs"
            >
              Сохранить настройки
            </button>
          </form>
        )}

        {/* TAB 7: NOTIFICATIONS & AUDIT */}
        {activeTab === 'notifications' && (
          <div className="space-y-4">
            <h2 className="text-base font-bold text-neutral-900">Журнал уведомлений Telegram ({notifications.length})</h2>
            <div className="bg-white rounded-2xl border border-neutral-200 overflow-hidden shadow-xs divide-y divide-neutral-100 text-xs">
              {notifications.map((n) => (
                <div key={n.id} className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-neutral-900">{n.title}</span>
                    <span className="text-[11px] text-neutral-400 font-mono">
                      {new Date(n.created_at).toLocaleTimeString('ru-RU')}
                    </span>
                  </div>
                  <pre className="font-sans whitespace-pre-wrap text-neutral-600 bg-neutral-50 p-2.5 rounded-xl border border-neutral-100">
                    {n.message.replace(/<[^>]*>?/gm, '')}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Order Status Transition Modal */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-neutral-200 space-y-4">
            <div className="flex justify-between items-center">
              <div>
                <span className="text-xs text-neutral-400">Управление заказом</span>
                <h3 className="text-lg font-bold text-neutral-900">Заказ #{selectedOrder.orderNumber}</h3>
              </div>
              <button
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 rounded-full hover:bg-neutral-100"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <div className="p-3 bg-neutral-50 rounded-2xl text-xs space-y-1">
              <div><strong>Текущий статус:</strong> {selectedOrder.status}</div>
              <div><strong>Статус оплаты:</strong> {selectedOrder.paymentStatus} ({selectedOrder.paymentProvider})</div>
              <div><strong>Сумма:</strong> {selectedOrder.total.toLocaleString('ru-RU')} ₽</div>
              <div><strong>Покупатель:</strong> {selectedOrder.customerName} ({selectedOrder.customerPhone})</div>
            </div>

            {/* Allowed transitions via State Machine */}
            <div>
              <span className="text-xs font-bold text-neutral-900 block mb-2">
                Доступные переходы по стейт-машине:
              </span>
              <div className="flex flex-wrap gap-2">
                {OrderStateMachine.getAllowedNextStates(selectedOrder.status as OrderStatus).map((state) => (
                  <button
                    key={state}
                    onClick={() => handleStatusChange(selectedOrder.id, state)}
                    className="px-3 py-1.5 bg-neutral-950 text-white rounded-xl text-xs font-semibold hover:bg-neutral-800 transition-colors"
                  >
                    Перевести в {state}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {editingProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form
            onSubmit={handleSaveProduct}
            className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-neutral-200 space-y-4 text-xs"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-neutral-900">
                {editingProduct.id ? 'Редактировать товар' : 'Создать товар'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded-full hover:bg-neutral-100"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">Название товара *</label>
              <input
                type="text"
                required
                value={editingProduct.name || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Цена (₽) *</label>
                <input
                  type="number"
                  required
                  value={editingProduct.price || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, price: Number(e.target.value) })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Категория *</label>
                <select
                  value={editingProduct.categoryId || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, categoryId: e.target.value })}
                  className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">Описание</label>
              <textarea
                rows={2}
                value={editingProduct.description || ''}
                onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
              />
            </div>

            {/* Variants & Stock */}
            <div>
              <label className="block font-medium text-neutral-700 mb-1">Остатки по размерам (SKU & Stock)</label>
              <div className="space-y-2">
                {editingProduct.variants?.map((v, idx) => (
                  <div key={idx} className="flex items-center gap-2 bg-neutral-50 p-2 rounded-xl border border-neutral-200">
                    <span className="font-bold w-14">{v.size}</span>
                    <input
                      type="text"
                      placeholder="SKU"
                      value={v.sku}
                      onChange={(e) => {
                        const newVars = [...(editingProduct.variants || [])];
                        newVars[idx].sku = e.target.value;
                        setEditingProduct({ ...editingProduct, variants: newVars });
                      }}
                      className="w-24 px-2 py-1 bg-white border border-neutral-200 rounded text-xs"
                    />
                    <div className="flex items-center gap-1">
                      <span className="text-neutral-500">Склад:</span>
                      <input
                        type="number"
                        value={v.stockQuantity}
                        onChange={(e) => {
                          const newVars = [...(editingProduct.variants || [])];
                          newVars[idx].stockQuantity = Number(e.target.value);
                          setEditingProduct({ ...editingProduct, variants: newVars });
                        }}
                        className="w-16 px-2 py-1 bg-white border border-neutral-200 rounded text-xs font-bold"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-colors shadow-xs"
            >
              Сохранить товар
            </button>
          </form>
        </div>
      )}

      {/* Edit Category Modal */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <form
            onSubmit={handleSaveCategory}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-neutral-200 space-y-4 text-xs"
          >
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-neutral-900">
                {editingCategory.id ? 'Редактировать категорию' : 'Создать категорию'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="p-1 rounded-full hover:bg-neutral-100"
              >
                <X className="w-5 h-5 text-neutral-500" />
              </button>
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">Название категории *</label>
              <input
                type="text"
                required
                value={editingCategory.name || ''}
                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">Slug (URL)</label>
              <input
                type="text"
                value={editingCategory.slug || ''}
                onChange={(e) => setEditingCategory({ ...editingCategory, slug: e.target.value })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
              />
            </div>

            <div>
              <label className="block font-medium text-neutral-700 mb-1">Порядок сортировки</label>
              <input
                type="number"
                value={editingCategory.sortOrder ?? 1}
                onChange={(e) => setEditingCategory({ ...editingCategory, sortOrder: Number(e.target.value) })}
                className="w-full px-3 py-2 border border-neutral-200 rounded-xl"
              />
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-neutral-900 text-white rounded-xl font-bold hover:bg-neutral-800 transition-colors shadow-xs"
            >
              Сохранить категорию
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

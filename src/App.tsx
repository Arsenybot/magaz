/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { api } from './client/api.ts';
import { initTelegramApp, getTelegramInitData, triggerHaptic } from './client/telegram.ts';
import { StoreSettings, User, Category, Product, ProductVariant, Cart, Order, DeliveryMethod } from './core/types.ts';
import { SimulationBar } from './client/components/SimulationBar.tsx';
import { Navbar } from './client/components/Navbar.tsx';
import { ProductCard } from './client/components/ProductCard.tsx';
import { ProductDetailModal } from './client/components/ProductDetailModal.tsx';
import { CartDrawer } from './client/components/CartDrawer.tsx';
import { CheckoutModal } from './client/components/CheckoutModal.tsx';
import { MockPaymentModal } from './client/components/MockPaymentModal.tsx';
import { OrdersView } from './client/components/OrdersView.tsx';
import { AdminDashboard } from './client/admin/AdminDashboard.tsx';
import { Search, X, Sparkles, ShoppingBag } from 'lucide-react';

export default function App() {
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [activeView, setActiveView] = useState<'store' | 'orders' | 'admin'>('store');

  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<Cart | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [mockPaymentData, setMockPaymentData] = useState<{ order: Order; providerPaymentId?: string } | null>(null);

  // Initialize Telegram WebApp & User Auth
  useEffect(() => {
    initTelegramApp();

    const initData = getTelegramInitData();
    if (initData) {
      api.setInitData(initData);
      api
        .authTelegram(initData)
        .then((res) => {
          setCurrentUser(res.user);
          api.setUserId(res.user.id);
        })
        .catch(console.error);
    } else {
      // Default to demo buyer
      api
        .getMe()
        .then((user) => {
          setCurrentUser(user);
          api.setUserId(user.id);
        })
        .catch(() => {
          api.setUserId('user_buyer_1');
        });
    }

    // Load store & categories
    api.getStore().then(setStore).catch(console.error);
    api.getCategories().then(setCategories).catch(console.error);
  }, []);

  // Fetch cart whenever user changes
  useEffect(() => {
    if (currentUser) {
      api.getCart().then(setCart).catch(console.error);
    }
  }, [currentUser]);

  // Fetch products when category or search changes
  useEffect(() => {
    setLoadingProducts(true);
    api
      .getProducts(selectedCategory || undefined, searchQuery || undefined)
      .then(setProducts)
      .catch(console.error)
      .finally(() => setLoadingProducts(false));
  }, [selectedCategory, searchQuery]);

  // Switch between simulated test users
  const handleSwitchUser = (userType: 'CUSTOMER' | 'ADMIN' | 'CUSTOM', customId?: string) => {
    let targetId = 'user_buyer_1';
    if (userType === 'ADMIN') targetId = 'user_admin_1';
    if (userType === 'CUSTOM' && customId) targetId = customId;

    api.setUserId(targetId);
    api
      .getMe()
      .then((user) => {
        setCurrentUser(user);
        api.getCart().then(setCart).catch(console.error);
        if (user.role !== 'ADMIN' && activeView === 'admin') {
          setActiveView('store');
        }
      })
      .catch(console.error);
  };

  // Add to cart handler
  const handleAddToCart = async (product: Product, variant: ProductVariant, quantity: number) => {
    const updatedCart = await api.addToCart(product.id, variant.id, quantity);
    setCart(updatedCart);
  };

  // Update item quantity in cart
  const handleUpdateCartQuantity = async (itemId: string, quantity: number) => {
    const updatedCart = await api.updateCartItem(itemId, quantity);
    setCart(updatedCart);
  };

  // Remove item from cart
  const handleRemoveFromCart = async (itemId: string) => {
    const updatedCart = await api.removeFromCart(itemId);
    setCart(updatedCart);
  };

  // Checkout submission
  const handleSubmitOrder = async (orderData: {
    customerName: string;
    customerPhone: string;
    customerUsername: string;
    deliveryMethod: DeliveryMethod;
    deliveryAddress?: string;
    comment?: string;
    paymentProvider: string;
  }) => {
    const createdOrder = await api.createOrder(orderData);
    setIsCheckoutOpen(false);

    // Refresh cart (should be empty now)
    const emptyCart = await api.getCart();
    setCart(emptyCart);

    // Initialize payment
    const payment = await api.createPayment(createdOrder.id);

    if (payment.isTestMode || payment.provider === 'mock') {
      setMockPaymentData({
        order: createdOrder,
        providerPaymentId: payment.providerPaymentId,
      });
    } else if (payment.paymentUrl) {
      window.location.href = payment.paymentUrl;
    } else {
      setActiveView('orders');
    }
  };

  const handlePayExistingOrder = async (order: Order) => {
    try {
      const payment = await api.createPayment(order.id);
      if (payment.isTestMode || payment.provider === 'mock') {
        setMockPaymentData({
          order,
          providerPaymentId: payment.providerPaymentId,
        });
      } else if (payment.paymentUrl) {
        window.location.href = payment.paymentUrl;
      }
    } catch (err: any) {
      alert(err.message || 'Ошибка инициализации оплаты');
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col font-sans text-neutral-900 selection:bg-neutral-900 selection:text-white">
      {/* Simulation & Tester Bar */}
      <SimulationBar
        currentUser={currentUser}
        onSwitchUser={handleSwitchUser}
        activeView={activeView}
        onChangeView={setActiveView}
      />

      {/* Admin Panel View */}
      {activeView === 'admin' ? (
        <AdminDashboard onBackToStore={() => setActiveView('store')} />
      ) : (
        <>
          {/* Main Top Navigation */}
          <Navbar
            storeName={store?.storeName || 'ATELIER'}
            cartCount={cart?.itemsCount || 0}
            activeView={activeView}
            onChangeView={setActiveView}
            onOpenCart={() => setIsCartOpen(true)}
          />

          {/* Main Store View */}
          {activeView === 'store' && (
            <main className="max-w-4xl mx-auto px-4 py-5 w-full flex-1 space-y-6">
              {/* Campaign Editorial Hero */}
              <section className="relative overflow-hidden rounded-3xl bg-neutral-950 text-white p-6 sm:p-8 flex flex-col justify-end min-h-[160px] sm:min-h-[190px]">
                <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/60 to-transparent z-10" />
                <img
                  src="/src/assets/images/oversized_tee_1790542603531.jpg"
                  alt="Atelier Campaign"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 w-full h-full object-cover object-center opacity-40 scale-105"
                />
                <div className="relative z-20 space-y-1 max-w-md">
                  <div className="text-[11px] font-semibold uppercase tracking-widest text-neutral-300">
                    Осенняя коллекция '26
                  </div>
                  <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
                    Архитектурный крой и натуральный хлопок
                  </h1>
                </div>
              </section>

              {/* Search & Category Interactive Filter Tabs */}
              <div className="space-y-3">
                {/* Search Bar */}
                <div className="relative flex items-center">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3.5" />
                  <input
                    type="text"
                    placeholder="Поиск по названию или описанию..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full min-h-[44px] pl-10 pr-9 py-2.5 rounded-2xl bg-white border border-neutral-200 text-sm focus:outline-none focus:border-neutral-900 focus:ring-1 focus:ring-neutral-900 transition-all shadow-2xs"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 text-neutral-400 hover:text-neutral-700 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Horizontal Category Segmented Controls */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  <button
                    onClick={() => {
                      triggerHaptic('light');
                      setSelectedCategory(null);
                    }}
                    className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                      selectedCategory === null
                        ? 'bg-neutral-950 text-white shadow-xs'
                        : 'bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200/80'
                    }`}
                  >
                    Все товары
                  </button>

                  {categories.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => {
                        triggerHaptic('light');
                        setSelectedCategory(cat.id);
                      }}
                      className={`min-h-[38px] px-4 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                        selectedCategory === cat.id
                          ? 'bg-neutral-950 text-white shadow-xs'
                          : 'bg-white hover:bg-neutral-100 text-neutral-600 border border-neutral-200/80'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Products Grid */}
              <section aria-label="Каталог товаров">
                {loadingProducts ? (
                  <div className="py-20 text-center text-neutral-400">
                    <ShoppingBag className="w-8 h-8 mx-auto animate-bounce opacity-40 mb-2" />
                    <p className="text-xs">Загрузка товаров...</p>
                  </div>
                ) : products.length === 0 ? (
                  <div className="py-16 text-center bg-white rounded-3xl border border-neutral-200 p-6">
                    <ShoppingBag className="w-10 h-10 mx-auto text-neutral-300 mb-2 stroke-[1.5]" />
                    <p className="text-sm font-semibold text-neutral-800">Товары не найдены</p>
                    <p className="text-xs text-neutral-500 mt-1">Попробуйте изменить категорию или поисковый запрос.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                    {products.map((product) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        onSelect={(p) => setSelectedProduct(p)}
                      />
                    ))}
                  </div>
                )}
              </section>
            </main>
          )}

          {/* Orders Tracking View */}
          {activeView === 'orders' && (
            <main className="flex-1">
              <OrdersView
                onBackToCatalog={() => setActiveView('store')}
                onPayOrder={handlePayExistingOrder}
              />
            </main>
          )}
        </>
      )}

      {/* Product Detail Modal */}
      <ProductDetailModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onAddToCart={handleAddToCart}
      />

      {/* Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        cart={cart}
        deliveryThreshold={store?.freeDeliveryThreshold || 5000}
        onClose={() => setIsCartOpen(false)}
        onUpdateQuantity={handleUpdateCartQuantity}
        onRemoveItem={handleRemoveFromCart}
        onCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        cart={cart}
        currentUser={currentUser}
        deliveryPrice={store?.deliveryPrice || 350}
        freeDeliveryThreshold={store?.freeDeliveryThreshold || 5000}
        onClose={() => setIsCheckoutOpen(false)}
        onSubmitOrder={handleSubmitOrder}
      />

      {/* Mock Sandbox Payment Simulator */}
      {mockPaymentData && (
        <MockPaymentModal
          order={mockPaymentData.order}
          providerPaymentId={mockPaymentData.providerPaymentId}
          onClose={() => setMockPaymentData(null)}
          onPaymentSuccess={() => {
            setMockPaymentData(null);
            setActiveView('orders');
          }}
        />
      )}
    </div>
  );
}

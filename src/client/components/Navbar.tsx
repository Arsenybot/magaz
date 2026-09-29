import React from 'react';
import { ShoppingBag, Package } from 'lucide-react';
import { triggerHaptic } from '../telegram.ts';

interface NavbarProps {
  storeName: string;
  cartCount: number;
  activeView: 'store' | 'orders' | 'admin';
  onChangeView: (view: 'store' | 'orders' | 'admin') => void;
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  storeName,
  cartCount,
  activeView,
  onChangeView,
  onOpenCart,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-neutral-200">
      <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => {
            triggerHaptic('light');
            onChangeView('store');
          }}
          className="text-left group cursor-pointer"
        >
          <span className="font-serif tracking-tight text-xl font-bold text-neutral-900 group-hover:text-neutral-700 transition-colors">
            {storeName || 'ATELIER'}
          </span>
        </button>

        {/* Zone 2: Navigation Links */}
        <nav className="flex items-center gap-5 text-sm font-medium text-neutral-600">
          <button
            onClick={() => {
              triggerHaptic('light');
              onChangeView('store');
            }}
            className={`transition-colors py-1 ${
              activeView === 'store'
                ? 'text-neutral-950 font-semibold border-b-2 border-neutral-950'
                : 'hover:text-neutral-950'
            }`}
          >
            Каталог
          </button>

          <button
            onClick={() => {
              triggerHaptic('light');
              onChangeView('orders');
            }}
            className={`transition-colors py-1 flex items-center gap-1.5 ${
              activeView === 'orders'
                ? 'text-neutral-950 font-semibold border-b-2 border-neutral-950'
                : 'hover:text-neutral-950'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Заказы</span>
          </button>
        </nav>

        {/* Zone 3: Primary Action - Cart button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              triggerHaptic('medium');
              onOpenCart();
            }}
            aria-label={`Корзина (${cartCount} товаров)`}
            className="relative min-h-[44px] min-w-[44px] flex items-center justify-center p-2 rounded-xl text-neutral-900 hover:bg-neutral-100 transition-colors"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartCount > 0 && (
              <span className="absolute top-1.5 right-1.5 bg-neutral-900 text-white text-[11px] font-semibold w-5 h-5 rounded-full flex items-center justify-center tabular-nums">
                {cartCount > 99 ? '99+' : cartCount}
              </span>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};

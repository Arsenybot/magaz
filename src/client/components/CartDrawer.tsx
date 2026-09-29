import React from 'react';
import { Cart, CartItem } from '../../core/types.ts';
import { triggerHaptic } from '../telegram.ts';
import { X, Trash2, Minus, Plus, ArrowRight, ShoppingBag } from 'lucide-react';

interface CartDrawerProps {
  isOpen: boolean;
  cart: Cart | null;
  deliveryThreshold: number;
  onClose: () => void;
  onUpdateQuantity: (itemId: string, quantity: number) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onCheckout: () => void;
}

export const CartDrawer: React.FC<CartDrawerProps> = ({
  isOpen,
  cart,
  deliveryThreshold,
  onClose,
  onUpdateQuantity,
  onRemoveItem,
  onCheckout,
}) => {
  if (!isOpen) return null;

  const items = cart?.items || [];
  const subtotal = cart?.subtotal || 0;
  const freeDeliveryRemaining = Math.max(0, deliveryThreshold - subtotal);
  const progressPercent = Math.min(100, Math.round((subtotal / deliveryThreshold) * 100));

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="w-full max-w-md h-full flex flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drawer Header */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-neutral-100 shrink-0">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-neutral-900" />
            <h2 className="text-base font-bold text-neutral-900">Корзина</h2>
            <span className="text-xs text-neutral-500 tabular-nums">
              ({cart?.itemsCount || 0})
            </span>
          </div>

          <button
            onClick={() => {
              triggerHaptic('light');
              onClose();
            }}
            aria-label="Закрыть корзину"
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Free Delivery Bar */}
        {subtotal > 0 && (
          <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-100 shrink-0">
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-neutral-600 font-medium">
                {freeDeliveryRemaining > 0 ? (
                  <>До бесплатной доставки: <strong className="text-neutral-900 font-bold tabular-nums">{freeDeliveryRemaining.toLocaleString('ru-RU')} ₽</strong></>
                ) : (
                  <span className="text-emerald-700 font-semibold">🎉 Бесплатная доставка активна!</span>
                )}
              </span>
              <span className="text-neutral-400 tabular-nums font-mono">{progressPercent}%</span>
            </div>
            <div className="w-full h-1.5 bg-neutral-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-neutral-900 transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Cart Items List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 divide-y divide-neutral-100">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-neutral-400">
              <ShoppingBag className="w-12 h-12 mb-3 stroke-[1.5] text-neutral-300" />
              <p className="text-sm font-medium text-neutral-600">Ваша корзина пуста</p>
              <p className="text-xs text-neutral-400 mt-1 max-w-[200px]">
                Выберите товары в каталоге, укажите нужный размер и вернитесь к заказу.
              </p>
              <button
                onClick={onClose}
                className="mt-4 px-4 py-2 bg-neutral-900 text-white rounded-xl text-xs font-semibold hover:bg-neutral-800 transition-colors"
              >
                Перейти в каталог
              </button>
            </div>
          ) : (
            items.map((item: CartItem) => {
              const image = item.product?.images?.[0];
              return (
                <div key={item.id} className="py-3.5 flex gap-3 items-center">
                  {/* Thumbnail */}
                  <div className="w-16 h-16 rounded-xl bg-neutral-100 overflow-hidden shrink-0 border border-neutral-200/60">
                    {image ? (
                      <img
                        src={image}
                        alt={item.product?.name || ''}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-300">
                        <ShoppingBag className="w-6 h-6" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-bold text-neutral-900 truncate">
                      {item.product?.name || 'Товар'}
                    </h3>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      Размер: <span className="font-semibold text-neutral-800">{item.variant?.size || '—'}</span>
                    </div>
                    <div className="text-xs font-bold text-neutral-900 tabular-nums mt-1">
                      {item.unitPrice.toLocaleString('ru-RU')} ₽
                    </div>
                  </div>

                  {/* Quantity Stepper & Delete */}
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        triggerHaptic('light');
                        onRemoveItem(item.id);
                      }}
                      aria-label="Удалить товар"
                      className="min-h-[44px] min-w-[44px] flex items-center justify-center text-neutral-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>

                    <div className="flex items-center border border-neutral-200 rounded-lg overflow-hidden bg-neutral-50">
                      <button
                        onClick={() => {
                          triggerHaptic('light');
                          onUpdateQuantity(item.id, item.quantity - 1);
                        }}
                        aria-label="Уменьшить"
                        className="min-h-[32px] min-w-[32px] flex items-center justify-center text-neutral-600 hover:bg-neutral-200"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-7 text-center font-bold text-xs text-neutral-900 tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => {
                          triggerHaptic('light');
                          onUpdateQuantity(item.id, item.quantity + 1);
                        }}
                        disabled={item.quantity >= item.availableStock}
                        aria-label="Увеличить"
                        className="min-h-[32px] min-w-[32px] flex items-center justify-center text-neutral-600 hover:bg-neutral-200 disabled:opacity-30"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom Total & Checkout Button */}
        {items.length > 0 && (
          <div className="p-4 border-t border-neutral-100 bg-white shrink-0 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500 font-medium">Товары ({cart?.itemsCount})</span>
              <span className="font-bold text-neutral-900 tabular-nums text-base">
                {subtotal.toLocaleString('ru-RU')} ₽
              </span>
            </div>

            <button
              onClick={() => {
                triggerHaptic('medium');
                onCheckout();
              }}
              className="w-full min-h-[50px] px-6 py-3 bg-neutral-950 text-white rounded-2xl font-bold text-sm hover:bg-neutral-800 transition-all shadow-md flex items-center justify-center gap-2 active:scale-[0.99]"
            >
              <span>Перейти к оформлению</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
